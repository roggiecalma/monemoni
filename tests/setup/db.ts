/**
 * Test helpers for the database.
 *
 * The test database lives in `.tmp/test.db` (see `tests/setup/global-setup.ts`)
 * and is shared by every test file, so each test starts by emptying every
 * table. Foreign keys are respected, hence the delete order.
 */

import { db } from "@/lib/db/client"
import {
  accounts,
  categories,
  goalContributions,
  loanPayments,
  loans,
  recurringBills,
  savingsGoals,
  sessions,
  settings,
  transactions,
  users,
  type AccountType,
  type CategoryKind,
  type LoanDirection,
  type RecurringFrequency,
  type TransactionType,
} from "@/lib/db/schema"

/** Empties every table of the test database. */
export async function resetDatabase(): Promise<void> {
  await db.delete(loanPayments)
  await db.delete(loans)
  await db.delete(goalContributions)
  await db.delete(transactions)
  await db.delete(recurringBills)
  await db.delete(savingsGoals)
  await db.delete(sessions)
  await db.delete(categories)
  await db.delete(accounts)
  await db.delete(users)
  await db.delete(settings)
}

export interface AccountFixture {
  id: string
  name: string
  type: AccountType
  openingBalance?: number
  isLiability?: boolean
  sortOrder?: number
}

/** Inserts an account and returns its id. */
export async function insertAccount(fixture: AccountFixture): Promise<string> {
  await db.insert(accounts).values({
    id: fixture.id,
    name: fixture.name,
    type: fixture.type,
    openingBalance: fixture.openingBalance ?? 0,
    isLiability: fixture.isLiability ?? false,
    archived: false,
    sortOrder: fixture.sortOrder ?? 0,
    createdAt: 1,
  })
  return fixture.id
}

export interface CategoryFixture {
  id: string
  name: string
  kind: CategoryKind
  icon?: string
  color?: string
  sortOrder?: number
}

/** Inserts a category and returns its id. */
export async function insertCategory(fixture: CategoryFixture): Promise<string> {
  await db.insert(categories).values({
    id: fixture.id,
    name: fixture.name,
    kind: fixture.kind,
    icon: fixture.icon ?? "📦",
    color: fixture.color ?? "#64748b",
    archived: false,
    sortOrder: fixture.sortOrder ?? 0,
    createdAt: 1,
  })
  return fixture.id
}

export interface TransactionFixture {
  id: string
  date: string
  type: TransactionType
  amount: number
  accountId: string
  time?: string
  toAccountId?: string
  categoryId?: string
  note?: string
  createdAt?: number
}

/** Inserts a transaction and returns its id. */
export async function insertTransaction(fixture: TransactionFixture): Promise<string> {
  await db.insert(transactions).values({
    id: fixture.id,
    date: fixture.date,
    time: fixture.time ?? null,
    type: fixture.type,
    amount: fixture.amount,
    accountId: fixture.accountId,
    toAccountId: fixture.toAccountId ?? null,
    categoryId: fixture.categoryId ?? null,
    note: fixture.note ?? null,
    createdAt: fixture.createdAt ?? 1,
    updatedAt: fixture.createdAt ?? 1,
  })
  return fixture.id
}

export interface RecurringBillFixture {
  id: string
  name: string
  amount: number
  accountId: string
  frequency?: RecurringFrequency
  dayOfMonth?: number
  startDate?: string
  endDate?: string | null
  categoryId?: string | null
  active?: boolean
  lastMaterialized?: string | null
  createdAt?: number
}

/** Inserts a recurring bill and returns its id. */
export async function insertRecurringBill(fixture: RecurringBillFixture): Promise<string> {
  await db.insert(recurringBills).values({
    id: fixture.id,
    name: fixture.name,
    amount: fixture.amount,
    accountId: fixture.accountId,
    frequency: fixture.frequency ?? "monthly",
    dayOfMonth: fixture.dayOfMonth ?? 1,
    startDate: fixture.startDate ?? "2026-01-01",
    endDate: fixture.endDate ?? null,
    categoryId: fixture.categoryId ?? null,
    active: fixture.active ?? true,
    lastMaterialized: fixture.lastMaterialized ?? null,
    createdAt: fixture.createdAt ?? 1,
  })
  return fixture.id
}

/** Inserts a savings goal and returns its id. */
export async function insertSavingsGoal(
  id: string,
  name = "Emergency fund",
  targetAmount = 500000,
  options: { color?: string; targetDate?: string | null; archived?: boolean } = {},
): Promise<string> {
  await db.insert(savingsGoals).values({
    id,
    name,
    targetAmount,
    color: options.color ?? "#22c55e",
    targetDate: options.targetDate ?? null,
    archived: options.archived ?? false,
    createdAt: 1,
  })
  return id
}

/** Inserts a contribution to a savings goal. */
export async function insertGoalContribution(fixture: {
  id: string
  goalId: string
  date: string
  amount: number
  accountId: string
  note?: string
}): Promise<string> {
  await db.insert(goalContributions).values({
    id: fixture.id,
    goalId: fixture.goalId,
    date: fixture.date,
    amount: fixture.amount,
    accountId: fixture.accountId,
    note: fixture.note ?? null,
    createdAt: 1,
  })
  return fixture.id
}

/** Inserts the single application user and returns its id. */
export async function insertUser(id: string, passwordHash: string): Promise<string> {
  await db.insert(users).values({ id, passwordHash, createdAt: 1 })
  return id
}

export interface LoanFixture {
  id: string
  person: string
  amount: number
  direction: LoanDirection
  date?: string
  dueDate?: string | null
  note?: string | null
  currency?: string
  archived?: boolean
  createdAt?: number
  updatedAt?: number
}

export async function insertLoan(fixture: LoanFixture): Promise<string>
export async function insertLoan(
  id: string,
  person?: string,
  amount?: number,
  direction?: LoanDirection,
  options?: { date?: string; dueDate?: string | null; note?: string | null; archived?: boolean },
): Promise<string>
export async function insertLoan(
  fixtureOrId: LoanFixture | string,
  maybePerson?: string,
  maybeAmount?: number,
  maybeDirection?: LoanDirection,
  maybeOptions?: { date?: string; dueDate?: string | null; note?: string | null; archived?: boolean },
): Promise<string> {
  const fixture: LoanFixture =
    typeof fixtureOrId === "string"
      ? {
          id: fixtureOrId,
          person: maybePerson ?? "Test Person",
          amount: maybeAmount ?? 100000,
          direction: maybeDirection ?? "i_owe",
          date: maybeOptions?.date ?? "2026-01-01",
          dueDate: maybeOptions?.dueDate ?? null,
          note: maybeOptions?.note ?? null,
          archived: maybeOptions?.archived ?? false,
        }
      : fixtureOrId

  await db.insert(loans).values({
    id: fixture.id,
    person: fixture.person,
    amount: fixture.amount,
    currency: fixture.currency ?? "PHP",
    direction: fixture.direction,
    date: fixture.date ?? "2026-01-01",
    dueDate: fixture.dueDate ?? null,
    note: fixture.note ?? null,
    archived: fixture.archived ?? false,
    createdAt: fixture.createdAt ?? 1,
    updatedAt: fixture.updatedAt ?? 1,
  })
  return fixture.id
}

export interface LoanPaymentFixture {
  id: string
  loanId: string
  date: string
  amount: number
  accountId: string
  transactionId?: string | null
  note?: string | null
  createdAt?: number
}

export async function insertLoanPayment(fixture: LoanPaymentFixture): Promise<string>
export async function insertLoanPayment(
  id: string,
  loanId?: string,
  amount?: number,
  accountId?: string,
  options?: { date?: string; transactionId?: string | null; note?: string | null },
): Promise<string>
export async function insertLoanPayment(
  fixtureOrId: LoanPaymentFixture | string,
  maybeLoanId?: string,
  maybeAmount?: number,
  maybeAccountId?: string,
  maybeOptions?: { date?: string; transactionId?: string | null; note?: string | null },
): Promise<string> {
  const fixture: LoanPaymentFixture =
    typeof fixtureOrId === "string"
      ? {
          id: fixtureOrId,
          loanId: maybeLoanId!,
          date: maybeOptions?.date ?? "2026-01-01",
          amount: maybeAmount ?? 50000,
          accountId: maybeAccountId!,
          transactionId: maybeOptions?.transactionId ?? null,
          note: maybeOptions?.note ?? null,
        }
      : fixtureOrId

  await db.insert(loanPayments).values({
    id: fixture.id,
    loanId: fixture.loanId,
    date: fixture.date,
    amount: fixture.amount,
    accountId: fixture.accountId,
    transactionId: fixture.transactionId ?? null,
    note: fixture.note ?? null,
    createdAt: fixture.createdAt ?? 1,
  })
  return fixture.id
}
