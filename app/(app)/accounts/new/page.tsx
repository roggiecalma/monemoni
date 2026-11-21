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

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

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
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to accounts
      </a>

      <PageHeader
        eyebrow="Accounts"
        title="New account"
        description="Add a cash wallet, a bank account, an e-wallet or a card."
      />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={ACCOUNT_NAME_MAX_LENGTH}
              autoFocus
              placeholder="BPI Bank"
              className={inputClass}
            />
          </Field>

          <Field htmlFor="type" label="Type">
            <select id="type" name="type" defaultValue="cash" className={inputClass}>
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-xl border border-border bg-surface-muted px-4 py-3.5">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-medium">
              <input
                type="checkbox"
                name="isLiability"
                className="mt-0.5 size-4 shrink-0 rounded border-border accent-brand-700"
              />
              <span>
                This is money I owe
                <span className="mt-0.5 block text-xs font-normal leading-relaxed text-ink-muted">
                  A credit card or loan. Its balance lowers your net worth.
                </span>
              </span>
            </label>
          </div>

          <Field
            htmlFor="openingBalance"
            label="Opening balance"
            hint="Leave empty for zero. For a credit card or loan, enter the amount you owe — it is recorded as money owed."
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-sm font-medium text-ink-subtle">
                ₱
              </span>
              <input
                id="openingBalance"
                name="openingBalance"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="plus" className="size-4" />
            Create account
          </button>
        </FormPanel>
      </form>

      <p className="text-center text-xs text-ink-subtle">
        Accounts are never deleted — you can archive them later without losing history.
      </p>
    </div>
  )
}
