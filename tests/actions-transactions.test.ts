/**
 * MoneMoni — the transaction Server Actions (`lib/actions/transactions.ts`).
 *
 * The request scope is mocked, not the logic: `next/headers` becomes an
 * in-memory cookie jar and `next/navigation`'s `redirect()` throws a marked
 * error, exactly as `tests/actions-auth.test.ts` does. The real
 * `createSession()` / `requireSession()` code runs against the real test
 * database.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions"
import { hashPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { accounts, transactions } from "@/lib/db/schema"

import { insertAccount, insertCategory, insertUser, resetDatabase } from "./setup/db"

const { cookieStore } = vi.hoisted(() => {
  interface StoredCookie {
    name: string
    value: string
    options?: Record<string, unknown>
  }

  const cookies = new Map<string, StoredCookie>()

  return {
    cookieStore: {
      get: (name: string): StoredCookie | undefined => cookies.get(name),
      getAll: (): StoredCookie[] => [...cookies.values()],
      has: (name: string): boolean => cookies.has(name),
      set: (name: string, value: string, options?: Record<string, unknown>): void => {
        cookies.set(name, { name, value, options })
      },
      delete: (name: string): void => {
        cookies.delete(name)
      },
      clear: (): void => {
        cookies.clear()
      },
    },
  }
})

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}))

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

const CASH = "acct-cash"
const BANK = "acct-bank"
const FOOD = "cat-food"
const SALARY = "cat-salary"

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}

/** An expense form, overridable per test. */
function expenseForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    type: "expense",
    amount: "125.50",
    date: "2026-10-05",
    time: "12:30",
    accountId: CASH,
    categoryId: FOOD,
    toAccountId: "",
    note: "Lunch",
    ...overrides,
  })
}

/** Inserts the fixtures and signs the single user in. */
async function authenticate(): Promise<void> {
  await insertUser("user-1", await hashPassword("correct-horse"))
  await insertAccount({ id: CASH, name: "Cash", type: "cash", sortOrder: 0 })
  await insertAccount({ id: BANK, name: "Bank", type: "bank", sortOrder: 1 })
  await insertCategory({ id: FOOD, name: "Food", kind: "expense", icon: "🍔", color: "#f97316" })
  await insertCategory({ id: SALARY, name: "Salary", kind: "income", icon: "💼", color: "#22c55e" })

  await createSession("user-1")
}

beforeEach(async () => {
  await resetDatabase()
  cookieStore.clear()
})

describe("without a session", () => {
  it("redirects every action to the login page instead of writing", async () => {
    await resetDatabase()
    await insertAccount({ id: CASH, name: "Cash", type: "cash" })
    await insertCategory({ id: FOOD, name: "Food", kind: "expense" })

    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/login")

    expect(await db.select().from(transactions)).toHaveLength(0)
  })
})

describe("createTransaction", () => {
  it("stores an expense and redirects to the list", async () => {
    await authenticate()

    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const rows = await db.select().from(transactions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: "expense",
      amount: 12550,
      date: "2026-10-05",
      time: "12:30",
      accountId: CASH,
      categoryId: FOOD,
      toAccountId: null,
      note: "Lunch",
    })
  })

  it("stores a record without a time", async () => {
    await authenticate()

    await expect(createTransaction(expenseForm({ time: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/transactions",
    )

    const rows = await db.select().from(transactions)
    expect(rows[0].time).toBeNull()
  })

  it("rejects an impossible time", async () => {
    await authenticate()

    const result = await createTransaction(expenseForm({ time: "25:00" }))

    expect(result.code).toBe("time-invalid")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("stores an income", async () => {
    await authenticate()

    await expect(
      createTransaction(expenseForm({ type: "income", categoryId: SALARY, note: "Salary" })),
    ).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const rows = await db.select().from(transactions)
    expect(rows[0].type).toBe("income")
    expect(rows[0].categoryId).toBe(SALARY)
  })

  it("stores a transfer with no category", async () => {
    await authenticate()

    await expect(
      createTransaction(
        expenseForm({ type: "transfer", categoryId: "", toAccountId: BANK, note: "Move" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const rows = await db.select().from(transactions)
    expect(rows[0].type).toBe("transfer")
    expect(rows[0].categoryId).toBeNull()
    expect(rows[0].toAccountId).toBe(BANK)
  })

  it("rejects a transaction whose category kind disagrees with its type", async () => {
    await authenticate()

    const result = await createTransaction(expenseForm({ type: "income", categoryId: FOOD }))

    expect(result.code).toBe("category-kind-mismatch")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("rejects an unknown account", async () => {
    await authenticate()

    const result = await createTransaction(expenseForm({ accountId: "no-such-account" }))

    expect(result.code).toBe("account-invalid")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("rejects an unknown category", async () => {
    await authenticate()

    const result = await createTransaction(expenseForm({ categoryId: "no-such-category" }))

    expect(result.code).toBe("category-invalid")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("rejects an unknown destination account on a transfer", async () => {
    await authenticate()

    const result = await createTransaction(
      expenseForm({ type: "transfer", categoryId: "", toAccountId: "no-such-account" }),
    )

    expect(result.code).toBe("to-account-invalid")
  })

  it("rejects a transfer to the same account", async () => {
    await authenticate()

    const result = await createTransaction(
      expenseForm({ type: "transfer", categoryId: "", toAccountId: CASH }),
    )

    expect(result.code).toBe("to-account-same")
  })

  it("accepts an archived account, which still holds ledger history", async () => {
    await authenticate()

    // Archive the account the record belongs to.
    await db.update(accounts).set({ archived: true }).where(eq(accounts.id, CASH))

    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/transactions")

    expect(await db.select().from(transactions)).toHaveLength(1)
  })

  it("returns a validation failure code without writing", async () => {
    await authenticate()

    const result = await createTransaction(expenseForm({ amount: "abc" }))

    expect(result.code).toBe("amount-invalid")
    expect(await db.select().from(transactions)).toHaveLength(0)
  })
})

describe("updateTransaction", () => {
  it("rewrites the fields and bumps updatedAt", async () => {
    await authenticate()
    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const [created] = await db.select().from(transactions)

    await expect(
      updateTransaction(
        created.id,
        expenseForm({ amount: "99.99", note: "Corrected", date: "2026-10-06" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const [updated] = await db.select().from(transactions)
    expect(updated.id).toBe(created.id)
    expect(updated.amount).toBe(9999)
    expect(updated.note).toBe("Corrected")
    expect(updated.date).toBe("2026-10-06")
    expect(updated.updatedAt).toBeGreaterThanOrEqual(updated.createdAt)
  })

  it("redirects to the list for an unknown id", async () => {
    await authenticate()

    await expect(updateTransaction("no-such-id", expenseForm())).rejects.toThrow(
      "NEXT_REDIRECT:/transactions",
    )
  })

  it("leaves the row untouched when validation fails", async () => {
    await authenticate()
    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const [created] = await db.select().from(transactions)
    const result = await updateTransaction(created.id, expenseForm({ amount: "1,23" }))

    expect(result.code).toBe("amount-invalid")

    const [unchanged] = await db.select().from(transactions)
    expect(unchanged.amount).toBe(created.amount)
  })
})

describe("deleteTransaction", () => {
  it("removes the row and redirects to the list", async () => {
    await authenticate()
    await expect(createTransaction(expenseForm())).rejects.toThrow("NEXT_REDIRECT:/transactions")

    const [created] = await db.select().from(transactions)

    await expect(deleteTransaction(created.id, new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/transactions",
    )

    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("redirects to the list for an unknown id", async () => {
    await authenticate()

    await expect(deleteTransaction("no-such-id", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/transactions",
    )
  })
})
