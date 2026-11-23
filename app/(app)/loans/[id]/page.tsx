import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { deleteLoanPayment, recordLoanPayment } from "@/lib/actions/loans"
import { todayKey } from "@/lib/dates"
import { getAccounts, getLoanById, getLoanPayments } from "@/lib/db/queries"
import { formatDate, formatPercent, formatPeso } from "@/lib/money/format"
import { centavosToPesoString } from "@/lib/money/parse"
import { lookupMessage } from "@/lib/validation/errors"
import {
  LOAN_PAYMENT_ERROR_MESSAGES,
  LOAN_PAYMENT_NOTE_MAX_LENGTH,
} from "@/lib/validation/loans"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, InlineNote, PageHeader } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui"

/**
 * Single loan detail screen.
 *
 * Shows the hero status card, the record repayment form, and the repayment history table.
 */
export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; paid?: string }>
}) {
  await connection()

  const { id } = await params
  const [loan, payments, allAccounts, queryParams] = await Promise.all([
    getLoanById(id),
    getLoanPayments(id),
    getAccounts(),
    searchParams,
  ])

  if (!loan) {
    notFound()
  }

  const accountNames = new Map(allAccounts.map((a) => [a.id, a.name]))
  const activeAccounts = allAccounts.filter((a) => !a.archived)

  const message = lookupMessage(LOAN_PAYMENT_ERROR_MESSAGES, queryParams.error)

  async function submitPayment(formData: FormData): Promise<void> {
    "use server"
    const result = await recordLoanPayment(id, formData)
    if (result) {
      redirect(`/loans/${id}?error=${encodeURIComponent(result.code)}`)
    }
  }

  const percent = loan.amount > 0 ? (loan.totalPaid / loan.amount) * 100 : 0
  const barWidth = Math.min(100, Math.max(0, percent))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <a
          href="/loans"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
        >
          <Icon name="arrow-left" className="size-3.5" />
          Back to Borrowed / Lent
        </a>

        <div className="flex items-center gap-2">
          <a href={`/loans/${loan.id}/edit`} className={secondaryButtonClass}>
            <Icon name="pencil" className="size-3.5" />
            Edit
          </a>
        </div>
      </div>

      {queryParams.paid ? (
        <InlineNote icon="check">
          Payment recorded successfully. The transaction has been added to your ledger.
        </InlineNote>
      ) : null}

      {/* Hero Card */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-muted">
                {loan.direction === "i_owe" ? "Borrowed from" : "Lent to"}
              </span>
              {loan.isOverdue ? (
                <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  Overdue
                </span>
              ) : null}
              {loan.status === "settled" ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Settled
                </span>
              ) : loan.status === "partially_paid" ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  Partially paid
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
                  Open
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {loan.person}
            </h1>
            {loan.note ? (
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{loan.note}</p>
            ) : null}
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-medium text-ink-muted">Remaining Balance</p>
            <p className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-ink">
              {formatPeso(loan.remainingBalance)}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
            <span>Repaid: {formatPeso(loan.totalPaid)} ({formatPercent(percent)})</span>
            <span>Original: {formatPeso(loan.amount)}</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full transition-all ${
                loan.status === "settled" ? "bg-emerald-500" : "bg-brand-600"
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4 text-xs text-ink-muted">
          <div>
            Agreed date: <span className="font-medium text-ink">{formatDate(loan.date)}</span>
          </div>
          {loan.accountId ? (
            <div>
              Account:{" "}
              <span className="font-medium text-ink">
                {accountNames.get(loan.accountId) ?? "Unknown"}
              </span>
            </div>
          ) : null}
          {loan.dueDate ? (
            <div>
              Due date:{" "}
              <span
                className={`font-medium ${
                  loan.isOverdue ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-ink"
                }`}
              >
                {formatDate(loan.dueDate)}
              </span>
            </div>
          ) : (
            <div>No due date specified</div>
          )}
        </div>
      </section>

      {/* Record Payment Form */}
      {loan.status !== "settled" ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Record payment</h2>
            <p className="text-xs text-ink-muted">
              {loan.direction === "i_owe"
                ? `Record money you paid to ${loan.person}. This adds an expense transaction to your ledger.`
                : `Record money received from ${loan.person}. This adds an income transaction to your ledger.`}
            </p>
          </div>

          <form action={submitPayment}>
            <FormPanel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  htmlFor="amount"
                  label="Amount"
                  hint={`Defaults to remaining balance (${formatPeso(loan.remainingBalance)})`}
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
                      defaultValue={centavosToPesoString(loan.remainingBalance)}
                      className={`${inputClass} pl-8`}
                    />
                  </div>
                </Field>

                <Field htmlFor="accountId" label="Account" hint="Account used for payment">
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="date" label="Date">
                  <input
                    id="date"
                    name="date"
                    type="date"
                    defaultValue={todayKey()}
                    required
                    className={inputClass}
                  />
                </Field>

                <Field htmlFor="note" label="Note" hint="Optional reference or note">
                  <input
                    id="note"
                    name="note"
                    type="text"
                    maxLength={LOAN_PAYMENT_NOTE_MAX_LENGTH}
                    placeholder="e.g. GCash transfer, cash"
                    className={inputClass}
                  />
                </Field>
              </div>

              {message ? <ErrorNote message={message} /> : null}

              <button type="submit" className={`${primaryButtonClass} w-full`}>
                <Icon name="check" className="size-4" />
                Record payment
              </button>
            </FormPanel>
          </form>
        </section>
      ) : (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-center dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            This balance has been completely settled.
          </p>
        </div>
      )}

      {/* Repayment History Table */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Repayment history</h2>
          <p className="text-xs text-ink-muted">
            All payments recorded for this entry. Deleting a payment removes its linked transaction from your ledger.
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-8 text-center">
            <p className="text-sm text-ink-muted">No repayments have been recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted/50 text-xs font-medium text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Note</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-surface-muted/30">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                      {formatDate(payment.date)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-ink whitespace-nowrap">
                      {formatPeso(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">
                      {accountNames.get(payment.accountId) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted hidden sm:table-cell truncate max-w-xs">
                      {payment.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <form action={deleteLoanPayment.bind(null, loan.id, payment.id)}>
                        <button
                          type="submit"
                          className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 dark:text-rose-400"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
