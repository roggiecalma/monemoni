import { beforeEach, describe, expect, it } from "vitest"

import { todayKey } from "@/lib/dates"
import { db } from "@/lib/db/client"
import {
  getAccountBalances,
  getCategoryTotals,
  getLoanById,
  getLoanPayments,
  getLoans,
  getLoanSummary,
  getMonthlyTotals,
  getSummary,
  getTransactionById,
  getTransactions,
} from "@/lib/db/queries"
import { goalContributions } from "@/lib/db/schema"

import {
  insertAccount,
  insertCategory,
  insertGoalContribution,
  insertLoan,
  insertLoanPayment,
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

describe("getTransactionById", () => {
  it("returns the matching transaction", async () => {
    const transaction = await getTransactionById("t-expense-1")

    expect(transaction).not.toBeNull()
    expect(transaction?.id).toBe("t-expense-1")
    expect(transaction?.amount).toBe(12500)
    expect(transaction?.categoryId).toBe(FOOD)
  })

  it("returns null for an unknown id", async () => {
    expect(await getTransactionById("no-such-id")).toBeNull()
  })
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

describe("loan queries", () => {
  beforeEach(async () => {
    await resetDatabase()

    await insertAccount({ id: CASH, name: "Cash", type: "cash" })

    // Loan 1: i_owe ₱10,000, ₱4,000 paid -> remaining ₱6,000, partially_paid
    await insertLoan({
      id: "loan-1",
      person: "Alice",
      amount: 1000000,
      direction: "i_owe",
      date: "2026-01-01",
      dueDate: "2026-06-01",
    })
    await insertLoanPayment({
      id: "lp-1",
      loanId: "loan-1",
      amount: 400000,
      date: "2026-01-15",
      accountId: CASH,
    })

    // Loan 2: owed_to_me ₱5,000, ₱0 paid -> remaining ₱5,000, open, overdue if dueDate in past
    await insertLoan({
      id: "loan-2",
      person: "Bob",
      amount: 500000,
      direction: "owed_to_me",
      date: "2026-01-01",
      dueDate: "2020-01-01", // in past
    })

    // Loan 3: owed_to_me ₱3,000, ₱3,000 paid -> remaining ₱0, settled
    await insertLoan({
      id: "loan-3",
      person: "Charlie",
      amount: 300000,
      direction: "owed_to_me",
      date: "2026-01-01",
    })
    await insertLoanPayment({
      id: "lp-2",
      loanId: "loan-3",
      amount: 300000,
      date: "2026-01-20",
      accountId: CASH,
    })

    // Loan 4: archived i_owe ₱2,000
    await insertLoan({
      id: "loan-4",
      person: "Archived Dave",
      amount: 200000,
      direction: "i_owe",
      date: "2026-01-01",
      archived: true,
    })
  })

  describe("getLoans", () => {
    it("returns all loans with computed fields", async () => {
      const all = await getLoans(true)
      expect(all).toHaveLength(4)

      const loan1 = all.find((l) => l.id === "loan-1")!
      expect(loan1.totalPaid).toBe(400000)
      expect(loan1.remainingBalance).toBe(600000)
      expect(loan1.status).toBe("partially_paid")

      const loan2 = all.find((l) => l.id === "loan-2")!
      expect(loan2.totalPaid).toBe(0)
      expect(loan2.remainingBalance).toBe(500000)
      expect(loan2.status).toBe("open")
      expect(loan2.isOverdue).toBe(true)

      const loan3 = all.find((l) => l.id === "loan-3")!
      expect(loan3.totalPaid).toBe(300000)
      expect(loan3.remainingBalance).toBe(0)
      expect(loan3.status).toBe("settled")
      expect(loan3.isOverdue).toBe(false)
    })

    it("filters out archived loans when includeArchived is false", async () => {
      const active = await getLoans(false)
      expect(active).toHaveLength(3)
      expect(active.some((l) => l.id === "loan-4")).toBe(false)
    })

    it("orders active loans before archived loans", async () => {
      const all = await getLoans(true)
      expect(all[all.length - 1]?.id).toBe("loan-4")
    })

    it("clamps remainingBalance to zero and marks overpaid loans as settled and not overdue", async () => {
      await insertLoan({
        id: "loan-overpaid",
        person: "Overpaid",
        amount: 200000,
        direction: "i_owe",
        date: "2026-01-01",
        dueDate: "2020-01-01",
      })
      await insertLoanPayment({
        id: "lp-over",
        loanId: "loan-overpaid",
        amount: 350000,
        date: "2026-01-25",
        accountId: CASH,
      })

      const loan = await getLoanById("loan-overpaid")
      expect(loan?.totalPaid).toBe(350000)
      expect(loan?.remainingBalance).toBe(0)
      expect(loan?.status).toBe("settled")
      expect(loan?.isOverdue).toBe(false)
    })

    it("does not mark a loan due today as overdue", async () => {
      await insertLoan({
        id: "loan-due-today",
        person: "Today",
        amount: 100000,
        direction: "i_owe",
        date: "2026-01-01",
        dueDate: todayKey(),
      })

      const loan = await getLoanById("loan-due-today")
      expect(loan?.isOverdue).toBe(false)
    })
  })

  describe("getLoanById", () => {
    it("returns loan with totals", async () => {
      const loan = await getLoanById("loan-1")
      expect(loan).not.toBeNull()
      expect(loan?.id).toBe("loan-1")
      expect(loan?.totalPaid).toBe(400000)
      expect(loan?.remainingBalance).toBe(600000)
      expect(loan?.status).toBe("partially_paid")
    })

    it("returns null for non-existent loan", async () => {
      expect(await getLoanById("none")).toBeNull()
    })
  })

  describe("getLoanPayments", () => {
    it("returns payments for loan ordered newest date first", async () => {
      await insertLoanPayment({
        id: "lp-1b",
        loanId: "loan-1",
        amount: 100000,
        date: "2026-02-01",
        accountId: CASH,
      })

      const payments = await getLoanPayments("loan-1")
      expect(payments.map((p) => p.id)).toEqual(["lp-1b", "lp-1"])
      expect(await getLoanPayments("loan-2")).toEqual([])
      expect(await getLoanPayments("non-existent")).toEqual([])
    })
  })

  describe("getLoanSummary", () => {
    it("computes totalIOwe, totalOwedToMe, and netPosition for active un-settled loans", async () => {
      // loan-1: i_owe remaining 6,000
      // loan-2: owed_to_me remaining 5,000
      // loan-3: settled (remaining 0)
      // loan-4: archived
      const summary = await getLoanSummary()
      expect(summary.totalIOwe).toBe(600000)
      expect(summary.totalOwedToMe).toBe(500000)
      expect(summary.netPosition).toBe(500000 - 600000) // -100,000
    })

    it("returns zeroes when there are no loans", async () => {
      await resetDatabase()
      expect(await getLoanSummary()).toEqual({
        totalIOwe: 0,
        totalOwedToMe: 0,
        netPosition: 0,
      })
    })
  })
})
