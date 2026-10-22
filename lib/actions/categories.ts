"use server"
/**
 * MoneMoni — category Server Actions.
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
 * error codes and their messages live in `@/lib/validation/categories`.
 */

import { and, eq, ne, sql, type SQL } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { categories, type CategoryKind } from "@/lib/db/schema"
import { getCategoryById } from "@/lib/db/queries"
import {
  categoryFailure,
  readCategoryFormValues,
  validateCategory,
  type CategoryActionResult,
} from "@/lib/validation/categories"

/**
 * Is another category of the same kind already using this name?
 *
 * The comparison ignores case and surrounding spaces. The check is scoped
 * per kind on purpose: the seed data has an "Others" expense category *and*
 * an "Others" income category, so a global check would reject valid data.
 *
 * `exceptId` leaves out the category that is being edited — saving a
 * category without changing its name must not report a duplicate of itself.
 */
async function categoryNameTaken(
  name: string,
  kind: CategoryKind,
  exceptId?: string,
): Promise<boolean> {
  const conditions: SQL[] = [
    eq(sql`lower(${categories.name})`, name.toLowerCase()),
    eq(categories.kind, kind),
  ]

  if (exceptId) {
    conditions.push(ne(categories.id, exceptId))
  }

  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...conditions))
    .limit(1)

  return rows.length > 0
}

/**
 * The sort order a new category gets: one past the highest one in use
 * **within its own kind**.
 *
 * The seed numbers the categories within each kind so both lists start at
 * 0, and a new category keeps that numbering intact.
 */
async function nextCategorySortOrder(kind: CategoryKind): Promise<number> {
  const rows = await db
    .select({ highest: sql<number | null>`max(${categories.sortOrder})` })
    .from(categories)
    .where(eq(categories.kind, kind))

  const highest = rows[0]?.highest ?? null

  return highest === null ? 0 : highest + 1
}

/**
 * Creates a category.
 *
 * Returns an error result when the form is not valid; the caller decides
 * how to show it. On success the category is stored and the user is sent to
 * the category list, so this function does not return in that case.
 */
export async function createCategory(formData: FormData): Promise<CategoryActionResult> {
  // No session, no write — this check comes before anything else.
  await requireSession()

  const validation = validateCategory(readCategoryFormValues(formData))

  if (!validation.ok) {
    return categoryFailure(validation.code)
  }

  const { name, kind, icon, color } = validation.value

  // The duplicate check needs the database, so it cannot live in the pure
  // validator.
  if (await categoryNameTaken(name, kind)) {
    return categoryFailure("name-duplicate")
  }

  await db.insert(categories).values({
    id: crypto.randomUUID(),
    name,
    kind,
    icon,
    color,
    archived: false,
    sortOrder: await nextCategorySortOrder(kind),
  })

  redirect("/categories")
}

/**
 * Saves the changes to a category.
 *
 * The id comes from the URL (it is bound to the action by the page), never
 * from the form data. Returns an error result when the form is not valid;
 * the caller decides how to show it.
 */
export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireSession()

  const existing = await getCategoryById(id)

  if (!existing) {
    // The category is gone — there is nothing to save.
    redirect("/categories")
  }

  const validation = validateCategory(readCategoryFormValues(formData))

  if (!validation.ok) {
    return categoryFailure(validation.code)
  }

  const { name, kind, icon, color } = validation.value

  if (await categoryNameTaken(name, kind, id)) {
    return categoryFailure("name-duplicate")
  }

  await db
    .update(categories)
    .set({ name, kind, icon, color })
    .where(eq(categories.id, id))

  redirect("/categories")
}

/**
 * Archives a category.
 *
 * Archiving is the only removal operation: transactions reference
 * categories, so nothing is ever deleted. An archived category is hidden
 * from the pickers but a historic transaction still shows its name and
 * colour, and it can be restored.
 *
 * The form posts no fields — the id comes from the URL.
 */
export async function archiveCategory(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getCategoryById(id)

  if (!existing) {
    // Nothing to archive — go back to the list.
    redirect("/categories")
  }

  await db.update(categories).set({ archived: true }).where(eq(categories.id, id))

  redirect("/categories")
}

/**
 * Restores an archived category.
 *
 * The form posts no fields — the id comes from the URL.
 */
export async function restoreCategory(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getCategoryById(id)

  if (!existing) {
    // Nothing to restore — go back to the list.
    redirect("/categories")
  }

  await db.update(categories).set({ archived: false }).where(eq(categories.id, id))

  redirect("/categories")
}
