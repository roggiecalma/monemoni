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
  budgets,
  categories,
  goalContributions,
  recurringBills,
  savingsGoals,
  sessions,
  settings,
  transactions,
  users,
  type AccountType,
  type CategoryKind,
  type TransactionType,
} from "@/lib/db/schema"

/** Empties every table of the test database. */
export async function resetDatabase(): Promise<void> {
  await db.delete(goalContributions)
  await db.delete(budgets)
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

/** Inserts a savings goal and returns its id. */
export async function insertSavingsGoal(
  id: string,
  name = "Emergency fund",
  targetAmount = 500000,
): Promise<string> {
  await db.insert(savingsGoals).values({
    id,
    name,
    targetAmount,
    color: "#22c55e",
    archived: false,
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
