/**
 * MoneMoni — shared read helpers.
 *
 * All amounts returned by these helpers are **centavos**.
 * SERVER ONLY — imports `lib/db/client`.
 */

import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm"

import { db } from "./client"
import {
  accounts,
  categories,
  goalContributions,
  transactions,
  type Account,
  type AccountType,
  type Category,
  type CategoryKind,
  type Transaction,
  type TransactionType,
} from "./schema"

export interface TransactionFilters {
  /** `YYYY-MM-DD` (inclusive) */
  from?: string
  /** `YYYY-MM-DD` (inclusive) */
  to?: string
  accountId?: string
  categoryId?: string
  type?: TransactionType
  /** Substring match on the note (case insensitive). */
  search?: string
  limit?: number
  offset?: number
}

export interface AccountBalance {
  id: string
  name: string
  type: AccountType
  /** opening balance + income − expense + transfers in − transfers out − goal contributions */
  balance: number
}

export interface Summary {
  income: number
  expense: number
  net: number
}

export interface CategoryTotal {
  categoryId: string | null
  name: string
  icon: string
  color: string
  total: number
  count: number
}

export interface MonthlyTotal {
  /** `YYYY-MM` */
  month: string
  income: number
  expense: number
  net: number
}

/** Escapes LIKE wildcards so a search term is matched literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function toDateKey(date: Date): string {
  return `${toMonthKey(date)}-${pad2(date.getDate())}`
}

/** All accounts, in display order. */
export async function getAccounts(): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.sortOrder), asc(accounts.name))
}

/** All categories (optionally filtered by kind), in display order. */
export async function getCategories(kind?: CategoryKind): Promise<Category[]> {
  const condition = kind ? eq(categories.kind, kind) : undefined

  return db
    .select()
    .from(categories)
    .where(condition)
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name))
}

/** Transactions matching the given filters, newest first. */
export async function getTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const conditions: SQL[] = []

  if (filters.from) conditions.push(gte(transactions.date, filters.from))
  if (filters.to) conditions.push(lte(transactions.date, filters.to))
  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId))
  if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId))
  if (filters.type) conditions.push(eq(transactions.type, filters.type))

  if (filters.search && filters.search.length > 0) {
    const pattern = `%${escapeLikePattern(filters.search)}%`
    conditions.push(sql`${transactions.note} like ${pattern} escape ${"\\"}`)
  }

  const query = db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))

  if (filters.limit !== undefined) {
    query.limit(filters.limit)
  }
  if (filters.offset !== undefined) {
    query.offset(filters.offset)
  }

  return query
}

/**
 * Current balance of every account.
 *
 * balance = opening_balance + income − expense + transfers in − transfers out − goal contributions
 */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const allAccounts = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      openingBalance: accounts.openingBalance,
    })
    .from(accounts)
    .orderBy(asc(accounts.sortOrder), asc(accounts.name))

  // Income / expense / outgoing transfers, grouped by the owning account.
  const outgoingRows = await db
    .select({
      accountId: transactions.accountId,
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .groupBy(transactions.accountId, transactions.type)

  // Incoming transfers, grouped by the destination account.
  const incomingRows = await db
    .select({
      accountId: transactions.toAccountId,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.type, "transfer"))
    .groupBy(transactions.toAccountId)

  // Money moved into savings goals is set aside, not spent.
  const contributionRows = await db
    .select({
      accountId: goalContributions.accountId,
      total: sql<number>`sum(${goalContributions.amount})`.mapWith(Number),
    })
    .from(goalContributions)
    .groupBy(goalContributions.accountId)

  const incomeByAccount = new Map<string, number>()
  const expenseByAccount = new Map<string, number>()
  const transferOutByAccount = new Map<string, number>()

  for (const row of outgoingRows) {
    if (!row.accountId) continue
    if (row.type === "income") {
      incomeByAccount.set(row.accountId, (incomeByAccount.get(row.accountId) ?? 0) + row.total)
    } else if (row.type === "expense") {
      expenseByAccount.set(row.accountId, (expenseByAccount.get(row.accountId) ?? 0) + row.total)
    } else if (row.type === "transfer") {
      transferOutByAccount.set(row.accountId, (transferOutByAccount.get(row.accountId) ?? 0) + row.total)
    }
  }

  const transferInByAccount = new Map<string, number>()
  for (const row of incomingRows) {
    if (!row.accountId) continue
    transferInByAccount.set(row.accountId, (transferInByAccount.get(row.accountId) ?? 0) + row.total)
  }

  const contributionsByAccount = new Map<string, number>()
  for (const row of contributionRows) {
    if (!row.accountId) continue
    contributionsByAccount.set(row.accountId, (contributionsByAccount.get(row.accountId) ?? 0) + row.total)
  }

  return allAccounts.map((account) => {
    const balance =
      account.openingBalance +
      (incomeByAccount.get(account.id) ?? 0) -
      (expenseByAccount.get(account.id) ?? 0) +
      (transferInByAccount.get(account.id) ?? 0) -
      (transferOutByAccount.get(account.id) ?? 0) -
      (contributionsByAccount.get(account.id) ?? 0)

    return {
      id: account.id,
      name: account.name,
      type: account.type,
      balance,
    }
  })
}

/**
 * Totals for a date range. Transfers and goal contributions are excluded.
 */
export async function getSummary(from: string, to: string): Promise<Summary> {
  const rows = await db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.type)

  let income = 0
  let expense = 0

  for (const row of rows) {
    if (row.type === "income") income += row.total
    else if (row.type === "expense") expense += row.total
  }

  return { income, expense, net: income - expense }
}

/**
 * Per-category totals for a date range. Transfers are excluded.
 */
export async function getCategoryTotals(
  from: string,
  to: string,
  kind: CategoryKind,
): Promise<CategoryTotal[]> {
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        gte(transactions.date, from),
        lte(transactions.date, to),
        eq(transactions.type, kind),
      ),
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.icon,
      categories.color,
    )
    .orderBy(desc(sql`sum(${transactions.amount})`))

  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.name ?? "Uncategorized",
    icon: row.icon ?? "❓",
    color: row.color ?? "#94a3b8",
    total: row.total,
    count: row.count,
  }))
}

/**
 * Income / expense totals per month for the last `months` months
 * (including the current month), oldest first.
 */
export async function getMonthlyTotals(months: number): Promise<MonthlyTotal[]> {
  if (!Number.isFinite(months) || months <= 0) return []

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (Math.trunc(months) - 1), 1)
  const lastDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const from = toMonthKey(start)
  const to = toDateKey(lastDayOfCurrentMonth)

  const rows = await db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
    })
    .from(transactions)
    .where(and(gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type)

  const incomeByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()

  for (const row of rows) {
    if (row.type === "income") {
      incomeByMonth.set(row.month, (incomeByMonth.get(row.month) ?? 0) + row.total)
    } else if (row.type === "expense") {
      expenseByMonth.set(row.month, (expenseByMonth.get(row.month) ?? 0) + row.total)
    }
  }

  const result: MonthlyTotal[] = []
  for (let offset = Math.trunc(months) - 1; offset >= 0; offset -= 1) {
    const month = toMonthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1))
    const income = incomeByMonth.get(month) ?? 0
    const expense = expenseByMonth.get(month) ?? 0
    result.push({ month, income, expense, net: income - expense })
  }

  return result
}
