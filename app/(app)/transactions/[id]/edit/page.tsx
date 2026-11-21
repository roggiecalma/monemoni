import { redirect } from "next/navigation"
import { connection } from "next/server"

import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions"
import { getAccounts, getCategories, getTransactionById } from "@/lib/db/queries"
import { centavosToPesoString } from "@/lib/money/parse"
import { TRANSACTION_ERROR_MESSAGES } from "@/lib/validation/transactions"
import { lookupMessage } from "@/lib/validation/errors"

import { Icon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"
import {
  accountOptions,
  categoryOptions,
  TransactionForm,
} from "@/components/transactions/TransactionForm"
import { dangerButtonClass } from "@/lib/ui"

/**
 * Edit transaction screen. Server Component: both forms post to Server
 * Actions, so the page ships no client JavaScript.
 */
export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  const { id } = await params
  const transaction = await getTransactionById(id)

  if (!transaction) {
    // The record is gone — there is nothing to edit.
    redirect("/transactions")
  }

  /**
   * Saves the form. The id comes from the URL and is bound here, never read
   * from a hidden field.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateTransaction(id, formData)
    if (result) {
      redirect(`/transactions/${id}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(TRANSACTION_ERROR_MESSAGES, error)

  const [allAccounts, allCategories] = await Promise.all([getAccounts(), getCategories()])

  // The record's own account and category are kept in the pickers even when
  // they are archived — otherwise saving without touching them would blank
  // a reference the ledger still needs.
  const accounts = accountOptions(allAccounts, transaction.accountId, transaction.toAccountId)
  const categories = categoryOptions(allCategories, transaction.categoryId)

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/transactions"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to transactions
      </a>

      <PageHeader
        eyebrow="Transactions"
        title="Edit record"
        description="Fix a mistake in this entry. Balances update as soon as you save."
      />

      <TransactionForm
        action={submit}
        accounts={accounts}
        categories={categories}
        defaults={{
          type: transaction.type,
          amount: centavosToPesoString(transaction.amount),
          date: transaction.date,
          time: transaction.time ?? undefined,
          accountId: transaction.accountId,
          categoryId: transaction.categoryId ?? undefined,
          toAccountId: transaction.toAccountId ?? undefined,
          note: transaction.note ?? undefined,
        }}
        error={message}
        submitLabel="Save changes"
        submitIcon="check"
      />

      <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Delete this record</h2>
            <p className="text-xs text-ink-muted">
              This removes the entry from the ledger for good.
            </p>
          </div>
          <Icon name="chevron-right" className="size-4 text-ink-subtle transition group-open:rotate-90" />
        </summary>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <p className="text-xs leading-relaxed text-ink-muted">
            Unlike an account or a category, a transaction cannot be archived — deleting it
            cannot be undone.
          </p>
          <form action={deleteTransaction.bind(null, id)}>
            <button type="submit" className={dangerButtonClass}>
              <Icon name="alert" className="size-4" />
              Delete permanently
            </button>
          </form>
        </div>
      </details>
    </div>
  )
}
