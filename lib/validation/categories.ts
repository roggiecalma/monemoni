/**
 * MoneMoni — category form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * The duplicate-name check needs the database, so it lives in the Server
 * Action instead — the action answers with the `name-duplicate` code.
 */

import { z } from "zod"

import { CATEGORY_KINDS, type CategoryKind } from "@/lib/db/schema"

/** The longest category name the form accepts. */
export const CATEGORY_NAME_MAX_LENGTH = 40

/** The longest icon the form accepts — a single emoji, give or take. */
export const CATEGORY_ICON_MAX_LENGTH = 8

/** Every way a category form can fail. */
export const CATEGORY_ERROR_CODES = [
  "name-required",
  "name-too-long",
  "name-duplicate",
  "kind-invalid",
  "icon-required",
  "icon-too-long",
  "color-invalid",
] as const

export type CategoryErrorCode = (typeof CATEGORY_ERROR_CODES)[number]

/** The message shown for each error code. */
export const CATEGORY_ERROR_MESSAGES: Record<CategoryErrorCode, string> = {
  "name-required": "Enter a category name.",
  "name-too-long": `Category names can be at most ${CATEGORY_NAME_MAX_LENGTH} characters.`,
  "name-duplicate": "A category with this name already exists.",
  "kind-invalid": "Choose a category type.",
  "icon-required": "Choose an icon for this category.",
  "icon-too-long": `Icons can be at most ${CATEGORY_ICON_MAX_LENGTH} characters.`,
  "color-invalid": "Choose a colour for this category.",
}

/** Human labels for the category kinds, shared by the category screens. */
export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Income",
  expense: "Expense",
}

/** A colour is stored as `#rrggbb` — six hex digits. */
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** The raw values of the category form, before anything is validated. */
export interface CategoryFormValues {
  name: string
  kind: string
  icon: string
  color: string
}

/** A validated category, ready to be written to the database. */
export interface CategoryInput {
  name: string
  kind: CategoryKind
  icon: string
  color: string
}

/** The outcome of validating a category form. */
export type CategoryValidationResult =
  | { ok: true; value: CategoryInput }
  | { ok: false; code: CategoryErrorCode }

/** The result of a category Server Action. */
export interface CategoryActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: CategoryErrorCode
}

/**
 * Builds the error result for a failure code.
 *
 * The message is read out of the same map the page uses, so the action and
 * the page can never disagree about the wording.
 */
export function categoryFailure(code: CategoryErrorCode): CategoryActionResult {
  return { error: CATEGORY_ERROR_MESSAGES[code], code }
}

/**
 * Reads the category form out of a `FormData`.
 *
 * Every field is coerced to the shape the validator expects, so it never has
 * to deal with `File` objects or missing values.
 */
export function readCategoryFormValues(formData: FormData): CategoryFormValues {
  const name = formData.get("name")
  const kind = formData.get("kind")
  const icon = formData.get("icon")
  const color = formData.get("color")

  return {
    name: typeof name === "string" ? name : "",
    kind: typeof kind === "string" ? kind : "",
    icon: typeof icon === "string" ? icon : "",
    color: typeof color === "string" ? color : "",
  }
}

/** The shape of the category form, checked by Zod. */
const categorySchema = z.object({
  name: z.string(),
  kind: z.enum(CATEGORY_KINDS),
})

/**
 * Maps the field a Zod failure points at to the error code the user sees.
 *
 * The map keeps the message specific: a missing kind is "Choose a category
 * type." and not a generic "Invalid input.".
 */
const CATEGORY_FIELD_CODES: Record<string, CategoryErrorCode> = {
  name: "name-required",
  kind: "kind-invalid",
  icon: "icon-required",
  color: "color-invalid",
}

/**
 * The code used when a Zod failure cannot be traced to a single field.
 *
 * The name is the first field of the form and the one the user can always
 * fix, so it is the safest fallback.
 */
const CATEGORY_FALLBACK_CODE: CategoryErrorCode = "name-required"

/** Picks the error code for a failed Zod parse. */
function categoryCodeForIssues(
  issues: readonly { readonly path: PropertyKey[] }[],
): CategoryErrorCode {
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field !== "string") continue

    const code = CATEGORY_FIELD_CODES[field]
    if (code) return code
  }

  return CATEGORY_FALLBACK_CODE
}

/**
 * Validates the category form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 * The rules are the ones in the category form specification: a name that is
 * present and short enough, a known kind, an icon, and a `#rrggbb` colour.
 */
export function validateCategory(values: CategoryFormValues): CategoryValidationResult {
  const parsed = categorySchema.safeParse({ name: values.name, kind: values.kind })

  if (!parsed.success) {
    return { ok: false, code: categoryCodeForIssues(parsed.error.issues) }
  }

  const name = parsed.data.name.trim()

  if (name.length === 0) {
    return { ok: false, code: "name-required" }
  }

  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    return { ok: false, code: "name-too-long" }
  }

  const icon = values.icon.trim()

  if (icon.length === 0) {
    return { ok: false, code: "icon-required" }
  }

  if (icon.length > CATEGORY_ICON_MAX_LENGTH) {
    return { ok: false, code: "icon-too-long" }
  }

  const color = values.color.trim()

  if (!COLOR_PATTERN.test(color)) {
    return { ok: false, code: "color-invalid" }
  }

  return {
    ok: true,
    value: {
      name,
      kind: parsed.data.kind,
      icon,
      color: color.toLowerCase(),
    },
  }
}
