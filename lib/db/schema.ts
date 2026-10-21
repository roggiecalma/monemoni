/**
 * MoneMoni — Drizzle schema (SQLite / libSQL / Turso).
 *
 * Conventions (see ARCHITECTURE.md):
 * - All primary keys are `text` holding a `crypto.randomUUID()` generated in
 *   application code. There are no database-side id defaults.
 * - All money is stored as an `INTEGER` number of centavos.
 * - Transaction/bill dates are `TEXT` in `YYYY-MM-DD`; months are `TEXT` in
 *   `YYYY-MM`. Timestamps are `INTEGER` epoch milliseconds.
 * - Booleans are `integer({ mode: "boolean" })`.
 *
 * This module is imported by server code only (it must never be pulled into a
 * client bundle).
 */

import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

export const ACCOUNT_TYPES = ["cash", "bank", "ewallet", "card"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CATEGORY_KINDS = ["income", "expense"] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "yearly"] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]

export const DEFAULT_CURRENCY = "PHP"

/* -------------------------------------------------------------------------- */
/* users & sessions                                                            */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export const sessions = sqliteTable(
  "sessions",
  {
    /** sha256 hex of the raw session token — the raw token is never stored. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert

/* -------------------------------------------------------------------------- */
/* accounts                                                                    */
/* -------------------------------------------------------------------------- */

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    /** Opening balance in centavos. */
    openingBalance: integer("opening_balance").notNull().default(0),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
    /** Credit cards (and similar) are liabilities: their balance is money owed. */
    isLiability: integer("is_liability", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("accounts_sort_order_idx").on(t.sortOrder)],
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert

/* -------------------------------------------------------------------------- */
/* categories                                                                  */
/* -------------------------------------------------------------------------- */

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("categories_kind_sort_order_idx").on(t.kind, t.sortOrder)],
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

/* -------------------------------------------------------------------------- */
/* transactions                                                                */
/* -------------------------------------------------------------------------- */

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    /** Local calendar date, `YYYY-MM-DD`. */
    date: text("date").notNull(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    /** Always positive centavos — direction lives in `type`. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    /** Source account for transfers, owning account otherwise. */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** Destination account — only used by transfers. */
    toAccountId: text("to_account_id").references(() => accounts.id, { onDelete: "set null" }),
    note: text("note"),
    /** Links a generated transaction back to the recurring bill that produced it. */
    recurringId: text("recurring_id").references(() => recurringBills.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_account_id_idx").on(t.accountId),
    index("transactions_category_id_idx").on(t.categoryId),
    index("transactions_type_idx").on(t.type),
  ],
)

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert

/* -------------------------------------------------------------------------- */
/* budgets                                                                     */
/* -------------------------------------------------------------------------- */

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** `YYYY-MM` */
    month: text("month").notNull(),
    /** Budgeted amount in centavos. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
  },
  (t) => [
    index("budgets_category_month_idx").on(t.categoryId, t.month),
    unique("budgets_category_month_unique").on(t.categoryId, t.month),
  ],
)

export type Budget = typeof budgets.$inferSelect
export type NewBudget = typeof budgets.$inferInsert

/* -------------------------------------------------------------------------- */
/* recurring bills                                                             */
/* -------------------------------------------------------------------------- */

export const recurringBills = sqliteTable(
  "recurring_bills",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Amount in centavos. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    frequency: text("frequency", { enum: RECURRING_FREQUENCIES }).notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    /** `YYYY-MM-DD` */
    startDate: text("start_date").notNull(),
    /** `YYYY-MM-DD` */
    endDate: text("end_date"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** Last month materialized, `YYYY-MM`. */
    lastMaterialized: text("last_materialized"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("recurring_bills_account_id_idx").on(t.accountId),
    index("recurring_bills_category_id_idx").on(t.categoryId),
  ],
)

export type RecurringBill = typeof recurringBills.$inferSelect
export type NewRecurringBill = typeof recurringBills.$inferInsert

/* -------------------------------------------------------------------------- */
/* savings goals                                                               */
/* -------------------------------------------------------------------------- */

export const savingsGoals = sqliteTable(
  "savings_goals",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Target amount in centavos. */
    targetAmount: integer("target_amount").notNull(),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
    /** `YYYY-MM-DD` */
    targetDate: text("target_date"),
    color: text("color").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [index("savings_goals_archived_idx").on(t.archived)],
)

export type SavingsGoal = typeof savingsGoals.$inferSelect
export type NewSavingsGoal = typeof savingsGoals.$inferInsert

export const goalContributions = sqliteTable(
  "goal_contributions",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    /** `YYYY-MM-DD` */
    date: text("date").notNull(),
    /** Amount in centavos. */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default(DEFAULT_CURRENCY),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("goal_contributions_goal_id_idx").on(t.goalId),
    index("goal_contributions_account_id_idx").on(t.accountId),
    index("goal_contributions_date_idx").on(t.date),
  ],
)

export type GoalContribution = typeof goalContributions.$inferSelect
export type NewGoalContribution = typeof goalContributions.$inferInsert

/* -------------------------------------------------------------------------- */
/* settings                                                                    */
/* -------------------------------------------------------------------------- */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export type Setting = typeof settings.$inferSelect
export type NewSetting = typeof settings.$inferInsert
