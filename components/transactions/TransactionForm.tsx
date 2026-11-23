import type { Account, Category, TransactionType } from "@/lib/db/schema"
import { TRANSACTION_NOTE_MAX_LENGTH, TRANSACTION_TYPE_LABELS } from "@/lib/validation/transactions"
import { TRANSACTION_TYPES } from "@/lib/db/schema"

import { Icon, type IconName } from "@/components/ui/icons"
import { ErrorNote, Field } from "@/components/ui/primitives"
import { TransactionTypeFields } from "@/components/transactions/TransactionTypeFields"
import { inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * The transaction form, shared by the new and edit screens.
 *
 * Server Component: the amount, date, account and note are plain HTML, so
 * they add no client JavaScript. The type, category and destination account
 * live in one small client component (`TransactionTypeFields`) because they
 * depend on the selected type — the category list narrows to income or
 * expense categories, and "To account" exists only for a transfer.
 *
 * The accounts and categories passed in are the **active** records plus the
 * record's own current one when it is archived (labelled "· archived").
 * Without that, saving an untouched old transaction would silently blank an
 * archived category.
 */
export interface TransactionFormDefaults {
  type?: TransactionType
  /** The amount field text, already in peso form (`"1234.56"`). */
  amount?: string
  /** `YYYY-MM-DD` */
  date?: string
  /** `HH:MM` */
  time?: string
  accountId?: string
  categoryId?: string
  toAccountId?: string
  note?: string
}

export function TransactionForm({
  action,
  accounts,
  categories,
  defaults = {},
  error,
  submitLabel,
  submitIcon = "check",
  allowLoanTypes = false,
}: {
  action: (formData: FormData) => Promise<void>
  accounts: Account[]
  categories: Category[]
  defaults?: TransactionFormDefaults
  /** The message to show above the submit button, when the last attempt failed. */
  error?: string | null
  submitLabel: string
  submitIcon?: IconName
  allowLoanTypes?: boolean
}) {
  const incomeCategories = categories.filter((category) => category.kind === "income")
  const expenseCategories = categories.filter((category) => category.kind === "expense")

  return (
    <form action={action}>
      <div className="space-y-5 rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:p-6">
        <TransactionTypeFields
          types={TRANSACTION_TYPES}
          labels={TRANSACTION_TYPE_LABELS}
          accounts={accounts}
          incomeCategories={incomeCategories}
          expenseCategories={expenseCategories}
          defaultType={defaults.type}
          defaultAccountId={defaults.accountId}
          defaultCategoryId={defaults.categoryId}
          defaultToAccountId={defaults.toAccountId}
          allowLoanTypes={allowLoanTypes}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="date" label="Date">
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={defaults.date}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="time" label="Time">
            <input
              id="time"
              name="time"
              type="time"
              defaultValue={defaults.time}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          htmlFor="amount"
          label="Amount"
          hint="A positive amount, e.g. 1,234.50."
        >
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-sm font-medium text-ink-subtle">
              ₱
            </span>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              required
              defaultValue={defaults.amount}
              placeholder="0.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </Field>

        <Field htmlFor="note" label="Note">
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={TRANSACTION_NOTE_MAX_LENGTH}
            defaultValue={defaults.note ?? ""}
            placeholder="Lunch with the team"
            className={`${inputClass} resize-y`}
          />
        </Field>

        {error ? <ErrorNote message={error} /> : null}

        <button type="submit" className={`${primaryButtonClass} w-full`}>
          <Icon name={submitIcon} className="size-4" />
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

/**
 * The options for a form select: every active account, plus any archived
 * record the transaction currently belongs to.
 */
export function accountOptions(
  allAccounts: Account[],
  ...currentIds: (string | null | undefined)[]
): Account[] {
  return withCurrent(allAccounts, currentIds)
}

/** The options for the category select, same rule as {@link accountOptions}. */
export function categoryOptions(
  allCategories: Category[],
  ...currentIds: (string | null | undefined)[]
): Category[] {
  return withCurrent(allCategories, currentIds)
}

/** Active records plus any current ones that are archived. */
function withCurrent<T extends { id: string; archived: boolean }>(
  records: T[],
  currentIds: (string | null | undefined)[],
): T[] {
  const wanted = new Set(currentIds.filter((id): id is string => typeof id === "string"))

  return records.filter((record) => !record.archived || wanted.has(record.id))
}
