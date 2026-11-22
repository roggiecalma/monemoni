import { connection } from "next/server"

import { restoreGoal } from "@/lib/actions/goals"
import { getSavingsGoalsWithTotals } from "@/lib/db/queries"
import { formatDate, formatPercent, formatPeso } from "@/lib/money/format"

import { Icon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"

/**
 * The savings goal list.
 *
 * Server Component: every card is plain HTML and the Restore button is a form
 * that posts to a Server Action, so the screen ships no client JavaScript.
 */
export default async function GoalsPage() {
  // The screen shows the signed-in user's goals, so it must be rendered per
  // request — never prerendered at build time.
  await connection()

  const goals = await getSavingsGoalsWithTotals()

  const active = goals.filter((goal) => !goal.archived)
  const archived = goals.filter((goal) => goal.archived)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Goals"
        description="Money you are setting aside. Contributions are not spending — they lower an account balance and build the goal."
        action={
          <a
            href="/goals/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New goal
          </a>
        }
      />

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="target" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No savings goals yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            An emergency fund, a trip, a new laptop — set a target and add money to it as you go.
          </p>
          <a
            href="/goals/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            Add your first goal
          </a>
        </div>
      ) : active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-sunken text-ink-muted">
            <Icon name="target" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No active goals</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            Every goal is archived. Restore one below to keep contributing to it.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((goal) => {
            const percent =
              goal.targetAmount > 0 ? (goal.contributed / goal.targetAmount) * 100 : 0
            // Clamped so an over-funded goal cannot overflow the bar.
            const barWidth = Math.min(100, Math.max(0, percent))

            return (
              <li
                key={goal.id}
                className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]"
              >
                {/* The goal's own colour as a quiet accent. */}
                <div
                  aria-hidden="true"
                  className="h-1.5"
                  style={{ backgroundColor: goal.color }}
                />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ink">{goal.name}</p>
                      <p className="text-xs text-ink-muted">
                        Target {formatPeso(goal.targetAmount)}
                      </p>
                    </div>

                    <a
                      href={`/goals/${goal.id}/edit`}
                      aria-label={`Edit ${goal.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-ink-subtle transition hover:border-border hover:bg-surface-muted hover:text-ink"
                    >
                      <Icon name="pencil" className="size-3.5" />
                    </a>
                  </div>

                  <p className="mt-4 font-display text-2xl font-semibold tracking-tight tabular-nums">
                    {formatPeso(goal.contributed)}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {formatPercent(percent)} of the target
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barWidth}%`, backgroundColor: goal.color }}
                    />
                  </div>

                  {goal.targetDate ? (
                    <p className="mt-3 text-xs text-ink-muted">
                      Target date {formatDate(goal.targetDate)}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-surface-sunken text-ink-subtle">
                <Icon name="archive" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Archived goals</h2>
                <p className="text-xs text-ink-muted">
                  Hidden from the active list; their contributions are kept.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              {archived.length}
              <Icon name="chevron-right" className="size-4 transition group-open:rotate-90" />
            </span>
          </summary>

          <ul className="divide-y divide-border border-t border-border">
            {archived.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-9 shrink-0 rounded-xl border"
                    style={{
                      backgroundColor: `${goal.color}14`,
                      borderColor: `${goal.color}33`,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{goal.name}</p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {formatPeso(goal.contributed)} of {formatPeso(goal.targetAmount)}
                    </p>
                  </div>
                </div>

                <form action={restoreGoal.bind(null, goal.id)}>
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
