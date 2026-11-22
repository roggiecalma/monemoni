import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { archiveGoal, createContribution, deleteContribution, updateGoal } from "@/lib/actions/goals"
import { todayKey } from "@/lib/dates"
import {
  getAccounts,
  getGoalContributions,
  getGoalContributionTotal,
  getSavingsGoalById,
} from "@/lib/db/queries"
import { formatDate, formatPercent, formatPeso } from "@/lib/money/format"
import { centavosToPesoString } from "@/lib/money/parse"
import { lookupMessage } from "@/lib/validation/errors"
import {
  CONTRIBUTION_ERROR_MESSAGES,
  CONTRIBUTION_NOTE_MAX_LENGTH,
  GOAL_ERROR_MESSAGES,
  GOAL_NAME_MAX_LENGTH,
} from "@/lib/validation/goals"

import { Icon } from "@/components/ui/icons"
import {
  ErrorNote,
  Field,
  FormPanel,
  InlineNote,
  PageHeader,
} from "@/components/ui/primitives"
import { dangerButtonClass, inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * Edit savings goal screen, with its contributions.
 *
 * Server Component — the goal form, the contribution form and every delete
 * post to a Server Action, so the page ships no client JavaScript.
 */
export default async function EditGoalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  const { id } = await params
  const goal = await getSavingsGoalById(id)

  if (!goal) {
    notFound()
  }

  // The id of the goal comes from the URL, so the actions can be bound to it
  // instead of taking it from the form data.
  const goalId = goal.id

  /**
   * Submits the goal form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateGoal.bind(null, goalId)(formData)
    if (result) {
      redirect(`/goals/${goalId}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  /**
   * Submits the add-contribution form, same post/redirect/get contract.
   */
  async function addContribution(formData: FormData): Promise<void> {
    "use server"
    const result = await createContribution.bind(null, goalId)(formData)
    if (result) {
      redirect(`/goals/${goalId}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  const [contributions, contributed, accounts] = await Promise.all([
    getGoalContributions(goalId),
    getGoalContributionTotal(goalId),
    getAccounts(),
  ])

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))

  const { error } = await searchParams
  // The two forms share one `?error=` slot, so both code maps are consulted.
  const message =
    lookupMessage(GOAL_ERROR_MESSAGES, error) ??
    lookupMessage(CONTRIBUTION_ERROR_MESSAGES, error)

  const percent = goal.targetAmount > 0 ? (contributed / goal.targetAmount) * 100 : 0
  const barWidth = Math.min(100, Math.max(0, percent))

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <a
        href="/goals"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to goals
      </a>

      <PageHeader eyebrow="Goals" title="Edit goal" description={goal.name} />

      {/* Where the goal stands right now. */}
      <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              Contributed
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tracking-tight tabular-nums">
              {formatPeso(contributed)}
            </p>
            <p className="text-xs text-ink-muted tabular-nums">
              {formatPercent(percent)} of {formatPeso(goal.targetAmount)}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="size-9 shrink-0 rounded-xl border"
            style={{ backgroundColor: `${goal.color}14`, borderColor: `${goal.color}33` }}
          />
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full"
            style={{ width: `${barWidth}%`, backgroundColor: goal.color }}
          />
        </div>
      </section>

      {message ? <ErrorNote message={message} /> : null}

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={GOAL_NAME_MAX_LENGTH}
              defaultValue={goal.name}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="targetAmount" label="Target amount" hint="A positive amount, e.g. 50,000.00.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-sm font-medium text-ink-subtle">
                ₱
              </span>
              <input
                id="targetAmount"
                name="targetAmount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={centavosToPesoString(goal.targetAmount)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field
              htmlFor="targetDate"
              label="Target date"
              hint="Optional — leave empty for no deadline."
            >
              <input
                id="targetDate"
                name="targetDate"
                type="date"
                defaultValue={goal.targetDate ?? ""}
                className={inputClass}
              />
            </Field>

            <Field htmlFor="color" label="Colour" hint="Used on the goal card">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={goal.color}
                className="h-[46px] w-full cursor-pointer rounded-xl border border-border bg-surface p-1.5 sm:w-24"
              />
            </Field>
          </div>

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="check" className="size-4" />
            Save changes
          </button>
        </FormPanel>
      </form>

      {/* Contributions — money set aside, not spent. */}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Contributions</h2>
          <p className="text-xs text-ink-muted">
            Money moved into this goal. It lowers the account balance but is not spending.
          </p>
        </div>

        <div className="border-b border-border px-5 py-4">
          <form action={addContribution} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="contribution-date" label="Date">
                <input
                  id="contribution-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={todayKey()}
                  className={inputClass}
                />
              </Field>

              <Field htmlFor="contribution-amount" label="Amount">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-sm font-medium text-ink-subtle">
                    ₱
                  </span>
                  <input
                    id="contribution-amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    className={`${inputClass} pl-8`}
                  />
                </div>
              </Field>
            </div>

            <Field htmlFor="contribution-accountId" label="From account">
              <select
                id="contribution-accountId"
                name="accountId"
                required
                className={inputClass}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.archived ? " · archived" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field htmlFor="contribution-note" label="Note" hint="Optional.">
              <input
                id="contribution-note"
                name="note"
                type="text"
                maxLength={CONTRIBUTION_NOTE_MAX_LENGTH}
                placeholder="From this month’s salary"
                className={inputClass}
              />
            </Field>

            <button type="submit" className={`${primaryButtonClass} w-full`}>
              <Icon name="plus" className="size-4" />
              Add contribution
            </button>
          </form>
        </div>

        {contributions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            No contributions yet. Add the first one above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contributions.map((contribution) => {
              const accountName = accountNames.get(contribution.accountId)
              const detail = [
                formatDate(contribution.date),
                accountName ?? null,
                contribution.note?.trim() || null,
              ]
                .filter(Boolean)
                .join(" · ")

              return (
                <li key={contribution.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{detail}</p>
                      <p className="text-xs text-ink-muted">Contribution</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-income">
                      +{formatPeso(contribution.amount)}
                    </p>
                  </div>

                  {/* A contribution can be deleted, behind a second step. */}
                  <form action={deleteContribution.bind(null, goalId, contribution.id)}>
                    <details className="group mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-ink-subtle transition hover:text-expense">
                        <Icon name="archive" className="size-3.5" />
                        Delete contribution
                      </summary>
                      <div className="mt-2">
                        <button
                          type="submit"
                          className="rounded-lg border border-expense/40 bg-expense/5 px-2.5 py-1.5 text-xs font-semibold text-expense transition hover:bg-expense/10"
                        >
                          Yes, delete it
                        </button>
                      </div>
                    </details>
                  </form>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {goal.archived ? (
        <InlineNote icon="archive">
          This goal is archived. It no longer appears in the active list, but its contributions
          are kept.
        </InlineNote>
      ) : (
        /* Archiving keeps the goal and its history, so it is reversible. */
        <form action={archiveGoal.bind(null, goalId)}>
          <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-expense/10 text-expense">
                  <Icon name="archive" className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Archive this goal</p>
                  <p className="text-xs text-ink-muted">
                    Hidden from the active list; contributions are kept.
                  </p>
                </div>
              </div>
              <Icon
                name="chevron-right"
                className="size-4 text-ink-subtle transition group-open:rotate-90"
              />
            </summary>

            <div className="border-t border-border px-5 py-4">
              <p className="text-sm leading-relaxed text-ink-muted">
                An archived goal keeps every contribution it has received. You can restore it
                later from the goals screen.
              </p>
              <button type="submit" className={`${dangerButtonClass} mt-3`}>
                <Icon name="archive" className="size-4" />
                Yes, archive it
              </button>
            </div>
          </details>
        </form>
      )}
    </div>
  )
}
