/**
 * MoneMoni — recurring bill form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * Whether the chosen account or category exists needs the database, so those
 * checks live in the Server Action instead.
 *
 * The `bill-inactive` and `already-logged` codes never come out of
 * `validateRecurring`: they are the two reasons the "Log bill" action refuses
 * to materialise a transaction, and they travel back through the URL the same
 * way a form failure does.
 */

import { z } from "zod"

import { isValidDateKey } from "@/lib/dates"
import { RECURRING_FREQUENCIES, type RecurringFrequency } from "@/lib/db/schema"
import { parsePesoToCentavosSafe } from "@/lib/money/parse"

/** The longest bill name the form accepts. */
export const RECURRING_NAME_MAX_LENGTH = 80

/** Every way a recurring bill form — or the log action — can fail. */
export const RECURRING_ERROR_CODES = [
  "name-required",
  "name-too-long",
  "amount-required",
  "amount-invalid",
  "amount-not-positive",
  "frequency-invalid",
  "day-of-month-invalid",
  "start-date-required",
  "start-date-invalid",
  "end-date-invalid",
  "end-date-before-start",
  "account-required",
  "account-invalid",
  "category-invalid",
  "bill-inactive",
  "already-logged",
] as const

export type RecurringErrorCode = (typeof RECURRING_ERROR_CODES)[number]

/** The message shown for each error code. */
export const RECURRING_ERROR_MESSAGES: Record<RecurringErrorCode, string> = {
  "name-required": "Enter a name for this bill.",
  "name-too-long": `Bill names can be at most ${RECURRING_NAME_MAX_LENGTH} characters.`,
  "amount-required": "Enter an amount.",
  "amount-invalid": "Enter a valid amount, for example 1,250.50.",
  "amount-not-positive": "Enter an amount greater than zero.",
  "frequency-invalid": "Choose how often this bill repeats.",
  "day-of-month-invalid": "Choose a day of the month between 1 and 31.",
  "start-date-required": "Choose a start date.",
  "start-date-invalid": "Enter a real calendar date.",
  "end-date-invalid": "Enter a real calendar date for the end date.",
  "end-date-before-start": "The end date cannot be before the start date.",
  "account-required": "Choose an account.",
  "account-invalid": "Choose an account.",
  "category-invalid": "Choose an expense category.",
  "bill-inactive": "This bill is paused. Activate it before logging it.",
  "already-logged": "This bill has already been logged this month.",
}

/** Human labels for the recurring frequencies, shared by the bill screens. */
export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
}

/** The raw values of the recurring bill form, before anything is validated. */
export interface RecurringFormValues {
  name: string
  /** The raw text of the amount field. */
  amount: string
  frequency: string
  /** The raw text of the day-of-month field. */
  dayOfMonth: string
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD`, or empty for "no end". */
  endDate: string
  accountId: string
  /** Empty means "no category". */
  categoryId: string
}

/** A validated recurring bill, ready to be written to the database. */
export interface RecurringInput {
  name: string
  /** Amount in centavos. */
  amount: number
  frequency: RecurringFrequency
  dayOfMonth: number
  /** `YYYY-MM-DD` */
  startDate: string
  /** `YYYY-MM-DD`, or `null` when the bill has no end. */
  endDate: string | null
  accountId: string
  /** `null` when the bill has no category. */
  categoryId: string | null
}

/** The outcome of validating a recurring bill form. */
export type RecurringValidationResult =
  | { ok: true; value: RecurringInput }
  | { ok: false; code: RecurringErrorCode }

/** The result of a recurring bill Server Action. */
export interface RecurringActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: RecurringErrorCode
}

/**
 * Builds the error result for a failure code.
 *
 * The message is read out of the same map the page uses, so the action and
 * the page can never disagree about the wording.
 */
export function recurringFailure(code: RecurringErrorCode): RecurringActionResult {
  return { error: RECURRING_ERROR_MESSAGES[code], code }
}

/**
 * Reads the recurring bill form out of a `FormData`.
 *
 * Every field is coerced to the shape the validator expects, so it never has
 * to deal with `File` objects or missing values.
 */
export function readRecurringFormValues(formData: FormData): RecurringFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  return {
    name: read("name"),
    amount: read("amount"),
    frequency: read("frequency"),
    dayOfMonth: read("dayOfMonth"),
    startDate: read("startDate"),
    endDate: read("endDate"),
    accountId: read("accountId"),
    categoryId: read("categoryId"),
  }
}

/** The shape of the recurring bill form, checked by Zod. */
const recurringSchema = z.object({
  frequency: z.enum(RECURRING_FREQUENCIES),
})

/** Matches a day-of-month written as one or two digits. */
const DAY_PATTERN = /^\d{1,2}$/

/**
 * Validates the recurring bill form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateRecurring(values: RecurringFormValues): RecurringValidationResult {
  const name = values.name.trim()

  if (name.length === 0) {
    return { ok: false, code: "name-required" }
  }

  if (name.length > RECURRING_NAME_MAX_LENGTH) {
    return { ok: false, code: "name-too-long" }
  }

  const amountText = values.amount.trim()

  if (amountText.length === 0) {
    return { ok: false, code: "amount-required" }
  }

  // `result.ok` is checked, never the value itself — ₱0.00 is a perfectly
  // valid parse and `0` is falsy.
  const parsedAmount = parsePesoToCentavosSafe(amountText)

  if (!parsedAmount.ok) {
    return { ok: false, code: "amount-invalid" }
  }

  if (parsedAmount.value <= 0) {
    return { ok: false, code: "amount-not-positive" }
  }

  const parsedFrequency = recurringSchema.safeParse({ frequency: values.frequency })

  if (!parsedFrequency.success) {
    return { ok: false, code: "frequency-invalid" }
  }

  const dayText = values.dayOfMonth.trim()

  if (!DAY_PATTERN.test(dayText)) {
    return { ok: false, code: "day-of-month-invalid" }
  }

  const dayOfMonth = Number(dayText)

  if (dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, code: "day-of-month-invalid" }
  }

  const startDate = values.startDate.trim()

  if (startDate.length === 0) {
    return { ok: false, code: "start-date-required" }
  }

  if (!isValidDateKey(startDate)) {
    return { ok: false, code: "start-date-invalid" }
  }

  const endDateText = values.endDate.trim()
  let endDate: string | null = null

  if (endDateText.length > 0) {
    if (!isValidDateKey(endDateText)) {
      return { ok: false, code: "end-date-invalid" }
    }

    // `YYYY-MM-DD` sorts lexicographically in date order.
    if (endDateText < startDate) {
      return { ok: false, code: "end-date-before-start" }
    }

    endDate = endDateText
  }

  const accountId = values.accountId.trim()

  if (accountId.length === 0) {
    return { ok: false, code: "account-required" }
  }

  const categoryId = values.categoryId.trim()

  return {
    ok: true,
    value: {
      name,
      amount: parsedAmount.value,
      frequency: parsedFrequency.data.frequency,
      dayOfMonth,
      startDate,
      endDate,
      accountId,
      categoryId: categoryId.length === 0 ? null : categoryId,
    },
  }
}
