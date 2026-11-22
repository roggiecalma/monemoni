"use server"
/**
 * MoneMoni — savings goal Server Actions.
 *
 * Every action follows the same order: `requireSession()` first, then the
 * pure validation, then the database-dependent checks, then the write, and
 * finally a `redirect()` (post/redirect/get).
 *
 * A validation failure is **never** thrown at the caller: the action
 * returns an error result carrying a short code and the page turns that
 * into a redirect with the code in the URL. That keeps every screen a pure
 * Server Component — no client JavaScript required.
 *
 * Only async functions may be exported from a `"use server"` module, so the
 * error codes and their messages live in `@/lib/validation/goals`.
 */

import { and, eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { accounts, goalContributions, savingsGoals } from "@/lib/db/schema"
import { getSavingsGoalById } from "@/lib/db/queries"
import {
  contributionFailure,
  goalFailure,
  readContributionFormValues,
  readGoalFormValues,
  validateContribution,
  validateGoal,
  type ContributionActionResult,
  type GoalActionResult,
} from "@/lib/validation/goals"

/**
 * Does this account exist?
 *
 * Archived accounts are accepted: archiving hides a record from the pickers,
 * it never invalidates a contribution that already points at it.
 */
async function accountExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1)

  return rows.length > 0
}

/**
 * Creates a savings goal.
 *
 * Returns an error result when the form is not valid; the caller decides
 * how to show it. On success the goal is stored and the user is sent to the
 * goal list, so this function does not return in that case.
 */
export async function createGoal(formData: FormData): Promise<GoalActionResult> {
  // No session, no write — this check comes before anything else.
  await requireSession()

  const validation = validateGoal(readGoalFormValues(formData))

  if (!validation.ok) {
    return goalFailure(validation.code)
  }

  const { name, targetAmount, targetDate, color } = validation.value

  await db.insert(savingsGoals).values({
    id: crypto.randomUUID(),
    name,
    targetAmount,
    targetDate,
    color,
    archived: false,
  })

  redirect("/goals")
}

/**
 * Saves the changes to a savings goal.
 *
 * The id comes from the URL (it is bound to the action by the page), never
 * from the form data. Returns an error result when the form is not valid;
 * the caller decides how to show it.
 */
export async function updateGoal(id: string, formData: FormData): Promise<GoalActionResult> {
  await requireSession()

  const existing = await getSavingsGoalById(id)

  if (!existing) {
    // The goal is gone — there is nothing to save.
    redirect("/goals")
  }

  const validation = validateGoal(readGoalFormValues(formData))

  if (!validation.ok) {
    return goalFailure(validation.code)
  }

  const { name, targetAmount, targetDate, color } = validation.value

  await db
    .update(savingsGoals)
    .set({ name, targetAmount, targetDate, color })
    .where(eq(savingsGoals.id, id))

  redirect("/goals")
}

/**
 * Archives a savings goal.
 *
 * Archiving keeps the goal and its contributions, and hides it from the
 * active list until it is restored. The form posts no fields; the id comes
 * from the URL.
 */
export async function archiveGoal(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getSavingsGoalById(id)

  if (!existing) {
    // Nothing to archive — go back to the list.
    redirect("/goals")
  }

  await db.update(savingsGoals).set({ archived: true }).where(eq(savingsGoals.id, id))

  redirect("/goals")
}

/**
 * Restores an archived savings goal.
 *
 * The form posts no fields — the id comes from the URL.
 */
export async function restoreGoal(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getSavingsGoalById(id)

  if (!existing) {
    // Nothing to restore — go back to the list.
    redirect("/goals")
  }

  await db.update(savingsGoals).set({ archived: false }).where(eq(savingsGoals.id, id))

  redirect("/goals")
}

/**
 * Records a contribution to a savings goal.
 *
 * Money moved into a goal is set aside, not spent: it is a
 * `goal_contributions` row, never a transaction, so it stays out of expense
 * totals and category breakdowns. The goal id comes from the URL.
 */
export async function createContribution(
  goalId: string,
  formData: FormData,
): Promise<ContributionActionResult> {
  await requireSession()

  const goal = await getSavingsGoalById(goalId)

  if (!goal) {
    // The goal is gone — there is nowhere to contribute.
    redirect("/goals")
  }

  const validation = validateContribution(readContributionFormValues(formData))

  if (!validation.ok) {
    return contributionFailure(validation.code)
  }

  const { amount, date, accountId, note } = validation.value

  // The account check needs the database, so it cannot live in the pure
  // validator.
  if (!(await accountExists(accountId))) {
    return contributionFailure("account-invalid")
  }

  await db.insert(goalContributions).values({
    id: crypto.randomUUID(),
    goalId,
    date,
    amount,
    accountId,
    note,
  })

  redirect(`/goals/${goalId}/edit`)
}

/**
 * Deletes a contribution.
 *
 * The contribution must belong to the goal in the URL — otherwise the delete
 * is silently skipped, so a hand-crafted pair of ids cannot remove another
 * goal's contribution. The form posts no fields.
 */
export async function deleteContribution(
  goalId: string,
  contributionId: string,
  formData: FormData,
): Promise<void> {
  await requireSession()

  const rows = await db
    .select({ id: goalContributions.id })
    .from(goalContributions)
    .where(
      and(
        eq(goalContributions.id, contributionId),
        eq(goalContributions.goalId, goalId),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    // Nothing to delete — go back to the goal.
    redirect(`/goals/${goalId}/edit`)
  }

  await db.delete(goalContributions).where(eq(goalContributions.id, contributionId))

  redirect(`/goals/${goalId}/edit`)
}
