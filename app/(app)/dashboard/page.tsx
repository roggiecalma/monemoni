import { connection } from "next/server"

import {
  getAccountBalances,
  getAccounts,
  getCategories,
  getSummary,
  getTransactions,
} from "@/lib/db/queries"
import type { AccountType, TransactionType } from "@/lib/db/schema"
import { formatDate, formatMonth, formatPeso } from "@/lib/money/format"

/** `YYYY-MM` for a date, using the server's local calendar. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

/** `YYYY-MM-DD` of the last day of the given date's month. */
function lastDayOfMonth(date: Date): string {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return `${monthKey(date)}-${String(lastDay).padStart(2, "0")}`
}

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-Wallet",
  card: "Credit card",
}

/** Fallback label for a transaction that has no category. */
const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
}

/** How many transactions the dashboard lists. */
const RECENT_LIMIT = 8

/** Small card wrapper — keeps the page markup flat and readable. */
function Card({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      {title ? (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

/**
 * Dashboard — a server-rendered overview of the money in this install.
 *
 * Every amount comes from `lib/db/queries.ts` and is formatted with
 * `formatPeso`; nothing is calculated by hand here.
 */
export default async function DashboardPage() {
  // The page shows the signed-in user's money, so it must be rendered per
  // request — never prerendered at build time.
  await connection()

  const now = new Date()
  const month = monthKey(now)

  const [summary, accounts, balances, categories, transactions] = await Promise.all([
    getSummary(`${month}-01`, lastDayOfMonth(now)),
    getAccounts(),
    getAccountBalances(),
    getCategories(),
    getTransactions({ limit: RECENT_LIMIT }),
  ])

  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  // Net worth = what you own minus what you owe. Balances are signed and a
  // liability account (credit card) is negative while money is owed, so the
  // plain sum of every balance is already the net worth.
  const netWorth = balances.reduce((total, balance) => total + balance.balance, 0)

  const hasTransactions = transactions.length > 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Net worth
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {formatPeso(netWorth)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">Assets minus what you owe</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            This month · {formatMonth(month)}
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">Income</dt>
              <dd className="font-medium text-income tabular-nums">
                {formatPeso(summary.income)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">Expense</dt>
              <dd className="font-medium text-expense tabular-nums">
                {formatPeso(summary.expense)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
              <dt className="font-medium">Net</dt>
              <dd className="font-semibold tabular-nums">{formatPeso(summary.net)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Account balances">
        <ul className="divide-y divide-border">
          {balances.map((balance) => {
            const account = accountById.get(balance.id)
            const isLiability = account?.isLiability ?? false
            // A liability holds a negative balance while money is owed. It is
            // shown as a magnitude with an "owed" label, never as a bare
            // negative amount.
            const owed = isLiability && balance.balance < 0

            return (
              <li key={balance.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{balance.name}</p>
                  <p className="text-xs text-ink-muted">
                    {isLiability ? "Liability" : ACCOUNT_TYPE_LABELS[balance.type]}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPeso(owed ? Math.abs(balance.balance) : balance.balance)}
                  {owed ? (
                    <span className="ml-1 font-normal text-ink-muted">owed</span>
                  ) : null}
                </p>
              </li>
            )
          })}
        </ul>
      </Card>

      {hasTransactions ? (
        <Card title="Recent transactions">
          <ul className="divide-y divide-border">
            {transactions.map((transaction) => {
              const account = accountById.get(transaction.accountId)
              const category = transaction.categoryId
                ? categoryById.get(transaction.categoryId)
                : undefined

              const categoryLabel = category
                ? `${category.icon} ${category.name}`
                : TRANSACTION_TYPE_LABELS[transaction.type]
              const note = transaction.note?.trim()
              const title = note || categoryLabel
              const detail = [
                note ? categoryLabel : null,
                account?.name ?? null,
                transaction.type === "transfer" && transaction.toAccountId
                  ? `→ ${accountById.get(transaction.toAccountId)?.name ?? "account"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")

              const amount = amountPresentation(transaction.type, transaction.amount)

              return (
                <li
                  key={transaction.id}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {formatDate(transaction.date)}
                      {detail ? ` · ${detail}` : ""}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold tabular-nums ${amount.className}`}
                  >
                    {amount.text}
                  </p>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : (
        <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <p className="text-3xl" aria-hidden="true">
            💸
          </p>
          <h2 className="mt-2 text-base font-semibold">No transactions yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Record your first income or expense to see it here. Your account balances and
            this month&apos;s totals update automatically.
          </p>
        </section>
      )}
    </div>
  )
}

/** Formats a transaction amount with the sign and colour of its type. */
function amountPresentation(type: TransactionType, amount: number) {
  if (type === "income") {
    return { text: `+${formatPeso(amount)}`, className: "text-income" }
  }

  if (type === "expense") {
    return { text: formatPeso(-amount), className: "text-expense" }
  }

  return { text: formatPeso(amount), className: "text-ink-muted" }
}
