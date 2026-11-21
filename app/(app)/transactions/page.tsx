import { connection } from "next/server"

import { lastDayOfMonth, isValidMonthKey } from "@/lib/dates"
import { getAccounts, getCategories, getTransactions } from "@/lib/db/queries"
import {
  TRANSACTION_TYPES,
  type Category,
  type Transaction,
  type TransactionType,
} from "@/lib/db/schema"
import { formatDate, formatMonth, formatPeso, formatTime } from "@/lib/money/format"
import { TRANSACTION_TYPE_LABELS } from "@/lib/validation/transactions"

import { Icon, type IconName } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"
import { ghostButtonClass, secondaryButtonClass } from "@/lib/ui"

/** How many entries the list shows. The query layer clamps `limit` to 500. */
const LIST_LIMIT = 500

const TYPE_ICONS: Record<TransactionType, IconName> = {
  income: "arrow-up-right",
  expense: "arrow-down-left",
  transfer: "transfer",
}

/**
 * The transaction list — every income, expense and transfer in one place,
 * filtered by month and by type.
 *
 * Server Component: the filter bar is a plain GET form and each row is a
 * link, so the screen ships no client JavaScript.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string }>
}) {
  // The screen shows the signed-in user's ledger, so it must be rendered
  // per request — never prerendered at build time.
  await connection()

  const params = await searchParams

  // Both filters arrive from the query string, so they are untrusted: an
  // unknown month or type is ignored rather than forwarded to the query.
  const month = params.month && isValidMonthKey(params.month) ? params.month : undefined
  const type: TransactionType | undefined =
    params.type && (TRANSACTION_TYPES as readonly string[]).includes(params.type)
      ? (params.type as TransactionType)
      : undefined

  const range = month
    ? {
        from: `${month}-01`,
        to: lastDayOfMonth(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)),
      }
    : {}

  const [transactions, allAccounts, allCategories] = await Promise.all([
    getTransactions({ ...range, type, limit: LIST_LIMIT }),
    getAccounts(),
    getCategories(),
  ])

  const accountNames = new Map(allAccounts.map((account) => [account.id, account.name]))
  const categoryById = new Map(allCategories.map((category) => [category.id, category]))

  // Transfers are not income or spending, so they never enter the totals.
  const income = transactions.reduce(
    (total, transaction) => (transaction.type === "income" ? total + transaction.amount : total),
    0,
  )
  const expense = transactions.reduce(
    (total, transaction) => (transaction.type === "expense" ? total + transaction.amount : total),
    0,
  )

  const isFiltered = month !== undefined || type !== undefined

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description="Every income and expense you have recorded, plus transfers between your accounts."
        action={
          <a
            href="/transactions/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New record
          </a>
        }
      />

      {/* The compact position of what is listed, under the current filters. */}
      <dl className="grid overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="px-5 py-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Entries
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums">
            {transactions.length}
          </dd>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Income
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-income">
            {formatPeso(income)}
          </dd>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Expense
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-expense">
            {formatPeso(expense)}
          </dd>
        </div>
      </dl>

      {/* Filters — a plain GET form, so the browser navigates and no JS is needed. */}
      <form
        method="get"
        action="/transactions"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-raised px-5 py-4 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]"
      >
        <div className="space-y-1.5">
          <label htmlFor="month" className="block text-xs font-medium text-ink-muted">
            Month
          </label>
          <input
            id="month"
            name="month"
            type="month"
            defaultValue={month ?? ""}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition hover:border-border-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-xs font-medium text-ink-muted">
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={type ?? ""}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition hover:border-border-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          >
            <option value="">All types</option>
            {TRANSACTION_TYPES.map((option) => (
              <option key={option} value={option}>
                {TRANSACTION_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={secondaryButtonClass}>
          Apply
        </button>

        {isFiltered ? (
          <a href="/transactions" className={ghostButtonClass}>
            Reset
          </a>
        ) : null}
      </form>

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="receipt" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">
            {isFiltered ? "Nothing matches these filters" : "No transactions yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            {isFiltered
              ? "Try a different month or type, or reset the filters to see everything."
              : "Record your first income or expense to bring the ledger to life."}
          </p>
          {isFiltered ? (
            <a
              href="/transactions"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-border-strong hover:bg-surface-muted"
            >
              Reset filters
            </a>
          ) : (
            <a
              href="/transactions/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Icon name="plus" className="size-4" />
              Add your first record
            </a>
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          {transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              accountName={accountNames.get(transaction.accountId)}
              toAccountName={
                transaction.toAccountId ? accountNames.get(transaction.toAccountId) : undefined
              }
              category={transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined}
            />
          ))}
        </ul>
      )}

      {transactions.length === LIST_LIMIT ? (
        <p className="text-center text-xs text-ink-subtle">
          Showing the {LIST_LIMIT} most recent entries. Narrow by month to see older ones.
        </p>
      ) : null}

      {month ? (
        <p className="text-center text-xs text-ink-subtle">Showing {formatMonth(month)}</p>
      ) : null}
    </div>
  )
}

/** One ledger row: glyph, title, detail line and signed amount. */
function TransactionRow({
  transaction,
  accountName,
  toAccountName,
  category,
}: {
  transaction: Transaction
  accountName?: string
  toAccountName?: string
  category?: Category
}) {
  const categoryLabel = category ? `${category.icon} ${category.name}` : undefined
  const note = transaction.note?.trim()
  const title = note || categoryLabel || TRANSACTION_TYPE_LABELS[transaction.type]

  const detail = [
    transaction.time ? `${formatDate(transaction.date)} · ${formatTime(transaction.time)}` : formatDate(transaction.date),
    accountName ?? null,
    transaction.type === "transfer" ? `→ ${toAccountName ?? "account"}` : null,
    note && categoryLabel ? categoryLabel : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className="border-b border-border last:border-b-0">
      <a
        href={`/transactions/${transaction.id}/edit`}
        className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl border text-sm"
            style={
              category
                ? { backgroundColor: `${category.color}14`, borderColor: `${category.color}33` }
                : undefined
            }
          >
            {category ? (
              <span aria-hidden="true">{category.icon}</span>
            ) : (
              <Icon name={TYPE_ICONS[transaction.type]} className="size-4 text-ink-muted" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-ink-muted">{detail}</p>
          </div>
        </div>
        <p className={`shrink-0 text-sm font-semibold tabular-nums ${amountClass(transaction.type)}`}>
          {amountText(transaction.type, transaction.amount)}
        </p>
      </a>
    </li>
  )
}

/** The signed text of a transaction amount. */
function amountText(type: TransactionType, amount: number): string {
  if (type === "income") return `+${formatPeso(amount)}`
  if (type === "expense") return formatPeso(-amount)
  return formatPeso(amount)
}

/** The colour class for a transaction amount. */
function amountClass(type: TransactionType): string {
  if (type === "income") return "text-income"
  if (type === "expense") return "text-expense"
  return "text-ink-muted"
}
