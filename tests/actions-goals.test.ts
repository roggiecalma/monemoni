/**
 * MoneMoni — savings goal Server Actions (`lib/actions/goals.ts`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import {
  archiveGoal,
  createContribution,
  createGoal,
  deleteContribution,
  restoreGoal,
  updateGoal,
} from "@/lib/actions/goals"
import { hashPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { accounts, goalContributions, savingsGoals } from "@/lib/db/schema"

import {
  insertAccount,
  insertGoalContribution,
  insertSavingsGoal,
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

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}

function goalForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    name: "Emergency Fund",
    targetAmount: "150,000.00",
    targetDate: "2026-12-31",
    color: "#22c55e",
    ...overrides,
  })
}

function contributionForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    amount: "10,000.00",
    date: "2026-06-01",
    accountId: BANK,
    note: "June allocation",
    ...overrides,
  })
}

async function authenticate(): Promise<void> {
  await insertUser("user-1", await hashPassword("correct-horse"))
  await insertAccount({ id: BANK, name: "Bank Account", type: "bank", sortOrder: 0 })
  await insertAccount({ id: CASH, name: "Cash Wallet", type: "cash", sortOrder: 1 })

  await createSession("user-1")
}

beforeEach(async () => {
  await resetDatabase()
  cookieStore.clear()
})

describe("goals actions without a session", () => {
  it("redirects every action to /login", async () => {
    await resetDatabase()

    await expect(createGoal(goalForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(updateGoal("goal-1", goalForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(archiveGoal("goal-1", new FormData())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(restoreGoal("goal-1", new FormData())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(createContribution("goal-1", contributionForm())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
    await expect(deleteContribution("goal-1", "contrib-1", new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    )
  })
})

describe("createGoal", () => {
  it("creates a savings goal and redirects to /goals", async () => {
    await authenticate()

    await expect(createGoal(goalForm())).rejects.toThrow("NEXT_REDIRECT:/goals")

    const rows = await db.select().from(savingsGoals)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Emergency Fund",
      targetAmount: 15000000,
      targetDate: "2026-12-31",
      color: "#22c55e",
      archived: false,
    })
  })

  it("creates a goal without a target date", async () => {
    await authenticate()

    await expect(createGoal(goalForm({ targetDate: "" }))).rejects.toThrow("NEXT_REDIRECT:/goals")

    const rows = await db.select().from(savingsGoals)
    expect(rows[0].targetDate).toBeNull()
  })

  it("returns validation failure and does not write to database", async () => {
    await authenticate()

    const result = await createGoal(goalForm({ name: "" }))
    expect(result.code).toBe("name-required")

    const rows = await db.select().from(savingsGoals)
    expect(rows).toHaveLength(0)
  })
})

describe("updateGoal", () => {
  it("redirects to /goals when goal does not exist", async () => {
    await authenticate()

    await expect(updateGoal("no-such-goal", goalForm())).rejects.toThrow("NEXT_REDIRECT:/goals")
  })

  it("updates goal fields and redirects to /goals", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Vacation", 5000000)

    await expect(
      updateGoal(
        "goal-1",
        goalForm({
          name: "European Vacation",
          targetAmount: "80,000.00",
          color: "#3b82f6",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/goals")

    const [row] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, "goal-1"))
    expect(row.name).toBe("European Vacation")
    expect(row.targetAmount).toBe(8000000)
    expect(row.color).toBe("#3b82f6")
  })

  it("returns validation failure and preserves existing data", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Original Goal", 5000000)

    const result = await updateGoal("goal-1", goalForm({ color: "invalid-color" }))
    expect(result.code).toBe("color-invalid")

    const [row] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, "goal-1"))
    expect(row.name).toBe("Original Goal")
  })
})

describe("archiveGoal and restoreGoal", () => {
  it("redirects to /goals when archiving or restoring a non-existent goal", async () => {
    await authenticate()

    await expect(archiveGoal("missing", new FormData())).rejects.toThrow("NEXT_REDIRECT:/goals")
    await expect(restoreGoal("missing", new FormData())).rejects.toThrow("NEXT_REDIRECT:/goals")
  })

  it("archives and then restores a goal", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Goal", 100000)

    // Archive
    await expect(archiveGoal("goal-1", new FormData())).rejects.toThrow("NEXT_REDIRECT:/goals")
    let [row] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, "goal-1"))
    expect(row.archived).toBe(true)

    // Restore
    await expect(restoreGoal("goal-1", new FormData())).rejects.toThrow("NEXT_REDIRECT:/goals")
    ;[row] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, "goal-1"))
    expect(row.archived).toBe(false)
  })
})

describe("createContribution", () => {
  it("redirects to /goals when goal does not exist", async () => {
    await authenticate()

    await expect(createContribution("missing-goal", contributionForm())).rejects.toThrow(
      "NEXT_REDIRECT:/goals",
    )
  })

  it("adds contribution and redirects to /goals/[id]/edit", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Car Savings", 30000000)

    await expect(createContribution("goal-1", contributionForm())).rejects.toThrow(
      "NEXT_REDIRECT:/goals/goal-1/edit",
    )

    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      goalId: "goal-1",
      amount: 1000000,
      date: "2026-06-01",
      accountId: BANK,
      note: "June allocation",
    })
  })

  it("stores an empty note as null", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Car Savings", 30000000)

    await expect(
      createContribution("goal-1", contributionForm({ note: "   " })),
    ).rejects.toThrow("NEXT_REDIRECT:/goals/goal-1/edit")

    const rows = await db.select().from(goalContributions)
    expect(rows[0].note).toBeNull()
  })

  it("returns validation failure code without inserting row", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Car Savings", 30000000)

    const result = await createContribution("goal-1", contributionForm({ amount: "-50" }))
    expect(result.code).toBe("amount-not-positive")

    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(0)
  })

  it("returns account-invalid for unknown account", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Car Savings", 30000000)

    const result = await createContribution(
      "goal-1",
      contributionForm({ accountId: "non-existent" }),
    )
    expect(result.code).toBe("account-invalid")

    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(0)
  })

  it("accepts an archived account for contributions", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Car Savings", 30000000)
    await db.update(accounts).set({ archived: true }).where(eq(accounts.id, BANK))

    await expect(createContribution("goal-1", contributionForm())).rejects.toThrow(
      "NEXT_REDIRECT:/goals/goal-1/edit",
    )

    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(1)
  })
})

describe("deleteContribution", () => {
  it("redirects silently when contribution does not exist or belongs to another goal", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Goal 1", 100000)
    await insertSavingsGoal("goal-2", "Goal 2", 100000)

    await insertGoalContribution({
      id: "contrib-1",
      goalId: "goal-1",
      date: "2026-06-01",
      amount: 5000,
      accountId: BANK,
    })

    // Trying to delete contrib-1 using goal-2 in the URL should fail to match and redirect
    await expect(
      deleteContribution("goal-2", "contrib-1", new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/goals/goal-2/edit")

    // Contribution should still exist
    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(1)
  })

  it("deletes the contribution and redirects to /goals/[id]/edit", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Goal 1", 100000)
    await insertGoalContribution({
      id: "contrib-1",
      goalId: "goal-1",
      date: "2026-06-01",
      amount: 5000,
      accountId: BANK,
    })

    await expect(
      deleteContribution("goal-1", "contrib-1", new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/goals/goal-1/edit")

    const rows = await db.select().from(goalContributions)
    expect(rows).toHaveLength(0)
  })
})

describe("savings goals schema cascading", () => {
  it("cascades deletion of contributions when a goal is deleted", async () => {
    await authenticate()
    await insertSavingsGoal("goal-1", "Goal to Delete", 200000)
    await insertGoalContribution({
      id: "contrib-1",
      goalId: "goal-1",
      date: "2026-06-01",
      amount: 5000,
      accountId: BANK,
    })
    await insertGoalContribution({
      id: "contrib-2",
      goalId: "goal-1",
      date: "2026-06-02",
      amount: 10000,
      accountId: BANK,
    })

    expect(await db.select().from(goalContributions)).toHaveLength(2)

    // Delete goal from database
    await db.delete(savingsGoals).where(eq(savingsGoals.id, "goal-1"))

    // Contributions should be cascade deleted
    const remaining = await db.select().from(goalContributions)
    expect(remaining).toHaveLength(0)
  })
})
