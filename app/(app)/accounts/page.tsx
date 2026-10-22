import { connection } from "next/server"

import { restoreAccount } from "@/lib/actions/accounts"
import { getAccountBalances, getAccounts } from "@/lib/db/queries"
import { formatPeso } from "@/lib/money/format"
import { ACCOUNT_TYPE_LABELS } from "@/lib/validation/accounts"

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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            The cash, bank accounts, e-wallets and cards you use.
          </p>
        </div>
        <a
          href="/accounts/new"
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          New account
        </a>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        {active.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-3xl" aria-hidden="true">
              🏦
            </p>
            <h2 className="mt-2 text-base font-semibold">
              {allAccounts.length === 0 ? "No accounts yet" : "No active accounts"}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              {allAccounts.length === 0
                ? "Add the accounts you use — every income and expense is recorded against one of them."
                : "Every account is archived. Restore one below to use it again."}
            </p>
            {allAccounts.length === 0 ? (
              <a
                href="/accounts/new"
                className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Add your first account
              </a>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((account) => {
              const balance = balanceById.get(account.id) ?? 0

              // A liability holds a negative balance while money is owed. It
              // is shown as a magnitude with an "owed" label, never as a bare
              // negative amount.
              const owed = account.isLiability && balance < 0

              return (
                <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{account.name}</span>
                      {account.isLiability ? (
                        <span className="shrink-0 rounded-full bg-expense/10 px-1.5 py-0.5 text-xs font-semibold text-expense">
                          Liability
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-muted">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatPeso(owed ? Math.abs(balance) : balance)}
                      {owed ? <span className="ml-1 font-normal text-ink-muted">owed</span> : null}
                    </p>
                    <a
                      href={`/accounts/${account.id}/edit`}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      Edit
                    </a>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Archived
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Archived accounts are hidden from the pickers, but they keep their balance and their
            history.
          </p>
          <ul className="divide-y divide-border">
            {archived.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-ink-muted">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                </div>
                <form action={restoreAccount.bind(null, account.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
