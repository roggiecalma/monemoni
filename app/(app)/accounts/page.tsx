import { connection } from "next/server"

import { restoreAccount } from "@/lib/actions/accounts"
import { getAccountBalances, getAccounts } from "@/lib/db/queries"
import type { AccountType } from "@/lib/db/schema"
import { formatPeso } from "@/lib/money/format"
import { ACCOUNT_TYPE_LABELS } from "@/lib/validation/accounts"

import { Icon, type IconName } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"

const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  cash: "cash",
  bank: "bank",
  ewallet: "phone",
  card: "card",
}

/**
 * The account list.
 *
 * Server Component: every row is plain HTML and the Restore button is a
 * form that posts to a Server Action, so the screen ships no client
 * JavaScript.
 */
export default async function AccountsPage() {
  // The screen shows the signed-in user's accounts, so it must be rendered
  // per request — never prerendered at build time.
  await connection()

  const [allAccounts, balances] = await Promise.all([getAccounts(), getAccountBalances()])

  // The balances already carry every account, so the balance of a row comes
  // from there. An archived account still holds its balance.
  const balanceById = new Map(balances.map((balance) => [balance.id, balance.balance]))

  const active = allAccounts.filter((account) => !account.archived)
  const archived = allAccounts.filter((account) => account.archived)

  const assets = balances.reduce((total, balance) => total + Math.max(balance.balance, 0), 0)
  const owed = balances.reduce((total, balance) => total + Math.min(balance.balance, 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Balances"
        title="Accounts"
        description="The cash, bank accounts, e-wallets and cards you use. Every balance is live from the ledger."
        action={
          <a
            href="/accounts/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New account
          </a>
        }
      />

      {/* Compact position strip — the same signed-balance rules the ledger uses. */}
      <dl className="grid overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:grid-cols-3 sm:divide-x sm:divide-border">
        <div className="px-5 py-4">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Net position
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums">
            {formatPeso(assets + owed)}
          </dd>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Assets
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-income">
            {formatPeso(assets)}
          </dd>
        </div>
        <div className="border-t border-border px-5 py-4 sm:border-t-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            Owed
          </dt>
          <dd className="mt-1 font-display text-xl font-semibold tracking-tight tabular-nums text-expense">
            {formatPeso(Math.abs(owed))}
          </dd>
        </div>
      </dl>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="wallet" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">
            {allAccounts.length === 0 ? "No accounts yet" : "No active accounts"}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            {allAccounts.length === 0
              ? "Add the accounts you use — every income and expense is recorded against one of them."
              : "Every account is archived. Restore one below to use it again."}
          </p>
          {allAccounts.length === 0 ? (
            <a
              href="/accounts/new"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Icon name="plus" className="size-4" />
              Add your first account
            </a>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((account) => {
            const balance = balanceById.get(account.id) ?? 0

            // A liability holds a negative balance while money is owed. It
            // is shown as a magnitude with an "owed" label, never as a bare
            // negative amount.
            const owedAmount = account.isLiability && balance < 0

            return (
              <li
                key={account.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface-raised p-4 shadow-sm ring-1 ring-black/[0.015] transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md dark:ring-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                        account.isLiability
                          ? "bg-expense/10 text-expense"
                          : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                      }`}
                    >
                      <Icon name={ACCOUNT_TYPE_ICONS[account.type]} className="size-4" />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">{account.name}</p>
                      <span
                        className={`mt-1 block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          account.isLiability
                            ? "bg-expense/10 text-expense"
                            : "bg-surface-sunken text-ink-muted"
                        }`}
                      >
                        {account.isLiability ? "OWED" : ACCOUNT_TYPE_LABELS[account.type]}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={`/accounts/${account.id}/edit`}
                      aria-label={`Edit ${account.name}`}
                      className="grid size-8 place-items-center rounded-lg border border-transparent text-ink-subtle transition hover:border-border hover:bg-surface-muted hover:text-ink"
                    >
                      <Icon name="pencil" className="size-3.5" />
                    </a>
                    <p
                      className={`shrink-0 font-display text-2xl font-semibold tracking-tight tabular-nums ${
                        owedAmount ? "text-expense" : "text-ink"
                      }`}
                    >
                      {formatPeso(owedAmount ? Math.abs(balance) : balance)}
                      {owedAmount ? (
                        <span className="ml-1.5 font-sans text-xs font-normal text-ink-muted"></span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Archived accounts</h2>
              <p className="text-xs text-ink-muted">
                Hidden from pickers, but their balance and history are kept.
              </p>
            </div>
            <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              {archived.length}
              <Icon
                name="chevron-right"
                className="size-4 transition group-open:rotate-90"
              />
            </span>
          </summary>

          <ul className="divide-y divide-border border-t border-border">
            {archived.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-subtle">
                    <Icon name={ACCOUNT_TYPE_ICONS[account.type]} className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.name}</p>
                  </div>
                </div>
                <form action={restoreAccount.bind(null, account.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-ink"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
