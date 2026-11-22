/**
 * MoneMoni — savings goal and goal contribution form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * Whether the chosen goal or account exists needs the database, so those
 * checks live in the Server Action instead.
 */

import { isValidDateKey } from "@/lib/dates"
import { parsePesoToCentavosSafe } from "@/lib/money/parse"

/** The longest goal name the form accepts. */
export const GOAL_NAME_MAX_LENGTH = 60

/** The longest contribution note the form accepts. */
export const CONTRIBUTION_NOTE_MAX_LENGTH = 280

/** Every way a savings goal form can fail. */
export const GOAL_ERROR_CODES = [
  "name-required",
  "name-too-long",
  "target-required",
  "target-invalid",
  "target-not-positive",
  "target-date-invalid",
  "color-invalid",
] as const

export type GoalErrorCode = (typeof GOAL_ERROR_CODES)[number]

/** The message shown for each goal error code. */
export const GOAL_ERROR_MESSAGES: Record<GoalErrorCode, string> = {
  "name-required": "Enter a name for this goal.",
  "name-too-long": `Goal names can be at most ${GOAL_NAME_MAX_LENGTH} characters.`,
  "target-required": "Enter a target amount.",
  "target-invalid": "Enter a valid amount, for example 1,250.50.",
  "target-not-positive": "Enter a target greater than zero.",
  "target-date-invalid": "Enter a real calendar date for the target date.",
  "color-invalid": "Choose a colour for this goal.",
}

/** Every way a goal contribution form can fail. */
export const CONTRIBUTION_ERROR_CODES = [
  "amount-required",
  "amount-invalid",
  "amount-not-positive",
  "date-required",
  "date-invalid",
  "account-required",
  "account-invalid",
  "note-too-long",
] as const

export type ContributionErrorCode = (typeof CONTRIBUTION_ERROR_CODES)[number]

/** The message shown for each contribution error code. */
export const CONTRIBUTION_ERROR_MESSAGES: Record<ContributionErrorCode, string> = {
  "amount-required": "Enter an amount.",
  "amount-invalid": "Enter a valid amount, for example 1,250.50.",
  "amount-not-positive": "Enter an amount greater than zero.",
  "date-required": "Choose a date.",
  "date-invalid": "Enter a real calendar date.",
  "account-required": "Choose an account.",
  "account-invalid": "Choose an account.",
  "note-too-long": `Notes can be at most ${CONTRIBUTION_NOTE_MAX_LENGTH} characters.`,
}

/** A colour is stored as `#rrggbb` — six hex digits, same as a category. */
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** The raw values of the savings goal form, before anything is validated. */
export interface GoalFormValues {
  name: string
  /** The raw text of the target amount field. */
  targetAmount: string
  /** `YYYY-MM-DD`, or empty for "no deadline". */
  targetDate: string
  color: string
}

/** A validated savings goal, ready to be written to the database. */
export interface GoalInput {
  name: string
  /** Target amount in centavos. */
  targetAmount: number
  /** `YYYY-MM-DD`, or `null` when the goal has no deadline. */
  targetDate: string | null
  color: string
}

/** The outcome of validating a savings goal form. */
export type GoalValidationResult =
  | { ok: true; value: GoalInput }
  | { ok: false; code: GoalErrorCode }

/** The result of a savings goal Server Action. */
export interface GoalActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: GoalErrorCode
}

/** The raw values of the contribution form, before anything is validated. */
export interface ContributionFormValues {
  /** The raw text of the amount field. */
  amount: string
  /** `YYYY-MM-DD` */
  date: string
  accountId: string
  note: string
}

/** A validated contribution, ready to be written to the database. */
export interface ContributionInput {
  /** Amount in centavos. */
  amount: number
  /** `YYYY-MM-DD` */
  date: string
  accountId: string
  note: string | null
}

/** The outcome of validating a contribution form. */
export type ContributionValidationResult =
  | { ok: true; value: ContributionInput }
  | { ok: false; code: ContributionErrorCode }

/** The result of a contribution Server Action. */
export interface ContributionActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: ContributionErrorCode
}

/**
 * Builds the error result for a goal failure code.
 *
 * The message is read out of the same map the page uses, so the action and
 * the page can never disagree about the wording.
 */
export function goalFailure(code: GoalErrorCode): GoalActionResult {
  return { error: GOAL_ERROR_MESSAGES[code], code }
}

/**
 * Builds the error result for a contribution failure code.
 */
export function contributionFailure(code: ContributionErrorCode): ContributionActionResult {
  return { error: CONTRIBUTION_ERROR_MESSAGES[code], code }
}

/**
 * Reads the savings goal form out of a `FormData`.
 *
 * Every field is coerced to the shape the validator expects, so it never has
 * to deal with `File` objects or missing values.
 */
export function readGoalFormValues(formData: FormData): GoalFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  return {
    name: read("name"),
    targetAmount: read("targetAmount"),
    targetDate: read("targetDate"),
    color: read("color"),
  }
}

/**
 * Reads the contribution form out of a `FormData`.
 */
export function readContributionFormValues(formData: FormData): ContributionFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  return {
    amount: read("amount"),
    date: read("date"),
    accountId: read("accountId"),
    note: read("note"),
  }
}

/**
 * Validates the savings goal form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateGoal(values: GoalFormValues): GoalValidationResult {
  const name = values.name.trim()

  if (name.length === 0) {
    return { ok: false, code: "name-required" }
  }

  if (name.length > GOAL_NAME_MAX_LENGTH) {
    return { ok: false, code: "name-too-long" }
  }

  const targetText = values.targetAmount.trim()

  if (targetText.length === 0) {
    return { ok: false, code: "target-required" }
  }

  // `result.ok` is checked, never the value itself — ₱0.00 is a perfectly
  // valid parse and `0` is falsy.
  const parsedTarget = parsePesoToCentavosSafe(targetText)

  if (!parsedTarget.ok) {
    return { ok: false, code: "target-invalid" }
  }

  if (parsedTarget.value <= 0) {
    return { ok: false, code: "target-not-positive" }
  }

  const targetDateText = values.targetDate.trim()
  let targetDate: string | null = null

  if (targetDateText.length > 0) {
    if (!isValidDateKey(targetDateText)) {
      return { ok: false, code: "target-date-invalid" }
    }

    targetDate = targetDateText
  }

  const color = values.color.trim()

  if (!COLOR_PATTERN.test(color)) {
    return { ok: false, code: "color-invalid" }
  }

  return {
    ok: true,
    value: {
      name,
      targetAmount: parsedTarget.value,
      targetDate,
      color: color.toLowerCase(),
    },
  }
}

/**
 * Validates the contribution form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateContribution(
  values: ContributionFormValues,
): ContributionValidationResult {
  const amountText = values.amount.trim()

  if (amountText.length === 0) {
    return { ok: false, code: "amount-required" }
  }

  const parsedAmount = parsePesoToCentavosSafe(amountText)

  if (!parsedAmount.ok) {
    return { ok: false, code: "amount-invalid" }
  }

  if (parsedAmount.value <= 0) {
    return { ok: false, code: "amount-not-positive" }
  }

  const date = values.date.trim()

  if (date.length === 0) {
    return { ok: false, code: "date-required" }
  }

  if (!isValidDateKey(date)) {
    return { ok: false, code: "date-invalid" }
  }

  const accountId = values.accountId.trim()

  if (accountId.length === 0) {
    return { ok: false, code: "account-required" }
  }

  const note = values.note.trim()

  if (note.length > CONTRIBUTION_NOTE_MAX_LENGTH) {
    return { ok: false, code: "note-too-long" }
  }

  return {
    ok: true,
    value: {
      amount: parsedAmount.value,
      date,
      accountId,
      note: note.length === 0 ? null : note,
    },
  }
}
