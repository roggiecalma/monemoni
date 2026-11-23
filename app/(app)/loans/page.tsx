import { connection } from "next/server"

import { restoreLoan } from "@/lib/actions/loans"
import { getAccounts, getLoans, getLoanSummary } from "@/lib/db/queries"
import { formatDate, formatPercent, formatPeso } from "@/lib/money/format"

import { Icon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"

/**
 * Loans list and overview screen.
 *
 * Displays summary cards (Total I Owe, Total Owed to Me, Net Position),
 * filter tabs (I Owe, Owed to Me, Settled), and the list of active loans.
 */
export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await connection()

  const [allLoans, summary, allAccounts, params] = await Promise.all([
    getLoans(true),
    getLoanSummary(),
    getAccounts(),
    searchParams,
  ])

  const accountNames = new Map(allAccounts.map((a) => [a.id, a.name]))

  const activeTab =
    params.tab === "owed_to_me" ? "owed_to_me" : params.tab === "settled" ? "settled" : "i_owe"

  const active = allLoans.filter((l) => !l.archived)
  const archived = allLoans.filter((l) => l.archived)

  const iOweLoans = active.filter((l) => l.direction === "i_owe" && l.status !== "settled")
  const owedToMeLoans = active.filter((l) => l.direction === "owed_to_me" && l.status !== "settled")
  const settledLoans = active.filter((l) => l.status === "settled")

  const displayedLoans =
    activeTab === "owed_to_me" ? owedToMeLoans : activeTab === "settled" ? settledLoans : iOweLoans

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Borrowed / Lent"
        title="Borrowed / Lent"
        description="Track money you borrowed or lent to others. Record repayments and keep your ledger balanced."
        action={
          <a
            href="/loans/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New entry
          </a>
        }
      />

      {/* Summary Cards */}
      <dl className="grid overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="px-5 py-4">
          <dt className="text-xs font-medium text-ink-muted">Total Borrowed</dt>
          <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-ink">
            {formatPeso(summary.totalIOwe)}
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-xs font-medium text-ink-muted">Total Lent</dt>
          <dd className="mt-1 font-mono text-xl font-bold tracking-tight text-ink">
            {formatPeso(summary.totalOwedToMe)}
          </dd>
        </div>
        <div className="px-5 py-4">
          <dt className="text-xs font-medium text-ink-muted">Net Position</dt>
          <dd
            className={`mt-1 font-mono text-xl font-bold tracking-tight ${
              summary.netPosition > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : summary.netPosition < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-ink"
            }`}
          >
            {summary.netPosition < 0
              ? `-${formatPeso(Math.abs(summary.netPosition))}`
              : formatPeso(summary.netPosition)}
          </dd>
        </div>
      </dl>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border text-sm font-medium">
        <a
          href="/loans?tab=i_owe"
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "i_owe"
              ? "border-brand-700 font-semibold text-brand-700 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span>Borrowed</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
            {iOweLoans.length}
          </span>
        </a>
        <a
          href="/loans?tab=owed_to_me"
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "owed_to_me"
              ? "border-brand-700 font-semibold text-brand-700 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span>Lent</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
            {owedToMeLoans.length}
          </span>
        </a>
        <a
          href="/loans?tab=settled"
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition ${
            activeTab === "settled"
              ? "border-brand-700 font-semibold text-brand-700 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          <span>Settled</span>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
            {settledLoans.length}
          </span>
        </a>
      </div>

      {/* Loan List */}
      {displayedLoans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="users" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">
            {activeTab === "i_owe"
              ? "No borrowed entries right now"
              : activeTab === "owed_to_me"
                ? "No lent entries right now"
                : "No settled entries yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            {activeTab === "settled"
              ? "Entries that have been paid back in full will appear here."
              : "Keep track of borrowed or lent money with friends and family."}
          </p>
          {activeTab !== "settled" ? (
            <a
              href="/loans/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Icon name="plus" className="size-4" />
              Add an entry
            </a>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {displayedLoans.map((loan) => {
            const percent = loan.amount > 0 ? (loan.totalPaid / loan.amount) * 100 : 0
            const barWidth = Math.min(100, Math.max(0, percent))

            return (
              <li
                key={loan.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] transition hover:border-border-strong hover:shadow-md dark:ring-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-ink">{loan.person}</p>
                    <p className="text-xs text-ink-muted">
                      {loan.direction === "i_owe" ? "Borrowed" : "Lent"}
                      {loan.accountId && accountNames.has(loan.accountId)
                        ? ` · ${accountNames.get(loan.accountId)}`
                        : ""}
                      {" · "}
                      {formatDate(loan.date)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {loan.isOverdue ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        Overdue
                      </span>
                    ) : null}

                    {loan.status === "settled" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Settled
                      </span>
                    ) : loan.status === "partially_paid" ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Partially paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                        Open
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-muted">Remaining</span>
                    <span className="font-mono text-lg font-bold tracking-tight text-ink">
                      {formatPeso(loan.remainingBalance)}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={`h-full transition-all ${
                        loan.status === "settled" ? "bg-emerald-500" : "bg-brand-600"
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
                    <span>Paid {formatPeso(loan.totalPaid)}</span>
                    <span>Total {formatPeso(loan.amount)}</span>
                  </div>
                </div>

                {loan.dueDate ? (
                  <p className="mt-3 text-xs text-ink-muted">
                    Due date: <span className="font-medium text-ink">{formatDate(loan.dueDate)}</span>
                  </p>
                ) : null}

                <a
                  href={`/loans/${loan.id}`}
                  className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted"
                >
                  <span>View details</span>
                  <Icon name="chevron-right" className="size-3.5" />
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {/* Archived Loans */}
      {archived.length > 0 ? (
        <details className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="group flex cursor-pointer items-center justify-between gap-3 px-5 py-4 select-none hover:bg-surface-muted/50">
            <div>
              <h2 className="text-sm font-semibold">Archived entries</h2>
              <p className="text-xs text-ink-muted">
                {archived.length} {archived.length === 1 ? "entry" : "entries"} kept for record keeping
              </p>
            </div>
            <span className="grid size-8 place-items-center rounded-lg text-ink-muted transition group-hover:text-ink">
              <Icon name="chevron-right" className="size-4 transition group-open:rotate-90" />
            </span>
          </summary>

          <ul className="divide-y divide-border border-t border-border">
            {archived.map((loan) => (
              <li key={loan.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{loan.person}</p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {loan.direction === "i_owe" ? "Borrowed" : "Lent"} · Remaining{" "}
                    {formatPeso(loan.remainingBalance)} of {formatPeso(loan.amount)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/loans/${loan.id}`}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-ink"
                  >
                    View
                  </a>
                  <form action={restoreLoan.bind(null, loan.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-ink"
                    >
                      Restore
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
