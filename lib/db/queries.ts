/**
 * MoneMoni — shared read helpers.
 *
 * All amounts returned by these helpers are **centavos**.
 * SERVER ONLY — imports `lib/db/client`.
 */

import { and, asc, desc, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm"

import { lastDayOfMonth, monthKey } from "../dates"
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

/**
 * Maps a category kind to the transaction direction it belongs to.
 *
 * `CategoryKind` ("income" | "expense") and `TransactionType` ("income" |
 * "expense" | "transfer") are two different vocabularies that happen to
 * overlap today. Category totals are driven by the *transaction's* type — a
 * transaction belongs to the income or the expense breakdown according to its
 * own direction, and the category only decides how it is *grouped* — so the
 * two vocabularies must be translated before they can be compared.
 *
 * The map is exhaustive on purpose: adding a new `CategoryKind` is a compile
 * error until the translation is updated, rather than a silently empty
 * breakdown.
 */
const CATEGORY_KIND_DIRECTION: Record<CategoryKind, "income" | "expense"> = {
  income: "income",
  expense: "expense",
}

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
  /**
   * A liability (e.g. a credit card) holds a **negative** balance while
   * money is owed — see the liability sign convention in ARCHITECTURE.md.
   */
  isLiability: boolean
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

/** The largest page size a transaction query may ask for. */
const MAX_TRANSACTION_LIMIT = 500

/** The largest row offset a transaction query may ask for. */
const MAX_TRANSACTION_OFFSET = 1_000_000

/**
 * The page size assumed when a caller paginates without naming one.
 *
 * SQLite rejects `OFFSET` without `LIMIT` (`near "offset": syntax error`),
 * so an offset always implies a page size. 50 sits inside the clamped
 * 1…500 range, so it is passed through `clampLimit` like any explicit limit
 * and there is a single source of truth for the bounds.
 */
const DEFAULT_PAGE_SIZE = 50

/** The largest number of months of history a monthly report may ask for. */
const MAX_MONTHS = 120

/**
 * Clamps a caller supplied `LIMIT` into a sane range.
 *
 * Drizzle hands the value straight to SQLite, which does not validate it:
 * a negative limit means "no limit" in SQL (every row comes back) and a
 * fractional limit raises `SQLITE_MISMATCH`, turning a bad request into a
 * 500. A non-finite value is treated as "no limit at all" rather than
 * being forwarded to the driver.
 */
function clampLimit(limit: number | undefined): number | undefined {
  if (limit === undefined || !Number.isFinite(limit)) return undefined
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_TRANSACTION_LIMIT)
}

/**
 * Clamps a caller supplied `OFFSET` into a sane range.
 *
 * A negative offset is meaningless (SQLite walks backwards, so it is simply
 * ignored) and a huge one forces the database to scan the whole table before
 * returning nothing, so it is capped.
 */
function clampOffset(offset: number | undefined): number | undefined {
  if (offset === undefined || !Number.isFinite(offset)) return undefined
  return Math.min(Math.max(Math.trunc(offset), 0), MAX_TRANSACTION_OFFSET)
}

/** Options shared by the list helpers below. */
export interface ListOptions {
  /**
   * Include the archived records?
   *
   * Defaults to `true`, because archiving is a *management* concept and not
   * a ledger one: archiving hides a record from the pickers, it never
   * removes it from the ledger. An archived account still holds a balance
   * and still counts toward net worth, and a historic transaction still
   * shows its category's name and colour.
   *
   * Pass `false` for the pickers and for the active list of a management
   * screen.
   */
  includeArchived?: boolean
}

/** All accounts, in display order. */
export async function getAccounts(options: ListOptions = {}): Promise<Account[]> {
  const includeArchived = options.includeArchived ?? true
  const condition = includeArchived ? undefined : eq(accounts.archived, false)

  return db
    .select()
    .from(accounts)
    .where(condition)
    .orderBy(asc(accounts.sortOrder), asc(accounts.name))
}

/**
 * A single account by its id, or `null` when there is no such account.
 *
 * Archived accounts are found as well — archiving hides a record from the
 * pickers, it never removes it from the ledger.
 */
export async function getAccountById(id: string): Promise<Account | null> {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1)

  return rows[0] ?? null
}

/** All categories (optionally filtered by kind), in display order. */
export async function getCategories(
  kind?: CategoryKind,
  options: ListOptions = {},
): Promise<Category[]> {
  const includeArchived = options.includeArchived ?? true

  const conditions: SQL[] = []
  if (kind) conditions.push(eq(categories.kind, kind))
  if (!includeArchived) conditions.push(eq(categories.archived, false))

  return db
    .select()
    .from(categories)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name))
}

/**
 * A single category by its id, or `null` when there is no such category.
 *
 * Archived categories are found as well — archiving hides a record from the
 * pickers, it never removes it from the ledger.
 */
export async function getCategoryById(id: string): Promise<Category | null> {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1)

  return rows[0] ?? null
}

/**
 * Transactions matching the given filters, newest first.
 *
 * Supplying `offset` implies pagination: if `limit` is omitted a page size of
 * 50 (`DEFAULT_PAGE_SIZE`) is assumed, because SQLite rejects `OFFSET`
 * without `LIMIT`. Passing neither `limit` nor `offset` returns every
 * matching row.
 */
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

  const limit = clampLimit(filters.limit)
  const offset = clampOffset(filters.offset)

  // An offset implies pagination: SQLite has no `OFFSET` without a `LIMIT`,
  // so a missing limit falls back to the default page size. It goes through
  // the same clamping helper as an explicit limit.
  const effectiveLimit =
    limit ?? (offset === undefined ? undefined : clampLimit(DEFAULT_PAGE_SIZE))

  if (effectiveLimit !== undefined) {
    query.limit(effectiveLimit)
  }
  if (offset !== undefined) {
    query.offset(offset)
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
      isLiability: accounts.isLiability,
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
      isLiability: account.isLiability,
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
 * Per-category totals for a date range, for the given kind.
 *
 * The breakdown is driven by the transaction's **own direction**: a
 * transaction belongs to the income or the expense breakdown according to its
 * `type`, and the category only decides how it is *grouped*. A transaction
 * without a category is grouped under "Uncategorized" inside its own
 * direction, so uncategorised spending is never lost from a breakdown.
 *
 * Transfers are excluded: a transfer has no direction in
 * `CATEGORY_KIND_DIRECTION`, so it can never match the filter, and the
 * explicit exclusion keeps that intent visible in the SQL.
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
        // The *transaction's* type decides the breakdown; the category only
        // groups it. This is what keeps uncategorised spending in the
        // breakdown (as "Uncategorized") instead of dropping it.
        eq(transactions.type, CATEGORY_KIND_DIRECTION[kind]),
        // Belt and braces: a transfer has no direction, so it never matches.
        ne(transactions.type, "transfer"),
      ),
    )
    // Grouping by the (nullable) category id keeps every uncategorised
    // transaction of this direction together in a single row.
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

  // Ten years of history is plenty for a personal finance app. The cap also
  // keeps the date arithmetic below inside the valid JS date range and stops
  // the result loop from running for millions of iterations.
  const monthCount = Math.min(Math.max(Math.trunc(months), 1), MAX_MONTHS)

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1)

  const from = monthKey(start)
  const to = lastDayOfMonth(now)

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
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const month = monthKey(new Date(now.getFullYear(), now.getMonth() - offset, 1))
    const income = incomeByMonth.get(month) ?? 0
    const expense = expenseByMonth.get(month) ?? 0
    result.push({ month, income, expense, net: income - expense })
  }

  return result
}
