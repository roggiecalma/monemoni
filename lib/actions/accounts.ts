"use server"
/**
 * MoneMoni — account Server Actions.
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
 * error codes and their messages live in `@/lib/validation/accounts`.
 */

import { and, eq, ne, sql, type SQL } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { accounts } from "@/lib/db/schema"
import { getAccountById } from "@/lib/db/queries"
import {
  accountFailure,
  readAccountFormValues,
  validateAccount,
  type AccountActionResult,
} from "@/lib/validation/accounts"

/**
 * Is another account already using this name?
 *
 * The comparison ignores case and surrounding spaces, so "bpi bank" and
 * "BPI Bank" are the same account. `exceptId` leaves out the account that
 * is being edited — saving an account without changing its name must not
 * report a duplicate of itself.
 */
async function accountNameTaken(name: string, exceptId?: string): Promise<boolean> {
  const conditions: SQL[] = [eq(sql`lower(${accounts.name})`, name.toLowerCase())]

  if (exceptId) {
    conditions.push(ne(accounts.id, exceptId))
  }

  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(...conditions))
    .limit(1)

  return rows.length > 0
}

/**
 * The sort order a new account gets: one past the highest one in use.
 *
 * The first account of an empty install gets 0, which is where the seeded
 * accounts start too.
 */
async function nextAccountSortOrder(): Promise<number> {
  const rows = await db
    .select({ highest: sql<number | null>`max(${accounts.sortOrder})` })
    .from(accounts)

  const highest = rows[0]?.highest ?? null

  return highest === null ? 0 : highest + 1
}

/**
 * Creates an account.
 *
 * Returns an error result when the form is not valid; the caller decides
 * how to show it. On success the account is stored and the user is sent to
 * the account list, so this function does not return in that case.
 */
export async function createAccount(formData: FormData): Promise<AccountActionResult> {
  // No session, no write — this check comes before anything else.
  await requireSession()

  const validation = validateAccount(readAccountFormValues(formData))

  if (!validation.ok) {
    return accountFailure(validation.code)
  }

  const { name, type, isLiability, openingBalance } = validation.value

  // The duplicate check needs the database, so it cannot live in the pure
  // validator.
  if (await accountNameTaken(name)) {
    return accountFailure("name-duplicate")
  }

  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    name,
    type,
    isLiability,
    openingBalance,
    archived: false,
    sortOrder: await nextAccountSortOrder(),
  })

  redirect("/accounts")
}

/**
 * Saves the changes to an account.
 *
 * The id comes from the URL (it is bound to the action by the page), never
 * from the form data. Returns an error result when the form is not valid;
 * the caller decides how to show it.
 */
export async function updateAccount(
  id: string,
  formData: FormData,
): Promise<AccountActionResult> {
  await requireSession()

  const existing = await getAccountById(id)

  if (!existing) {
    // The account is gone — there is nothing to save.
    redirect("/accounts")
  }

  const validation = validateAccount(readAccountFormValues(formData))

  if (!validation.ok) {
    return accountFailure(validation.code)
  }

  const { name, type, isLiability, openingBalance } = validation.value

  if (await accountNameTaken(name, id)) {
    return accountFailure("name-duplicate")
  }

  await db
    .update(accounts)
    .set({ name, type, isLiability, openingBalance })
    .where(eq(accounts.id, id))

  redirect("/accounts")
}

/**
 * Archives an account.
 *
 * Archiving is the only removal operation: transactions reference accounts,
 * so nothing is ever deleted. An archived account is hidden from the
 * pickers but keeps its balance and its history, and it can be restored.
 *
 * The form posts no fields — the id comes from the URL.
 */
export async function archiveAccount(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getAccountById(id)

  if (!existing) {
    // Nothing to archive — go back to the list.
    redirect("/accounts")
  }

  await db.update(accounts).set({ archived: true }).where(eq(accounts.id, id))

  redirect("/accounts")
}

/**
 * Restores an archived account.
 *
 * The form posts no fields — the id comes from the URL.
 */
export async function restoreAccount(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getAccountById(id)

  if (!existing) {
    // Nothing to restore — go back to the list.
    redirect("/accounts")
  }

  await db.update(accounts).set({ archived: false }).where(eq(accounts.id, id))

  redirect("/accounts")
}
