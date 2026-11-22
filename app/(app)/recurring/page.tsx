import { connection } from "next/server"

import { postRecurringBill, toggleRecurringBill } from "@/lib/actions/recurring"
import { monthKey } from "@/lib/dates"
import { getAccounts, getCategories, getRecurringBills } from "@/lib/db/queries"
import type { RecurringBill } from "@/lib/db/schema"
import { formatMonth, formatPeso } from "@/lib/money/format"
import { lookupMessage } from "@/lib/validation/errors"
import {
  RECURRING_ERROR_MESSAGES,
  RECURRING_FREQUENCY_LABELS,
} from "@/lib/validation/recurring"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, InlineNote, PageHeader } from "@/components/ui/primitives"
import { ghostButtonClass } from "@/lib/ui"

/**
 * The recurring bill list.
 *
 * Server Component: every row is plain HTML and each action is a form that
 * posts to a Server Action, so the screen ships no client JavaScript.
 */
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ logged?: string; error?: string }>
}) {
  // The screen shows the signed-in user's bills, so it must be rendered per
  // request — never prerendered at build time.
  await connection()

  const [params, bills, allAccounts, allCategories] = await Promise.all([
    searchParams,
    getRecurringBills(),
    getAccounts(),
    getCategories(),
  ])

  const accountNames = new Map(allAccounts.map((account) => [account.id, account.name]))
  const categoryById = new Map(allCategories.map((category) => [category.id, category]))

  const month = monthKey(new Date())

  const active = bills.filter((bill) => bill.active)
  const paused = bills.filter((bill) => !bill.active)

  const message = lookupMessage(RECURRING_ERROR_MESSAGES, params.error)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Recurring"
        description="Bills that come back every week, month or year. Log one and it becomes an expense in your ledger."
        action={
          <a
            href="/recurring/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New bill
          </a>
        }
      />

      {params.logged ? (
        <InlineNote icon="check">
          Bill logged. The expense is in your ledger and the account balance has already moved.
        </InlineNote>
      ) : null}

      {message ? <ErrorNote message={message} /> : null}

      {bills.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="repeat" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No recurring bills yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            Rent, subscriptions, load — add the bills that repeat and log them with one click each
            month.
          </p>
          <a
            href="/recurring/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            Add your first bill
          </a>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Active bills</h2>
              <p className="text-xs text-ink-muted">
                {formatMonth(month)} — log a bill to record this month’s expense
              </p>
            </div>
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted tabular-nums">
              {active.length}
            </span>
          </div>

          {active.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              Every bill is paused. Activate one below to use it again.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {active.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  month={month}
                  accountName={accountNames.get(bill.accountId)}
                  category={bill.categoryId ? categoryById.get(bill.categoryId) : undefined}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {paused.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Paused bills</h2>
              <p className="text-xs text-ink-muted">
                Not offered for logging until they are activated again.
              </p>
            </div>
            <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted tabular-nums">
              {paused.length}
            </span>
          </div>

          <ul className="divide-y divide-border">
            {paused.map((bill) => (
              <BillRow
                key={bill.id}
                bill={bill}
                month={month}
                accountName={accountNames.get(bill.accountId)}
                category={bill.categoryId ? categoryById.get(bill.categoryId) : undefined}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** One bill: what it is, how often, and the actions available for it. */
function BillRow({
  bill,
  month,
  accountName,
  category,
}: {
  bill: RecurringBill
  /** The current `YYYY-MM`, used to decide whether this month is already logged. */
  month: string
  accountName?: string
  category?: { name: string; icon: string; color: string }
}) {
  // A weekly bill can legitimately be logged several times in a month, so it
  // is always offered; the others remember the month they were logged for.
  const alreadyLogged = bill.frequency !== "weekly" && bill.lastMaterialized === month
  const canLog = bill.active && !alreadyLogged

  const detail = [
    formatPeso(bill.amount),
    RECURRING_FREQUENCY_LABELS[bill.frequency],
    `Day ${bill.dayOfMonth}`,
    accountName ?? null,
    category ? `${category.icon} ${category.name}` : "No category",
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl border text-base"
          style={
            category
              ? { backgroundColor: `${category.color}14`, borderColor: `${category.color}33` }
              : undefined
          }
        >
          {category ? (
            <span aria-hidden="true">{category.icon}</span>
          ) : (
            <Icon name="repeat" className="size-4 text-ink-muted" />
          )}
        </span>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{bill.name}</p>
          <p className="truncate text-xs text-ink-muted">{detail}</p>
          {bill.lastMaterialized ? (
            <p className="text-[11px] text-ink-subtle">
              Last logged {formatMonth(bill.lastMaterialized)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {alreadyLogged ? (
          <span className="rounded-full bg-income/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-income">
            Logged
          </span>
        ) : null}

        {canLog ? (
          <form action={postRecurringBill.bind(null, bill.id)}>
            <button type="submit" className={ghostButtonClass}>
              <Icon name="check" className="size-3.5" />
              Log bill
            </button>
          </form>
        ) : null}

        <form action={toggleRecurringBill.bind(null, bill.id)}>
          <button type="submit" className={ghostButtonClass}>
            <Icon name={bill.active ? "archive" : "repeat"} className="size-3.5" />
            {bill.active ? "Deactivate" : "Activate"}
          </button>
        </form>

        <a
          href={`/recurring/${bill.id}/edit`}
          aria-label={`Edit ${bill.name}`}
          className="grid size-8 place-items-center rounded-lg border border-transparent text-ink-subtle transition hover:border-border hover:bg-surface-muted hover:text-ink"
        >
          <Icon name="pencil" className="size-3.5" />
        </a>
      </div>
    </li>
  )
}
