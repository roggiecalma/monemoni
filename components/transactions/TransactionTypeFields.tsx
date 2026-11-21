"use client"

/**
 * The type-dependent part of the transaction form.
 *
 * This is the one client component in the transaction screens, and it exists
 * for a reason a Server Component cannot cover: the fields below the type
 * change with the selected type — the category list narrows to income or
 * expense categories, and the "To account" field only exists for a transfer.
 * A hidden `<select>` still submits its value, so this cannot be done with
 * CSS alone.
 *
 * Everything it needs is passed in from the server parent: the accounts and
 * the pre-split category lists, the type vocabulary and its labels. Keeping
 * those as props means this bundle never imports the schema module (and so
 * never pulls Drizzle into the browser).
 *
 * Unmounting a field is also how the form clears it: a field that is not
 * rendered posts nothing, and the Server Action already stores `categoryId`
 * as null for a transfer and `toAccountId` as null otherwise.
 */

import { useState } from "react"

import { Icon, type IconName } from "@/components/ui/icons"
import { inputClass } from "@/lib/ui"
import type { Account, Category, TransactionType } from "@/lib/db/schema"

/** The icon shown next to each type in the radio group. */
const TYPE_ICONS: Record<TransactionType, IconName> = {
  income: "arrow-up-right",
  expense: "arrow-down-left",
  transfer: "transfer",
}

export function TransactionTypeFields({
  types,
  labels,
  accounts,
  incomeCategories,
  expenseCategories,
  defaultType = "expense",
  defaultAccountId,
  defaultCategoryId,
  defaultToAccountId,
}: {
  /** The type vocabulary, passed from the server so the schema is not bundled. */
  types: readonly TransactionType[]
  labels: Record<TransactionType, string>
  accounts: Account[]
  incomeCategories: Category[]
  expenseCategories: Category[]
  defaultType?: TransactionType
  defaultAccountId?: string
  defaultCategoryId?: string
  defaultToAccountId?: string
}) {
  const [type, setType] = useState<TransactionType>(defaultType)

  const isTransfer = type === "transfer"
  const categories = type === "income" ? incomeCategories : expenseCategories

  return (
    <>
      <fieldset className="space-y-1.5">
        <legend className="block text-sm font-medium text-ink">Type</legend>
        <div className="grid grid-cols-3 gap-2">
          {types.map((option) => (
            <label
              key={option}
              className="relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium text-ink-muted transition hover:border-border-strong hover:bg-surface-muted has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-800 has-checked:ring-4 has-checked:ring-brand-500/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 dark:has-checked:bg-brand-900/30 dark:has-checked:text-brand-200"
            >
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                className="sr-only"
              />
              <Icon name={TYPE_ICONS[option]} className="size-4" />
              {labels[option]}
            </label>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          Income adds to a balance, an expense takes away, a transfer moves money between two of
          your accounts.
        </p>
      </fieldset>

      {/* Account beside the category — or beside the destination account
          when this is a transfer. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="accountId" className="block text-sm font-medium text-ink">
            Account
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            defaultValue={defaultAccountId ?? ""}
            className={inputClass}
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.archived ? " · archived" : ""}
              </option>
            ))}
          </select>
        </div>

        {isTransfer ? (
          <div className="space-y-1.5">
            <label htmlFor="toAccountId" className="block text-sm font-medium text-ink">
              To account
            </label>
            <select
              id="toAccountId"
              name="toAccountId"
              required
              defaultValue={defaultToAccountId ?? ""}
              className={inputClass}
            >
              <option value="">Choose the destination</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="categoryId" className="block text-sm font-medium text-ink">
              Category
            </label>
            <select
              id="categoryId"
              name="categoryId"
              required
              defaultValue={defaultCategoryId ?? ""}
              className={inputClass}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                  {category.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </>
  )
}
