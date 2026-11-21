import { connection } from "next/server"

import { lastDayOfMonth, monthKey } from "@/lib/dates"
import {
  getAccountBalances,
  getCategories,
  getSummary,
  getTransactions,
} from "@/lib/db/queries"
import type { AccountType, TransactionType } from "@/lib/db/schema"
import { formatDate, formatMonth, formatPeso, formatTime } from "@/lib/money/format"

import { Icon, type IconName } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-Wallet",
  card: "Credit card",
}

const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  cash: "cash",
  bank: "bank",
  ewallet: "phone",
  card: "card",
}

/** Fallback label for a transaction that has no category. */
const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
}

const TRANSACTION_TYPE_ICONS: Record<TransactionType, IconName> = {
  income: "arrow-up-right",
  expense: "arrow-down-left",
  transfer: "transfer",
}

/** How many transactions the dashboard lists. */
const RECENT_LIMIT = 8

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

  const [summary, balances, categories, transactions] = await Promise.all([
    getSummary(`${month}-01`, lastDayOfMonth(now)),
    getAccountBalances(),
    getCategories(),
    getTransactions({ limit: RECENT_LIMIT }),
  ])

  // The balances already carry every account, so the names come from there —
  // no second lookup of the accounts is needed.
  const accountNames = new Map(balances.map((balance) => [balance.id, balance.name]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  // Net worth = what you own minus what you owe. Balances are signed and a
  // liability account (credit card) is negative while money is owed, so the
  // plain sum of every balance is already the net worth.
  const netWorth = balances.reduce((total, balance) => total + balance.balance, 0)
  const assets = balances.reduce((total, balance) => total + Math.max(balance.balance, 0), 0)
  const owed = balances.reduce((total, balance) => total + Math.min(balance.balance, 0), 0)

  // How much of this month's income has been spent — a purely visual cue,
  // clamped so an overspend cannot overflow the bar.
  const spendRatio =
    summary.income > 0 ? Math.min(100, Math.round((summary.expense / summary.income) * 100)) : 0

  const hasTransactions = transactions.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatMonth(month)}
        title="Your money, at a glance."
        description="Balances, this month’s flow and the latest activity — all live from your ledger."
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Net worth hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-800 to-brand-900 p-6 text-white shadow-xl shadow-brand-900/20 sm:p-8">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-24 size-64 rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 top-6 size-40 rounded-full border border-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -left-10 size-48 rounded-full bg-brand-500/20 blur-2xl"
          />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200/80">
                Net worth
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-brand-50 backdrop-blur">
                <span className="size-1.5 rounded-full bg-brand-300" />
                All accounts
              </span>
            </div>

            <p className="mt-4 font-display text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {formatPeso(netWorth)}
            </p>
            <p className="mt-2 text-sm text-brand-100/75">Assets minus what you owe</p>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/70">
                  Assets
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums">{formatPeso(assets)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-200/70">
                  Owed
                </p>
                <p className="mt-1 text-base font-semibold tabular-nums">
                  {formatPeso(Math.abs(owed))}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* This month */}
        <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
                This month
              </p>
              <p className="mt-0.5 text-sm font-medium text-ink">{formatMonth(month)}</p>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Icon name="trend-up" className="size-5" />
            </span>
          </div>

          <dl className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2.5 text-sm text-ink-muted">
                <span className="grid size-7 place-items-center rounded-lg bg-income/10 text-income">
                  <Icon name="arrow-up-right" className="size-3.5" />
                </span>
                Income
              </dt>
              <dd className="text-sm font-semibold text-income tabular-nums">
                {formatPeso(summary.income)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2.5 text-sm text-ink-muted">
                <span className="grid size-7 place-items-center rounded-lg bg-expense/10 text-expense">
                  <Icon name="arrow-down-left" className="size-3.5" />
                </span>
                Expense
              </dt>
              <dd className="text-sm font-semibold text-expense tabular-nums">
                {formatPeso(summary.expense)}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-gradient-to-r from-expense/70 to-expense"
                style={{ width: `${spendRatio}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink-subtle">
              {summary.income > 0
                ? `${spendRatio}% of this month’s income spent`
                : "No income recorded this month yet"}
            </p>
          </div>

          <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm font-medium">Net</span>
            <span
              className={`text-base font-semibold tabular-nums ${
                summary.net >= 0 ? "text-ink" : "text-expense"
              }`}
            >
              {formatPeso(summary.net)}
            </span>
          </div>
        </section>
      </div>

      {/* Accounts */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Accounts</h2>
            <p className="text-xs text-ink-muted">
              {balances.length} {balances.length === 1 ? "account" : "accounts"} in this workspace
            </p>
          </div>
          <a
            href="/accounts"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
          >
            Manage
            <Icon name="chevron-right" className="size-3.5" />
          </a>
        </div>

        {balances.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-10 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Icon name="wallet" className="size-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No accounts yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              Add the cash, bank accounts and e-wallets you use to start tracking balances.
            </p>
            <a
              href="/accounts/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Icon name="plus" className="size-4" />
              Add an account
            </a>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {balances.map((balance) => {
              // A liability holds a negative balance while money is owed. It is
              // shown as a magnitude with an "owed" label, never as a bare
              // negative amount.
              const owedAmount = balance.isLiability && balance.balance < 0

              return (
                <li
                  key={balance.id}
                  className="group rounded-2xl border border-border bg-surface-raised p-3 shadow-sm ring-1 ring-black/[0.015] transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md dark:ring-white/[0.02]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`grid size-9 place-items-center rounded-lg ${
                        balance.isLiability
                          ? "bg-expense/10 text-expense"
                          : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                      }`}
                    >
                      <Icon name={ACCOUNT_TYPE_ICONS[balance.type]} className="size-4" />
                    </span>
                    {balance.isLiability ? (
                      <span className="rounded-full bg-expense/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-expense">
                        Owed
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-muted">
                        {ACCOUNT_TYPE_LABELS[balance.type]}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 truncate text-sm font-medium text-ink">{balance.name}</p>
                  <p
                    className={`mt-1.5 font-display text-lg font-semibold tracking-tight tabular-nums ${
                      owedAmount ? "text-expense" : "text-ink"
                    }`}
                  >
                    {formatPeso(owedAmount ? Math.abs(balance.balance) : balance.balance)}
                    {owedAmount ? (
                      <span className="ml-1 font-sans text-[10px] font-normal text-ink-muted">owed</span>
                    ) : null}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Recent activity */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Recent activity</h2>
            <p className="text-xs text-ink-muted">The last {RECENT_LIMIT} entries in your ledger</p>
          </div>
          <span className="grid size-9 place-items-center rounded-xl bg-surface-sunken text-ink-muted">
            <Icon name="sparkles" className="size-4" />
          </span>
        </div>

        {hasTransactions ? (
          <ul className="divide-y divide-border">
            {transactions.map((transaction) => {
              const accountName = accountNames.get(transaction.accountId)
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
                accountName ?? null,
                transaction.type === "transfer" && transaction.toAccountId
                  ? `→ ${accountNames.get(transaction.toAccountId) ?? "account"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")

              const amount = amountPresentation(transaction.type, transaction.amount)

              return (
                <li
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-surface-muted/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-xl border text-sm"
                      style={
                        category
                          ? {
                              backgroundColor: `${category.color}14`,
                              borderColor: `${category.color}33`,
                            }
                          : undefined
                      }
                    >
                      {category ? (
                        <span aria-hidden="true">{category.icon}</span>
                      ) : (
                        <Icon
                          name={TRANSACTION_TYPE_ICONS[transaction.type]}
                          className="size-4 text-ink-muted"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {formatDate(transaction.date)}
                        {transaction.time ? ` · ${formatTime(transaction.time)}` : ""}
                        {detail ? ` · ${detail}` : ""}
                      </p>
                    </div>
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
        ) : (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-sunken text-ink-muted">
              <Icon name="transfer" className="size-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">No transactions yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
              Income, spending and transfers will appear here as soon as they are recorded. Your
              balances and monthly totals update with them.
            </p>
          </div>
        )}
      </section>
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
