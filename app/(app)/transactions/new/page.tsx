import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createTransaction } from "@/lib/actions/transactions"
import { getAccounts, getCategories } from "@/lib/db/queries"
import { nowTimeKey, todayKey } from "@/lib/dates"
import { TRANSACTION_ERROR_MESSAGES } from "@/lib/validation/transactions"
import { lookupMessage } from "@/lib/validation/errors"

import { Icon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"
import {
  accountOptions,
  TransactionForm,
} from "@/components/transactions/TransactionForm"

/**
 * New transaction screen — income, expense or transfer, chosen with the
 * form's type selector. Server Component: the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await createTransaction(formData)
    if (result) {
      redirect(`/transactions/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(TRANSACTION_ERROR_MESSAGES, error)

  const [allAccounts, allCategories] = await Promise.all([getAccounts(), getCategories()])

  // A new record has no archived reference to preserve, so only the active
  // records are offered in the pickers.
  const accounts = accountOptions(allAccounts, null)
  const categories = allCategories.filter((category) => !category.archived)

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
        title="New record"
        description="Record income, an expense, or move money between two of your accounts."
      />

      <TransactionForm
        action={submit}
        accounts={accounts}
        categories={categories}
        defaults={{ date: todayKey(), time: nowTimeKey() }}
        error={message}
        submitLabel="Save record"
        submitIcon="plus"
        allowLoanTypes
      />

      <p className="text-center text-xs text-ink-subtle">
        Every record updates the account balances on your dashboard straight away.
      </p>
    </div>
  )
}
