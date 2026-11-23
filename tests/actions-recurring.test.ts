/**
 * MoneMoni — recurring bill Server Actions (`lib/actions/recurring.ts`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import {
  createRecurringBill,
  deleteRecurringBill,
  postRecurringBill,
  toggleRecurringBill,
  updateRecurringBill,
} from "@/lib/actions/recurring"
import { hashPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { daysInMonth, monthKey } from "@/lib/dates"
import { db } from "@/lib/db/client"
import { accounts, categories, recurringBills, transactions } from "@/lib/db/schema"

import {
  insertAccount,
  insertCategory,
  insertRecurringBill,
  insertTransaction,
  insertUser,
  resetDatabase,
} from "./setup/db"

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

const BANK = "acct-bank"
const CASH = "acct-cash"
const UTILITIES = "cat-utilities"
const SALARY = "cat-salary"

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}

function recurringForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    name: "Fiber Internet",
    amount: "1,899.00",
    frequency: "monthly",
    dayOfMonth: "15",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    accountId: BANK,
    categoryId: UTILITIES,
    ...overrides,
  })
}

async function authenticate(): Promise<void> {
  await insertUser("user-1", await hashPassword("correct-horse"))
  await insertAccount({ id: BANK, name: "Bank Account", type: "bank", sortOrder: 0 })
  await insertAccount({ id: CASH, name: "Cash Wallet", type: "cash", sortOrder: 1 })
  await insertCategory({
    id: UTILITIES,
    name: "Utilities",
    kind: "expense",
    icon: "💡",
    color: "#eab308",
  })
  await insertCategory({
    id: SALARY,
    name: "Salary",
    kind: "income",
    icon: "💼",
    color: "#22c55e",
  })

  await createSession("user-1")
}

beforeEach(async () => {
  await resetDatabase()
  cookieStore.clear()
})

describe("recurring actions without a session", () => {
  it("redirects every action to /login", async () => {
    await resetDatabase()

    await expect(createRecurringBill(recurringForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(updateRecurringBill("bill-1", recurringForm())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    await expect(deleteRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    await expect(toggleRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
  })
})

describe("createRecurringBill", () => {
  it("creates a recurring bill and redirects to /recurring", async () => {
    await authenticate()

    await expect(createRecurringBill(recurringForm())).rejects.toThrow("NEXT_REDIRECT:/recurring")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Fiber Internet",
      amount: 189900,
      frequency: "monthly",
      dayOfMonth: 15,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      accountId: BANK,
      categoryId: UTILITIES,
      active: true,
      lastMaterialized: null,
    })
  })

  it("creates a recurring bill without optional category and end date", async () => {
    await authenticate()

    await expect(
      createRecurringBill(recurringForm({ categoryId: "", endDate: "" })),
    ).rejects.toThrow("NEXT_REDIRECT:/recurring")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(1)
    expect(rows[0].categoryId).toBeNull()
    expect(rows[0].endDate).toBeNull()
  })

  it("returns validation failure without writing to database", async () => {
    await authenticate()

    const result = await createRecurringBill(recurringForm({ name: "" }))
    expect(result.code).toBe("name-required")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(0)
  })

  it("returns account-invalid for unknown account", async () => {
    await authenticate()

    const result = await createRecurringBill(recurringForm({ accountId: "no-such-account" }))
    expect(result.code).toBe("account-invalid")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(0)
  })

  it("returns category-invalid for unknown category", async () => {
    await authenticate()

    const result = await createRecurringBill(recurringForm({ categoryId: "no-such-category" }))
    expect(result.code).toBe("category-invalid")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(0)
  })

  it("rejects an income category because bills are expenses", async () => {
    await authenticate()

    const result = await createRecurringBill(recurringForm({ categoryId: SALARY }))
    expect(result.code).toBe("category-invalid")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(0)
  })

  it("accepts archived account and archived expense category", async () => {
    await authenticate()

    await db.update(accounts).set({ archived: true }).where(eq(accounts.id, BANK))
    await db.update(categories).set({ archived: true }).where(eq(categories.id, UTILITIES))

    await expect(createRecurringBill(recurringForm())).rejects.toThrow("NEXT_REDIRECT:/recurring")

    const rows = await db.select().from(recurringBills)
    expect(rows).toHaveLength(1)
  })
})

describe("updateRecurringBill", () => {
  it("redirects to /recurring when bill does not exist", async () => {
    await authenticate()

    await expect(updateRecurringBill("non-existent", recurringForm())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
  })

  it("updates bill fields while preserving active status and lastMaterialized", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Old Bill",
      amount: 100000,
      accountId: BANK,
      categoryId: UTILITIES,
      frequency: "monthly",
      dayOfMonth: 1,
      startDate: "2026-01-01",
      active: true,
      lastMaterialized: "2026-05",
    })

    await expect(
      updateRecurringBill(
        "bill-1",
        recurringForm({
          name: "Updated Fiber",
          amount: "2,099.00",
          dayOfMonth: "20",
          frequency: "yearly",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/recurring")

    const [row] = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(row.name).toBe("Updated Fiber")
    expect(row.amount).toBe(209900)
    expect(row.dayOfMonth).toBe(20)
    expect(row.frequency).toBe("yearly")
    expect(row.active).toBe(true)
    expect(row.lastMaterialized).toBe("2026-05")
  })

  it("returns validation failure and does not update row", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Initial Name",
      amount: 100000,
      accountId: BANK,
      categoryId: UTILITIES,
    })

    const result = await updateRecurringBill("bill-1", recurringForm({ amount: "-50" }))
    expect(result.code).toBe("amount-not-positive")

    const [row] = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(row.name).toBe("Initial Name")
    expect(row.amount).toBe(100000)
  })

  it("returns account-invalid or category-invalid on update with invalid refs", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Bill",
      amount: 100000,
      accountId: BANK,
    })

    const badAcct = await updateRecurringBill(
      "bill-1",
      recurringForm({ accountId: "non-existent" }),
    )
    expect(badAcct.code).toBe("account-invalid")

    const badCat = await updateRecurringBill("bill-1", recurringForm({ categoryId: SALARY }))
    expect(badCat.code).toBe("category-invalid")
  })
})

describe("deleteRecurringBill", () => {
  it("redirects to /recurring when deleting non-existent bill", async () => {
    await authenticate()

    await expect(deleteRecurringBill("no-such-bill", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
  })

  it("deletes the bill and sets recurringId to null on associated transactions", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Water Bill",
      amount: 50000,
      accountId: BANK,
      categoryId: UTILITIES,
    })

    await insertTransaction({
      id: "txn-1",
      date: "2026-05-15",
      type: "expense",
      amount: 50000,
      accountId: BANK,
      categoryId: UTILITIES,
      note: "Water Bill",
    })
    // Link recurring bill to txn
    await db.update(transactions).set({ recurringId: "bill-1" }).where(eq(transactions.id, "txn-1"))

    await expect(deleteRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )

    const bills = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(bills).toHaveLength(0)

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-1"))
    expect(txn.recurringId).toBeNull()
  })
})

describe("toggleRecurringBill", () => {
  it("redirects to /recurring when bill does not exist", async () => {
    await authenticate()

    await expect(toggleRecurringBill("no-such-bill", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
  })

  it("toggles active from true to false and back to true", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Streaming Service",
      amount: 54900,
      accountId: BANK,
      active: true,
    })

    await expect(toggleRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
    let [row] = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(row.active).toBe(false)

    await expect(toggleRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
    ;[row] = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(row.active).toBe(true)
  })
})

describe("postRecurringBill", () => {
  it("redirects to /recurring when bill does not exist", async () => {
    await authenticate()

    await expect(postRecurringBill("no-such-bill", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring",
    )
  })

  it("refuses to post when the bill is paused / inactive", async () => {
    await authenticate()
    await insertRecurringBill({
      id: "bill-1",
      name: "Gym",
      amount: 250000,
      accountId: BANK,
      active: false,
    })

    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?error=bill-inactive",
    )
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("refuses to post when a monthly bill has already been logged this month", async () => {
    await authenticate()
    const currentMonth = monthKey(new Date())

    await insertRecurringBill({
      id: "bill-1",
      name: "Electricity",
      amount: 350000,
      accountId: BANK,
      frequency: "monthly",
      active: true,
      lastMaterialized: currentMonth,
    })

    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?error=already-logged",
    )
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("refuses to post when a yearly bill has already been logged this month", async () => {
    await authenticate()
    const currentMonth = monthKey(new Date())

    await insertRecurringBill({
      id: "bill-1",
      name: "Domain Registration",
      amount: 120000,
      accountId: BANK,
      frequency: "yearly",
      active: true,
      lastMaterialized: currentMonth,
    })

    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?error=already-logged",
    )
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  it("posts a monthly bill, creates expense transaction, and records lastMaterialized", async () => {
    await authenticate()
    const now = new Date()
    const currentMonth = monthKey(now)

    await insertRecurringBill({
      id: "bill-1",
      name: "Water Utility",
      amount: 45000,
      accountId: BANK,
      categoryId: UTILITIES,
      frequency: "monthly",
      dayOfMonth: 10,
      active: true,
      lastMaterialized: null,
    })

    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?logged=1",
    )

    const txns = await db.select().from(transactions)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({
      type: "expense",
      amount: 45000,
      accountId: BANK,
      categoryId: UTILITIES,
      note: "Water Utility",
      recurringId: "bill-1",
      date: `${currentMonth}-10`,
    })

    const [bill] = await db.select().from(recurringBills).where(eq(recurringBills.id, "bill-1"))
    expect(bill.lastMaterialized).toBe(currentMonth)
  })

  it("clamps the date to the end of the month when dayOfMonth exceeds month length", async () => {
    await authenticate()
    const now = new Date()
    const currentMonth = monthKey(now)
    const maxDay = daysInMonth(now.getFullYear(), now.getMonth() + 1)

    await insertRecurringBill({
      id: "bill-1",
      name: "End of Month Bill",
      amount: 100000,
      accountId: BANK,
      dayOfMonth: 31,
      frequency: "monthly",
      active: true,
    })

    await expect(postRecurringBill("bill-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?logged=1",
    )

    const [txn] = await db.select().from(transactions)
    const expectedDate = `${currentMonth}-${String(maxDay).padStart(2, "0")}`
    expect(txn.date).toBe(expectedDate)
  })

  it("permits posting weekly bills multiple times in the same month without setting lastMaterialized", async () => {
    await authenticate()

    await insertRecurringBill({
      id: "bill-weekly",
      name: "Weekly Cleaning",
      amount: 80000,
      accountId: BANK,
      frequency: "weekly",
      dayOfMonth: 7,
      active: true,
      lastMaterialized: null,
    })

    // First post
    await expect(postRecurringBill("bill-weekly", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?logged=1",
    )

    let [bill] = await db
      .select()
      .from(recurringBills)
      .where(eq(recurringBills.id, "bill-weekly"))
    expect(bill.lastMaterialized).toBeNull()

    // Second post in the same month succeeds for weekly
    await expect(postRecurringBill("bill-weekly", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/recurring?logged=1",
    )

    const txns = await db.select().from(transactions)
    expect(txns).toHaveLength(2)
  })
})
