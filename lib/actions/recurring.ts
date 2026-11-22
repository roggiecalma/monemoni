"use server"
/**
 * MoneMoni — recurring bill Server Actions.
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
 * `postRecurringBill` is the exception: it is triggered from the bill list
 * with no form of its own, so it reports its two refusals (`bill-inactive`,
 * `already-logged`) by redirecting with the code itself.
 *
 * Only async functions may be exported from a `"use server"` module, so the
 * error codes and their messages live in `@/lib/validation/recurring`.
 */

import { and, eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { daysInMonth, monthKey, nowTimeKey } from "@/lib/dates"
import { db } from "@/lib/db/client"
import { accounts, categories, recurringBills, transactions } from "@/lib/db/schema"
import { getRecurringBillById } from "@/lib/db/queries"
import {
  readRecurringFormValues,
  recurringFailure,
  validateRecurring,
  type RecurringActionResult,
} from "@/lib/validation/recurring"

/**
 * Does this account exist?
 *
 * Archived accounts are accepted: archiving hides a record from the pickers,
 * it never invalidates a bill that already points at it.
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
 * Is this an existing **expense** category?
 *
 * A bill generates an expense, so an income category is rejected even though
 * it exists. Archived categories are accepted for the same reason archived
 * accounts are.
 */
async function expenseCategoryExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.kind, "expense")))
    .limit(1)

  return rows.length > 0
}

/**
 * The database-dependent checks both writes share.
 *
 * Returns the failure code, or `null` when every reference is valid.
 */
async function checkReferences(input: {
  accountId: string
  categoryId: string | null
}): Promise<RecurringActionResult | null> {
  if (!(await accountExists(input.accountId))) {
    return recurringFailure("account-invalid")
  }

  if (input.categoryId && !(await expenseCategoryExists(input.categoryId))) {
    return recurringFailure("category-invalid")
  }

  return null
}

/**
 * Creates a recurring bill.
 *
 * Returns an error result when the form is not valid; the caller decides
 * how to show it. On success the bill is stored — active, and not logged for
 * any month yet — and the user is sent to the bill list.
 */
export async function createRecurringBill(formData: FormData): Promise<RecurringActionResult> {
  // No session, no write — this check comes before anything else.
  await requireSession()

  const validation = validateRecurring(readRecurringFormValues(formData))

  if (!validation.ok) {
    return recurringFailure(validation.code)
  }

  const { name, amount, frequency, dayOfMonth, startDate, endDate, accountId, categoryId } =
    validation.value

  const referenceFailure = await checkReferences({ accountId, categoryId })

  if (referenceFailure) {
    return referenceFailure
  }

  await db.insert(recurringBills).values({
    id: crypto.randomUUID(),
    name,
    amount,
    frequency,
    dayOfMonth,
    startDate,
    endDate,
    accountId,
    categoryId,
    active: true,
    lastMaterialized: null,
  })

  redirect("/recurring")
}

/**
 * Saves the changes to a recurring bill.
 *
 * The id comes from the URL (it is bound to the action by the page), never
 * from the form data. Whether the bill is active and which month it was last
 * logged for are not part of the form, so they are left untouched.
 */
export async function updateRecurringBill(
  id: string,
  formData: FormData,
): Promise<RecurringActionResult> {
  await requireSession()

  const existing = await getRecurringBillById(id)

  if (!existing) {
    // The bill is gone — there is nothing to save.
    redirect("/recurring")
  }

  const validation = validateRecurring(readRecurringFormValues(formData))

  if (!validation.ok) {
    return recurringFailure(validation.code)
  }

  const { name, amount, frequency, dayOfMonth, startDate, endDate, accountId, categoryId } =
    validation.value

  const referenceFailure = await checkReferences({ accountId, categoryId })

  if (referenceFailure) {
    return referenceFailure
  }

  await db
    .update(recurringBills)
    .set({
      name,
      amount,
      frequency,
      dayOfMonth,
      startDate,
      endDate,
      accountId,
      categoryId,
    })
    .where(eq(recurringBills.id, id))

  redirect("/recurring")
}

/**
 * Deletes a recurring bill.
 *
 * `transactions.recurring_id` is `ON DELETE SET NULL`, so the expenses the
 * bill already generated stay in the ledger — they simply stop pointing at
 * the bill. The form posts no fields; the id comes from the URL.
 */
export async function deleteRecurringBill(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getRecurringBillById(id)

  if (!existing) {
    // Nothing to delete — go back to the list.
    redirect("/recurring")
  }

  await db.delete(recurringBills).where(eq(recurringBills.id, id))

  redirect("/recurring")
}

/**
 * Pauses or resumes a recurring bill.
 *
 * A paused bill keeps its settings and its history; it is simply not offered
 * for logging until it is activated again. The form posts no fields.
 */
export async function toggleRecurringBill(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getRecurringBillById(id)

  if (!existing) {
    // Nothing to toggle — go back to the list.
    redirect("/recurring")
  }

  await db
    .update(recurringBills)
    .set({ active: !existing.active })
    .where(eq(recurringBills.id, id))

  redirect("/recurring")
}

/**
 * Records this month's occurrence of a recurring bill as an expense.
 *
 * The transaction is dated inside the **current** month, on the bill's day of
 * the month clamped to the length of that month (a bill due on the 31st lands
 * on the 28th in February). The note is the bill's name and `recurring_id`
 * points back at it.
 *
 * A weekly bill can be logged more than once a month, so it has no
 * `last_materialized` month; every other frequency records the month it was
 * logged for and refuses a second attempt.
 */
export async function postRecurringBill(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const bill = await getRecurringBillById(id)

  if (!bill) {
    // The bill is gone — there is nothing to log.
    redirect("/recurring")
  }

  if (!bill.active) {
    redirect("/recurring?error=bill-inactive")
  }

  const now = new Date()
  const month = monthKey(now)

  if (bill.frequency !== "weekly" && bill.lastMaterialized === month) {
    redirect("/recurring?error=already-logged")
  }

  const year = now.getFullYear()
  const monthNumber = now.getMonth() + 1
  const day = Math.min(bill.dayOfMonth, daysInMonth(year, monthNumber))
  const date = `${month}-${String(day).padStart(2, "0")}`

  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    date,
    time: nowTimeKey(now),
    type: "expense",
    amount: bill.amount,
    accountId: bill.accountId,
    categoryId: bill.categoryId,
    note: bill.name,
    recurringId: bill.id,
  })

  if (bill.frequency !== "weekly") {
    await db
      .update(recurringBills)
      .set({ lastMaterialized: month })
      .where(eq(recurringBills.id, bill.id))
  }

  redirect("/recurring?logged=1")
}
