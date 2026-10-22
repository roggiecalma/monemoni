/**
 * MoneMoni — default seed data.
 *
 * Applied automatically on startup. Accounts and categories are seeded
 * **independently and idempotently**: each set is inserted only while its
 * own table is empty, so emptying one table can never duplicate the rows of
 * the other and re-running never duplicates anything. Concurrent calls are
 * serialised so two racing first requests cannot both insert.
 *
 * SERVER ONLY (imports `lib/db/client`).
 */

import { db } from "./client"
import { accounts, categories, type AccountType, type CategoryKind } from "./schema"

export interface SeedAccount {
  name: string
  type: AccountType
  isLiability: boolean
}

export interface SeedCategory {
  name: string
  icon: string
  color: string
  kind: CategoryKind
}

/**
 * Default accounts, in display order.
 * Cash Wallet (cash), BPI Bank (bank), GCash (ewallet), Maya (ewallet),
 * Credit Card (card, is_liability = true).
 */
export const DEFAULT_ACCOUNTS: readonly SeedAccount[] = [
  { name: "Cash Wallet", type: "cash", isLiability: false },
  { name: "BPI Bank", type: "bank", isLiability: false },
  { name: "GCash", type: "ewallet", isLiability: false },
  { name: "Maya", type: "ewallet", isLiability: false },
  { name: "Credit Card", type: "card", isLiability: true },
]

/**
 * Default categories, in display order — expense categories first, then
 * income categories (see ARCHITECTURE.md "Default seed data").
 */
export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  // Expenses
  { name: "Food & Dining", icon: "🍔", color: "#f97316", kind: "expense" },
  { name: "Groceries", icon: "🛒", color: "#84cc16", kind: "expense" },
  { name: "Transportation", icon: "🚗", color: "#0ea5e9", kind: "expense" },
  { name: "Bills & Utilities", icon: "💡", color: "#eab308", kind: "expense" },
  { name: "Load & Data", icon: "📱", color: "#8b5cf6", kind: "expense" },
  { name: "Healthcare", icon: "💊", color: "#ef4444", kind: "expense" },
  { name: "Entertainment", icon: "🎬", color: "#ec4899", kind: "expense" },
  { name: "Shopping", icon: "🛍️", color: "#14b8a6", kind: "expense" },
  { name: "Family", icon: "👨‍👩‍👧", color: "#a855f7", kind: "expense" },
  { name: "Education", icon: "📚", color: "#3b82f6", kind: "expense" },
  { name: "Travel", icon: "✈️", color: "#06b6d4", kind: "expense" },
  { name: "Gifts & Donations", icon: "🎁", color: "#f43f5e", kind: "expense" },
  { name: "Others", icon: "📦", color: "#64748b", kind: "expense" },
  // Income
  { name: "Salary", icon: "💼", color: "#22c55e", kind: "income" },
  { name: "13th Month Pay", icon: "🎉", color: "#16a34a", kind: "income" },
  { name: "Commission", icon: "📈", color: "#0d9488", kind: "income" },
  { name: "Freelance", icon: "💻", color: "#2563eb", kind: "income" },
  { name: "Business Income", icon: "🏢", color: "#7c3aed", kind: "income" },
  { name: "Refunds", icon: "↩️", color: "#65a30d", kind: "income" },
  { name: "Others", icon: "➕", color: "#94a3b8", kind: "income" },
]

/**
 * Serialises the seeding calls that happen inside this process.
 *
 * Every call queues onto this chain, so two concurrent callers (a dashboard
 * render racing a prefetch, for example) run one after another instead of in
 * parallel. The chain never rejects, so a failed call cannot poison the queue
 * for the calls that come after it.
 */
let seedQueue: Promise<unknown> = Promise.resolve()

/**
 * Inserts the default accounts and categories that are missing.
 *
 * Each set is gated on its own table: the accounts are inserted only while
 * the `accounts` table is empty and the categories only while the
 * `categories` table is empty. Emptying one table therefore never
 * duplicates the other, and calling this repeatedly is a no-op.
 *
 * The two checks run *outside* the transaction, so the common case — the
 * database is seeded already — does not open a write transaction at all.
 * Opening one took a write lock on every authenticated page render, which
 * is a lot of lock for a call that does nothing. The inserts still run
 * inside a single transaction, so a failure can never leave the database
 * half-seeded.
 *
 * The calls are also serialised **within this process**: the check-then-insert
 * above is a read followed by a write, so two genuinely concurrent first
 * requests could both see empty tables and both insert — ten default accounts
 * instead of five. Queueing the calls removes that window.
 *
 * Residual limitation: this only closes the race *inside one process*. Two
 * separate server instances (or two separate Vercel serverless instances) can
 * still race, because SQLite's write lock does not span processes for this
 * read-then-write pattern. Closing that would need a unique constraint or an
 * `INSERT ... WHERE NOT EXISTS` statement, which is out of scope here.
 */
export async function ensureSeedData(): Promise<void> {
  const result = seedQueue.then(() => seedDefaults())

  // The queue itself must stay usable after a failure: the error belongs to
  // the caller of the failing call, not to the callers that come next.
  seedQueue = result.catch(() => undefined)

  await result
}

/** Runs the actual seeding inside a single transaction. */
async function seedDefaults(): Promise<void> {
  const now = Date.now()

  // The checks run outside the transaction: when both tables already hold
  // their rows there is nothing to seed and no transaction is opened at all.
  const existingAccounts = await db.select({ id: accounts.id }).from(accounts).limit(1)
  const existingCategories = await db.select({ id: categories.id }).from(categories).limit(1)

  const needsAccounts = existingAccounts.length === 0
  const needsCategories = existingCategories.length === 0

  if (!needsAccounts && !needsCategories) return

  await db.transaction(async (tx) => {
    if (needsAccounts) {
      await tx.insert(accounts).values(
        DEFAULT_ACCOUNTS.map((account, index) => ({
          id: crypto.randomUUID(),
          name: account.name,
          type: account.type,
          isLiability: account.isLiability,
          openingBalance: 0,
          archived: false,
          sortOrder: index,
          createdAt: now,
        })),
      )
    }

    if (needsCategories) {
      // `sort_order` is the index within each kind so both lists start at 0.
      const kindCounters: Record<CategoryKind, number> = { income: 0, expense: 0 }

      await tx.insert(categories).values(
        DEFAULT_CATEGORIES.map((category) => ({
          id: crypto.randomUUID(),
          name: category.name,
          kind: category.kind,
          icon: category.icon,
          color: category.color,
          archived: false,
          sortOrder: kindCounters[category.kind]++,
          createdAt: now,
        })),
      )
    }
  })
}
