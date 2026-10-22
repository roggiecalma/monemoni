import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db/client"
import {
  getAccountBalances,
  getCategoryTotals,
  getMonthlyTotals,
  getSummary,
  getTransactions,
} from "@/lib/db/queries"
import { goalContributions } from "@/lib/db/schema"

import {
  insertAccount,
  insertCategory,
  insertGoalContribution,
  insertSavingsGoal,
  insertTransaction,
  resetDatabase,
} from "./setup/db"

const CASH = "acct-cash"
const BANK = "acct-bank"
const FOOD = "cat-food"
const SALARY = "cat-salary"
const TRANSPORT = "cat-transport"

/**
 * The standard fixture used by most tests.
 *
 * Accounts
 *   cash  opening balance ₱1,000.00
 *   bank  opening balance ₱2,000.00
 *
 * Transactions
 *   t-income         2026-10-01 income   ₱500.00  cash  salary   "October salary"
 *   t-expense-1      2026-10-05 expense  ₱125.00  cash  food      "Lunch"
 *   t-transfer       2026-10-10 transfer ₱300.00  cash → bank    "Move to bank"
 *   t-before         2026-09-30 expense  ₱10.00   bank  transport "Jeepney"
 *   t-expense-2      2026-10-31 expense  ₱20.00   bank  food      "Groceries"
 *   t-after          2026-11-01 expense  ₱30.00   bank  food      "Next month"
 *   t-discount       2026-10-20 expense  ₱40.00   cash  food      "100% discount"
 *
 * Goal contribution
 *   gc-1              2026-10-15 ₱100.00 cash → goal-1
 */
async function seedStandardFixture(): Promise<void> {
  await insertAccount({ id: CASH, name: "Cash", type: "cash", openingBalance: 100000, sortOrder: 0 })
  await insertAccount({ id: BANK, name: "Bank", type: "bank", openingBalance: 200000, sortOrder: 1 })

  await insertCategory({ id: FOOD, name: "Food", kind: "expense", icon: "🍔", color: "#f97316", sortOrder: 0 })
  await insertCategory({ id: SALARY, name: "Salary", kind: "income", icon: "💼", color: "#22c55e", sortOrder: 0 })
  await insertCategory({
    id: TRANSPORT,
    name: "Transport",
    kind: "expense",
    icon: "🚗",
    color: "#0ea5e9",
    sortOrder: 1,
  })

  await insertSavingsGoal("goal-1", "Emergency fund", 500000)
  await insertGoalContribution({
    id: "gc-1",
    goalId: "goal-1",
    date: "2026-10-15",
    amount: 10000,
    accountId: CASH,
  })

  await insertTransaction({
    id: "t-income",
    date: "2026-10-01",
    type: "income",
    amount: 50000,
    accountId: CASH,
    categoryId: SALARY,
    note: "October salary",
    createdAt: 1,
  })
  await insertTransaction({
    id: "t-expense-1",
    date: "2026-10-05",
    type: "expense",
    amount: 12500,
    accountId: CASH,
    categoryId: FOOD,
    note: "Lunch",
    createdAt: 2,
  })
  await insertTransaction({
    id: "t-transfer",
    date: "2026-10-10",
    type: "transfer",
    amount: 30000,
    accountId: CASH,
    toAccountId: BANK,
    note: "Move to bank",
    createdAt: 3,
  })
  await insertTransaction({
    id: "t-before",
    date: "2026-09-30",
    type: "expense",
    amount: 1000,
    accountId: BANK,
    categoryId: TRANSPORT,
    note: "Jeepney",
    createdAt: 4,
  })
  await insertTransaction({
    id: "t-expense-2",
    date: "2026-10-31",
    type: "expense",
    amount: 2000,
    accountId: BANK,
    categoryId: FOOD,
    note: "Groceries",
    createdAt: 5,
  })
  await insertTransaction({
    id: "t-after",
    date: "2026-11-01",
    type: "expense",
    amount: 3000,
    accountId: BANK,
    categoryId: FOOD,
    note: "Next month",
    createdAt: 6,
  })
  await insertTransaction({
    id: "t-discount",
    date: "2026-10-20",
    type: "expense",
    amount: 4000,
    accountId: CASH,
    categoryId: FOOD,
    note: "100% discount",
    createdAt: 7,
  })
}

beforeEach(async () => {
  await resetDatabase()
  await seedStandardFixture()
})

describe("getSummary", () => {
  it("excludes transfers from income and expense", async () => {
    const summary = await getSummary("2026-10-01", "2026-10-31")

    // Only t-income is an income; t-transfer (₱300) must not be counted.
    expect(summary.income).toBe(50000)
    // t-expense-1 (₱125) + t-expense-2 (₱20) + t-discount (₱40).
    expect(summary.expense).toBe(12500 + 2000 + 4000)
  })

  it("excludes goal contributions from the totals", async () => {
    const withContribution = await getSummary("2026-10-01", "2026-10-31")
    // The ₱100 goal contribution lives in its own table and is not spending.
    expect(withContribution.expense).toBe(18500)
    expect(withContribution.income).toBe(50000)
  })

  it("computes net as income − expense", async () => {
    const summary = await getSummary("2026-10-01", "2026-10-31")
    expect(summary.net).toBe(summary.income - summary.expense)
    expect(summary.net).toBe(50000 - 18500)
  })

  it("respects the date range", async () => {
    const october = await getSummary("2026-10-01", "2026-10-31")
    expect(october.income).toBe(50000)

    // The September transaction is outside the range.
    const september = await getSummary("2026-09-01", "2026-09-30")
    expect(september.income).toBe(0)
    expect(september.expense).toBe(1000)
    expect(september.net).toBe(-1000)

    // The November transaction is outside the range too.
    const november = await getSummary("2026-11-01", "2026-11-30")
    expect(november.expense).toBe(3000)
  })

  it("returns zeroes for a range without transactions", async () => {
    const summary = await getSummary("2020-01-01", "2020-12-31")
    expect(summary).toEqual({ income: 0, expense: 0, net: 0 })
  })
})

describe("getAccountBalances", () => {
  it("uses opening_balance + income − expense + transfers in − transfers out − goal contributions", async () => {
    const balances = await getAccountBalances()

    const cash = balances.find((balance) => balance.id === CASH)
    const bank = balances.find((balance) => balance.id === BANK)

    // cash: 100000 + 50000 − (12500 + 4000) + 0 − 30000 − 10000
    expect(cash?.balance).toBe(93500)
    // bank: 200000 + 0 − (1000 + 2000 + 3000) + 30000 − 0 − 0
    expect(bank?.balance).toBe(224000)
  })

  it("counts a transfer as money leaving the source and arriving at the destination", async () => {
    const balances = await getAccountBalances()

    const cash = balances.find((balance) => balance.id === CASH)
    const bank = balances.find((balance) => balance.id === BANK)

    // The ₱300 transfer moved from cash to bank, so it is not money that
    // appeared or disappeared: 300000 + 50000 − 22500 − 10000.
    expect((cash?.balance ?? 0) + (bank?.balance ?? 0)).toBe(317500)
  })

  it("subtracts goal contributions from the account balance", async () => {
    await db.delete(goalContributions)

    const balances = await getAccountBalances()
    const cash = balances.find((balance) => balance.id === CASH)

    // Without the ₱100 contribution the cash balance is ₱100 higher.
    expect(cash?.balance).toBe(103500)
  })

  it("returns every account, including the ones without any transaction", async () => {
    await insertAccount({ id: "acct-empty", name: "Empty", type: "ewallet", openingBalance: 500 })

    const balances = await getAccountBalances()
    const empty = balances.find((balance) => balance.id === "acct-empty")
    expect(empty?.balance).toBe(500)
    expect(balances).toHaveLength(3)
  })
})

describe("getTransactions", () => {
  it("returns every transaction, newest first", async () => {
    const all = await getTransactions()
    expect(all).toHaveLength(7)
    expect(all.map((transaction) => transaction.id)).toEqual([
      "t-after",
      "t-expense-2",
      "t-discount",
      "t-transfer",
      "t-expense-1",
      "t-income",
      "t-before",
    ])
  })

  it("filters by date range, inclusive of both endpoints", async () => {
    const rows = await getTransactions({ from: "2026-10-01", to: "2026-10-31" })

    expect(rows.map((transaction) => transaction.id)).toEqual([
      "t-expense-2",
      "t-discount",
      "t-transfer",
      "t-expense-1",
      "t-income",
    ])
    // The first and the last day of the range are both included.
    expect(rows.some((transaction) => transaction.date === "2026-10-01")).toBe(true)
    expect(rows.some((transaction) => transaction.date === "2026-10-31")).toBe(true)
  })

  it("filters by accountId", async () => {
    const rows = await getTransactions({ accountId: CASH })
    expect(rows.map((transaction) => transaction.id)).toEqual([
      "t-discount",
      "t-transfer",
      "t-expense-1",
      "t-income",
    ])
  })

  it("filters by categoryId", async () => {
    const rows = await getTransactions({ categoryId: FOOD })
    expect(rows.map((transaction) => transaction.id)).toEqual([
      "t-after",
      "t-expense-2",
      "t-discount",
      "t-expense-1",
    ])
  })

  it("filters by type", async () => {
    const transfers = await getTransactions({ type: "transfer" })
    expect(transfers).toHaveLength(1)
    expect(transfers[0].id).toBe("t-transfer")

    const income = await getTransactions({ type: "income" })
    expect(income.map((transaction) => transaction.id)).toEqual(["t-income"])
  })

  it("searches the note, case insensitively", async () => {
    const rows = await getTransactions({ search: "lunch" })
    expect(rows.map((transaction) => transaction.id)).toEqual(["t-expense-1"])

    const upper = await getTransactions({ search: "GRO" })
    expect(upper.map((transaction) => transaction.id)).toEqual(["t-expense-2"])

    const nothing = await getTransactions({ search: "does-not-exist" })
    expect(nothing).toHaveLength(0)
  })

  it("treats LIKE wildcards in the search term literally", async () => {
    // "%" must match a literal percent sign, not "anything".
    const rows = await getTransactions({ search: "%" })
    expect(rows.map((transaction) => transaction.id)).toEqual(["t-discount"])

    const exact = await getTransactions({ search: "100%" })
    expect(exact.map((transaction) => transaction.id)).toEqual(["t-discount"])
  })

  it("combines filters", async () => {
    const rows = await getTransactions({
      from: "2026-10-01",
      to: "2026-10-31",
      accountId: CASH,
      type: "expense",
    })
    expect(rows.map((transaction) => transaction.id)).toEqual(["t-discount", "t-expense-1"])
  })

  it("supports limit and offset", async () => {
    const limited = await getTransactions({ limit: 2 })
    expect(limited.map((transaction) => transaction.id)).toEqual(["t-after", "t-expense-2"])

    const offset = await getTransactions({ limit: 2, offset: 1 })
    expect(offset.map((transaction) => transaction.id)).toEqual(["t-expense-2", "t-discount"])
  })

  it("returns an empty list when nothing matches", async () => {
    const rows = await getTransactions({ from: "2030-01-01", to: "2030-12-31" })
    expect(rows).toEqual([])
  })
})

describe("getCategoryTotals", () => {
  it("returns per-category sums and excludes transfers", async () => {
    const rows = await getCategoryTotals("2026-10-01", "2026-10-31", "expense")

    // The transfer has no category and must not show up at all.
    expect(rows.map((row) => row.categoryId)).toEqual([FOOD])

    const food = rows[0]
    expect(food.name).toBe("Food")
    expect(food.icon).toBe("🍔")
    expect(food.color).toBe("#f97316")
    expect(food.total).toBe(12500 + 2000 + 4000)
    expect(food.count).toBe(3)
  })

  it("returns income categories", async () => {
    const rows = await getCategoryTotals("2026-10-01", "2026-10-31", "income")
    expect(rows).toHaveLength(1)
    expect(rows[0].categoryId).toBe(SALARY)
    expect(rows[0].total).toBe(50000)
    expect(rows[0].count).toBe(1)
  })

  it("respects the date range", async () => {
    const rows = await getCategoryTotals("2026-09-01", "2026-09-30", "expense")
    expect(rows).toHaveLength(1)
    expect(rows[0].categoryId).toBe(TRANSPORT)
    expect(rows[0].total).toBe(1000)
    expect(rows[0].count).toBe(1)
  })

  it("sorts by total, biggest first", async () => {
    const rows = await getCategoryTotals("2026-10-01", "2026-10-31", "expense")
    const totals = rows.map((row) => row.total)
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })
})

describe("getMonthlyTotals", () => {
  const monthKey = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

  beforeEach(async () => {
    await resetDatabase()

    const now = new Date()
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    await insertAccount({ id: CASH, name: "Cash", type: "cash" })
    await insertTransaction({
      id: "m-income",
      date: `${monthKey(currentMonth)}-01`,
      type: "income",
      amount: 70000,
      accountId: CASH,
    })
    await insertTransaction({
      id: "m-expense",
      date: `${monthKey(previousMonth)}-15`,
      type: "expense",
      amount: 30000,
      accountId: CASH,
    })
    await insertTransaction({
      id: "m-transfer",
      date: `${monthKey(currentMonth)}-10`,
      type: "transfer",
      amount: 50000,
      accountId: CASH,
      toAccountId: CASH,
    })
  })

  it("returns one bucket per requested month, oldest first", async () => {
    const rows = await getMonthlyTotals(2)
    expect(rows).toHaveLength(2)

    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    expect(rows[0].month).toBe(monthKey(previousMonth))
    expect(rows[1].month).toBe(monthKey(new Date(now.getFullYear(), now.getMonth(), 1)))
  })

  it("returns the requested number of buckets", async () => {
    for (const months of [1, 3, 6, 12]) {
      const rows = await getMonthlyTotals(months)
      expect(rows).toHaveLength(months)
      expect(rows.every((row) => /^\d{4}-\d{2}$/.test(row.month))).toBe(true)
    }
  })

  it("puts the income and expense in the right buckets and ignores transfers", async () => {
    const rows = await getMonthlyTotals(2)

    expect(rows[0].income).toBe(0)
    expect(rows[0].expense).toBe(30000)
    expect(rows[0].net).toBe(-30000)

    expect(rows[1].income).toBe(70000)
    expect(rows[1].expense).toBe(0)
    expect(rows[1].net).toBe(70000)
  })

  it("returns an empty list for a non positive number of months", async () => {
    expect(await getMonthlyTotals(0)).toEqual([])
    expect(await getMonthlyTotals(-3)).toEqual([])
  })
})
