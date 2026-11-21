import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { archiveAccount, updateAccount } from "@/lib/actions/accounts"
import { ACCOUNT_TYPES } from "@/lib/db/schema"
import { getAccountById } from "@/lib/db/queries"
import {
  ACCOUNT_ERROR_MESSAGES,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPE_LABELS,
  openingBalanceFieldValue,
} from "@/lib/validation/accounts"
import { lookupMessage } from "@/lib/validation/errors"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { dangerButtonClass, inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * Edit account screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function EditAccountPage({
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
  const account = await getAccountById(id)

  if (!account) {
    notFound()
  }

  // The id of the account comes from the URL, so the action can be bound to
  // it instead of taking it from the form data.
  const accountId = account.id

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateAccount.bind(null, accountId)(formData)
    if (result) {
      redirect(`/accounts/${accountId}/edit?error=${encodeURIComponent(result.code)}`)
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

      <PageHeader eyebrow="Accounts" title="Edit account" description={account.name} />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={ACCOUNT_NAME_MAX_LENGTH}
              defaultValue={account.name}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="type" label="Type">
            <select id="type" name="type" defaultValue={account.type} className={inputClass}>
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
                defaultChecked={account.isLiability}
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
                defaultValue={openingBalanceFieldValue(account)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="check" className="size-4" />
            Save changes
          </button>
        </FormPanel>
      </form>

      {/*
        The destructive action lives in its own form, below the save button,
        and behind a native <details> so that a second, deliberate step is
        needed before anything is archived. No JavaScript involved.
      */}
      <form action={archiveAccount.bind(null, accountId)}>
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-expense/10 text-expense">
                <Icon name="archive" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Archive this account</p>
                <p className="text-xs text-ink-muted">
                  Hidden from pickers; balance and history are kept.
                </p>
              </div>
            </div>
            <Icon name="chevron-right" className="size-4 text-ink-subtle transition group-open:rotate-90" />
          </summary>

          <div className="border-t border-border px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              Archived accounts are hidden from the pickers, but they keep their balance and their
              history. You can restore this one later from the accounts screen.
            </p>
            <button type="submit" className={`${dangerButtonClass} mt-3`}>
              <Icon name="archive" className="size-4" />
              Yes, archive it
            </button>
          </div>
        </details>
      </form>
    </div>
  )
}
