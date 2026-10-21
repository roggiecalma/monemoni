/**
 * MoneMoni — default seed data.
 *
 * Applied automatically the first time the app runs against an empty
 * `categories` table. Idempotent: if any category already exists, nothing
 * happens.
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
 * Inserts the default accounts and categories if — and only if — the
 * `categories` table is empty. Safe to call on every request.
 */
export async function ensureSeedData(): Promise<void> {
  const existing = await db.select({ id: categories.id }).from(categories).limit(1)
  if (existing.length > 0) return

  const now = Date.now()

  await db.transaction(async (tx) => {
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
  })
}
