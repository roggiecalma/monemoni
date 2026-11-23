import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createLoan } from "@/lib/actions/loans"
import { todayKey } from "@/lib/dates"
import { getAccounts } from "@/lib/db/queries"
import { lookupMessage } from "@/lib/validation/errors"
import {
  LOAN_ERROR_MESSAGES,
  LOAN_NOTE_MAX_LENGTH,
  LOAN_PERSON_MAX_LENGTH,
} from "@/lib/validation/loans"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * New loan screen.
 *
 * Server Component: the form posts directly to a Server Action with no client JavaScript.
 */
export default async function NewLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await connection()

  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await createLoan(formData)
    if (result) {
      redirect(`/loans/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const [{ error }, allAccounts] = await Promise.all([searchParams, getAccounts()])
  const activeAccounts = allAccounts.filter((a) => !a.archived)
  const message = lookupMessage(LOAN_ERROR_MESSAGES, error)

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/loans"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to Borrowed / Lent
      </a>

      <PageHeader
        eyebrow="Borrowed / Lent"
        title="New entry"
        description="Record money you borrowed from someone or lent to someone."
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
                  defaultChecked
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
              required
              defaultValue={activeAccounts[0]?.id ?? ""}
              className={inputClass}
            >
              {activeAccounts.length === 0 ? (
                <option value="" disabled>
                  No active accounts
                </option>
              ) : (
                activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field htmlFor="person" label="Person's name">
            <input
              id="person"
              name="person"
              type="text"
              required
              maxLength={LOAN_PERSON_MAX_LENGTH}
              autoFocus
              placeholder="e.g. Maria Santos"
              className={inputClass}
            />
          </Field>

          <Field htmlFor="amount" label="Amount" hint="A positive amount in pesos.">
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
                placeholder="0.00"
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="date" label="Date" hint="When it was borrowed or lent.">
              <input
                id="date"
                name="date"
                type="date"
                defaultValue={todayKey()}
                required
                className={inputClass}
              />
            </Field>

            <Field htmlFor="dueDate" label="Due date" hint="Optional — expected repayment deadline.">
              <input id="dueDate" name="dueDate" type="date" className={inputClass} />
            </Field>
          </div>

          <Field htmlFor="note" label="Note" hint="Optional — terms, reason or notes.">
            <textarea
              id="note"
              name="note"
              rows={3}
              maxLength={LOAN_NOTE_MAX_LENGTH}
              placeholder="e.g. Emergency funds for car repair"
              className={`${inputClass} resize-y`}
            />
          </Field>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="check" className="size-4" />
            Save entry
          </button>
        </FormPanel>
      </form>
    </div>
  )
}
