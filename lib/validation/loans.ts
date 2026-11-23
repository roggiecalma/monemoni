/**
 * MoneMoni — peer-to-peer loan and loan payment form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * Whether the chosen account exists needs the database, so that check
 * lives in the Server Action instead.
 */

import { isValidDateKey } from "@/lib/dates"
import { LOAN_DIRECTIONS, type LoanDirection } from "@/lib/db/schema"
import { parsePesoToCentavosSafe } from "@/lib/money/parse"
import { lookupMessage } from "./errors"

export { lookupMessage }

/** The longest person name the form accepts. */
export const LOAN_PERSON_MAX_LENGTH = 60

/** The longest loan note the form accepts. */
export const LOAN_NOTE_MAX_LENGTH = 280

/** The longest loan payment note the form accepts. */
export const LOAN_PAYMENT_NOTE_MAX_LENGTH = 280

/** Every way a loan form can fail. */
export const LOAN_ERROR_CODES = [
  "person-required",
  "person-too-long",
  "amount-required",
  "amount-invalid",
  "amount-not-positive",
  "direction-invalid",
  "date-required",
  "date-invalid",
  "due-date-invalid",
  "account-required",
  "account-invalid",
  "note-too-long",
] as const

export type LoanErrorCode = (typeof LOAN_ERROR_CODES)[number]

/** The message shown for each loan error code. */
export const LOAN_ERROR_MESSAGES: Record<LoanErrorCode, string> = {
  "person-required": "Enter a person's name.",
  "person-too-long": `Person's name can be at most ${LOAN_PERSON_MAX_LENGTH} characters.`,
  "amount-required": "Enter an amount.",
  "amount-invalid": "Enter a valid amount, for example 1,250.50.",
  "amount-not-positive": "Enter an amount greater than zero.",
  "direction-invalid": "Choose whether you owe or are owed.",
  "date-required": "Choose a date.",
  "date-invalid": "Enter a real calendar date.",
  "due-date-invalid": "Enter a real calendar date for the due date.",
  "account-required": "Choose an account.",
  "account-invalid": "Choose an account.",
  "note-too-long": `Notes can be at most ${LOAN_NOTE_MAX_LENGTH} characters.`,
}

/** Every way a loan payment form can fail. */
export const LOAN_PAYMENT_ERROR_CODES = [
  "amount-required",
  "amount-invalid",
  "amount-not-positive",
  "date-required",
  "date-invalid",
  "account-required",
  "account-invalid",
  "note-too-long",
] as const

export type LoanPaymentErrorCode = (typeof LOAN_PAYMENT_ERROR_CODES)[number]

/** The message shown for each loan payment error code. */
export const LOAN_PAYMENT_ERROR_MESSAGES: Record<LoanPaymentErrorCode, string> = {
  "amount-required": "Enter an amount.",
  "amount-invalid": "Enter a valid amount, for example 1,250.50.",
  "amount-not-positive": "Enter an amount greater than zero.",
  "date-required": "Choose a date.",
  "date-invalid": "Enter a real calendar date.",
  "account-required": "Choose an account.",
  "account-invalid": "Choose an account.",
  "note-too-long": `Notes can be at most ${LOAN_PAYMENT_NOTE_MAX_LENGTH} characters.`,
}

/** The raw values of the loan form, before anything is validated. */
export interface LoanFormValues {
  person: string
  /** The raw text of the amount field. */
  amount: string
  direction: string
  /** `YYYY-MM-DD` */
  date: string
  /** `YYYY-MM-DD`, or empty for "no due date". */
  dueDate: string
  accountId?: string
  note: string
}

/** A validated loan, ready to be written to the database. */
export interface LoanInput {
  person: string
  /** Amount in centavos. */
  amount: number
  direction: LoanDirection
  /** `YYYY-MM-DD` */
  date: string
  /** `YYYY-MM-DD`, or `null` when no due date. */
  dueDate: string | null
  accountId?: string | null
  note: string | null
}

/** The outcome of validating a loan form. */
export type LoanValidationResult =
  | { ok: true; value: LoanInput }
  | { ok: false; code: LoanErrorCode }

/** The result of a loan Server Action. */
export interface LoanActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: LoanErrorCode
}

/** The raw values of the loan payment form, before anything is validated. */
export interface LoanPaymentFormValues {
  /** The raw text of the amount field. */
  amount: string
  accountId: string
  /** `YYYY-MM-DD` */
  date: string
  note: string
}

/** A validated loan payment, ready to be written to the database. */
export interface LoanPaymentInput {
  /** Amount in centavos. */
  amount: number
  accountId: string
  /** `YYYY-MM-DD` */
  date: string
  note: string | null
}

/** The outcome of validating a loan payment form. */
export type LoanPaymentValidationResult =
  | { ok: true; value: LoanPaymentInput }
  | { ok: false; code: LoanPaymentErrorCode }

/** The result of a loan payment Server Action. */
export interface LoanPaymentActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: LoanPaymentErrorCode
}

/**
 * Builds the error result for a loan failure code.
 */
export function loanFailure(code: LoanErrorCode): LoanActionResult {
  return { error: LOAN_ERROR_MESSAGES[code], code }
}

/**
 * Builds the error result for a loan payment failure code.
 */
export function loanPaymentFailure(code: LoanPaymentErrorCode): LoanPaymentActionResult {
  return { error: LOAN_PAYMENT_ERROR_MESSAGES[code], code }
}

/**
 * Reads the loan form out of a `FormData`.
 */
export function readLoanFormValues(formData: FormData): LoanFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  const result: LoanFormValues = {
    person: read("person"),
    amount: read("amount"),
    direction: read("direction"),
    date: read("date"),
    dueDate: read("dueDate"),
    note: read("note"),
  }

  const accountId = read("accountId")
  if (accountId.length > 0) {
    result.accountId = accountId
  }

  return result
}

/**
 * Reads the loan payment form out of a `FormData`.
 */
export function readLoanPaymentFormValues(formData: FormData): LoanPaymentFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  return {
    amount: read("amount"),
    accountId: read("accountId"),
    date: read("date"),
    note: read("note"),
  }
}

/**
 * Validates the loan form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateLoan(values: LoanFormValues): LoanValidationResult {
  const person = values.person.trim()

  if (person.length === 0) {
    return { ok: false, code: "person-required" }
  }

  if (person.length > LOAN_PERSON_MAX_LENGTH) {
    return { ok: false, code: "person-too-long" }
  }

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

  const directionText = values.direction.trim()

  if (!LOAN_DIRECTIONS.includes(directionText as LoanDirection)) {
    return { ok: false, code: "direction-invalid" }
  }

  const date = values.date.trim()

  if (date.length === 0) {
    return { ok: false, code: "date-required" }
  }

  if (!isValidDateKey(date)) {
    return { ok: false, code: "date-invalid" }
  }

  const dueDateText = values.dueDate.trim()
  let dueDate: string | null = null

  if (dueDateText.length > 0) {
    if (!isValidDateKey(dueDateText)) {
      return { ok: false, code: "due-date-invalid" }
    }

    dueDate = dueDateText
  }

  const noteText = values.note.trim()

  if (noteText.length > LOAN_NOTE_MAX_LENGTH) {
    return { ok: false, code: "note-too-long" }
  }

  const accountIdRaw = values.accountId?.trim() ?? ""

  return {
    ok: true,
    value: {
      person,
      amount: parsedAmount.value,
      direction: directionText as LoanDirection,
      date,
      dueDate,
      ...(accountIdRaw.length > 0 ? { accountId: accountIdRaw } : {}),
      note: noteText.length === 0 ? null : noteText,
    },
  }
}

/**
 * Validates the loan payment form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateLoanPayment(values: LoanPaymentFormValues): LoanPaymentValidationResult {
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

  const noteText = values.note.trim()

  if (noteText.length > LOAN_PAYMENT_NOTE_MAX_LENGTH) {
    return { ok: false, code: "note-too-long" }
  }

  return {
    ok: true,
    value: {
      amount: parsedAmount.value,
      accountId,
      date,
      note: noteText.length === 0 ? null : noteText,
    },
  }
}
