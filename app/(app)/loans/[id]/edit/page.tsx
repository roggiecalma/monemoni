import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { archiveLoan, deleteLoan, restoreLoan, updateLoan } from "@/lib/actions/loans"
import { getAccounts, getLoanById } from "@/lib/db/queries"
import { centavosToPesoString } from "@/lib/money/parse"
import { lookupMessage } from "@/lib/validation/errors"
import {
  LOAN_ERROR_MESSAGES,
  LOAN_NOTE_MAX_LENGTH,
  LOAN_PERSON_MAX_LENGTH,
} from "@/lib/validation/loans"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/ui"

/**
 * Edit loan screen.
 *
 * Server Component: allows editing loan attributes, archiving/restoring, or permanently deleting.
 */
export default async function EditLoanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  await connection()

  const { id } = await params
  const [loan, allAccounts, queryParams] = await Promise.all([
    getLoanById(id),
    getAccounts(),
    searchParams,
  ])

  if (!loan) {
    notFound()
  }

  const activeAccounts = allAccounts.filter((a) => !a.archived || a.id === loan.accountId)

  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateLoan(id, formData)
    if (result) {
      redirect(`/loans/${id}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  const message = lookupMessage(LOAN_ERROR_MESSAGES, queryParams.error)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <a
        href="/loans"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to Borrowed / Lent
      </a>

      <PageHeader
        eyebrow="Borrowed / Lent"
        title="Edit entry"
        description={`Update details for ${loan.person}.`}
      />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="direction" label="Direction">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/50 dark:has-[:checked]:border-brand-500 dark:has-[:checked]:bg-brand-950/20">
                <input
                  type="radio"
                  name="direction"
                  value="i_owe"
                  defaultChecked={loan.direction === "i_owe"}
                  className="size-4 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="text-sm font-semibold text-ink">Borrowed</p>
                  <p className="text-xs text-ink-muted">Money I borrowed from someone</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/50 dark:has-[:checked]:border-brand-500 dark:has-[:checked]:bg-brand-950/20">
                <input
                  type="radio"
                  name="direction"
                  value="owed_to_me"
                  defaultChecked={loan.direction === "owed_to_me"}
                  className="size-4 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <p className="text-sm font-semibold text-ink">Lent</p>
                  <p className="text-xs text-ink-muted">Money I lent to someone</p>
                </div>
              </label>
            </div>
          </Field>

          <Field
            htmlFor="accountId"
            label="Account"
            hint="Bank, e-wallet, or cash wallet where the money is placed or taken from."
          >
            <select
              id="accountId"
              name="accountId"
              defaultValue={loan.accountId ?? activeAccounts[0]?.id ?? ""}
              className={inputClass}
            >
              <option value="">No account linked</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="person" label="Person's name">
            <input
              id="person"
              name="person"
              type="text"
              required
              maxLength={LOAN_PERSON_MAX_LENGTH}
              defaultValue={loan.person}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="amount" label="Amount" hint="The original amount in pesos.">
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
                defaultValue={centavosToPesoString(loan.amount)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="date" label="Date" hint="Agreed date.">
              <input
                id="date"
                name="date"
                type="date"
                defaultValue={loan.date}
                required
                className={inputClass}
              />
            </Field>

            <Field htmlFor="dueDate" label="Due date" hint="Optional repayment deadline.">
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                defaultValue={loan.dueDate ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <Field htmlFor="note" label="Note" hint="Optional notes or terms.">
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={LOAN_NOTE_MAX_LENGTH}
              defaultValue={loan.note ?? ""}
              className={`${inputClass} resize-y`}
            />
          </Field>

          {message ? <ErrorNote message={message} /> : null}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className={`${primaryButtonClass} flex-1`}>
              <Icon name="check" className="size-4" />
              Save changes
            </button>
            <a href={`/loans/${loan.id}`} className={secondaryButtonClass}>
              Cancel
            </a>
          </div>
        </FormPanel>
      </form>

      {/* Archive / Restore */}
      <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {loan.archived ? "Restore entry" : "Archive entry"}
            </h2>
            <p className="text-xs text-ink-muted">
              {loan.archived
                ? "Restoring makes this entry visible in your active list and balances."
                : "Archiving hides this entry from active lists while preserving all payments and history."}
            </p>
          </div>

          {loan.archived ? (
            <form action={restoreLoan.bind(null, loan.id)}>
              <button type="submit" className={secondaryButtonClass}>
                Restore entry
              </button>
            </form>
          ) : (
            <form action={archiveLoan.bind(null, loan.id)}>
              <button type="submit" className={secondaryButtonClass}>
                <Icon name="archive" className="size-3.5" />
                Archive entry
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Danger Zone: Delete Loan */}
      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 dark:border-rose-950/40 dark:bg-rose-950/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-200">Delete entry</h2>
            <p className="text-xs text-rose-700/80 dark:text-rose-400/80">
              Permanently delete this entry and all associated repayment transactions from your ledger.
            </p>
          </div>

          <form action={deleteLoan.bind(null, loan.id)}>
            <button type="submit" className={dangerButtonClass}>
              Delete entry
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
