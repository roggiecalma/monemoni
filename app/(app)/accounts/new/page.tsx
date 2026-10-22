import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createAccount } from "@/lib/actions/accounts"
import { ACCOUNT_TYPES } from "@/lib/db/schema"
import {
  ACCOUNT_ERROR_MESSAGES,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPE_LABELS,
} from "@/lib/validation/accounts"
import { lookupMessage } from "@/lib/validation/errors"

/**
 * New account screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function NewAccountPage({
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
    const result = await createAccount(formData)
    if (result) {
      redirect(`/accounts/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(ACCOUNT_ERROR_MESSAGES, error)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New account</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Add a cash wallet, a bank account, an e-wallet or a card.
        </p>
      </div>

      <form
        action={submit}
        className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            autoFocus
            placeholder="BPI Bank"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue="cash"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="isLiability"
              className="mt-0.5 size-4 shrink-0 rounded border-border"
            />
            <span>This is money I owe (a credit card or loan)</span>
          </label>
          <p className="text-xs text-ink-muted">
            A liability is money owed, so its balance lowers your net worth.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="openingBalance" className="block text-sm font-medium">
            Opening balance
          </label>
          <input
            id="openingBalance"
            name="openingBalance"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          <p className="text-xs text-ink-muted">
            Leave empty for zero. For a credit card or loan, enter the amount you owe — it is
            recorded as money owed.
          </p>
        </div>

        {message ? (
          <p
            role="alert"
            className="rounded-lg bg-expense/10 px-3 py-2 text-sm font-medium text-expense"
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Create account
        </button>
      </form>
    </div>
  )
}
