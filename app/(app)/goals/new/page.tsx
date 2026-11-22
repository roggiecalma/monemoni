import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createGoal } from "@/lib/actions/goals"
import { GOAL_ERROR_MESSAGES, GOAL_NAME_MAX_LENGTH } from "@/lib/validation/goals"
import { lookupMessage } from "@/lib/validation/errors"

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

/** The colour a new goal starts with — a calm blue, matching the brand. */
const DEFAULT_GOAL_COLOR = "#0ea5e9"

/**
 * New savings goal screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function NewGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await createGoal(formData)
    if (result) {
      redirect(`/goals/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(GOAL_ERROR_MESSAGES, error)

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/goals"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to goals
      </a>

      <PageHeader
        eyebrow="Goals"
        title="New goal"
        description="Something you are saving for, and how much it takes."
      />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={GOAL_NAME_MAX_LENGTH}
              autoFocus
              placeholder="Emergency fund"
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
                placeholder="0.00"
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field htmlFor="targetDate" label="Target date" hint="Optional — leave empty for no deadline.">
              <input id="targetDate" name="targetDate" type="date" className={inputClass} />
            </Field>

            <Field htmlFor="color" label="Colour" hint="Used on the goal card">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={DEFAULT_GOAL_COLOR}
                className="h-[46px] w-full cursor-pointer rounded-xl border border-border bg-surface p-1.5 sm:w-24"
              />
            </Field>
          </div>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="plus" className="size-4" />
            Create goal
          </button>
        </FormPanel>
      </form>
    </div>
  )
}
