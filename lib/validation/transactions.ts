/**
 * MoneMoni — transaction form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * Whether the chosen account or category actually exists needs the database,
 * so those checks live in the Server Action instead.
 *
 * The integrity rule from ARCHITECTURE.md is enforced in two places on
 * purpose: this module rejects a category whose *kind* it cannot see (the
 * field is required for income/expense), and the action rejects a category
 * whose kind disagrees with the transaction's type.
 */

import { z } from "zod"

import { isValidDateKey, isValidTimeKey } from "@/lib/dates"
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/db/schema"
import { parsePesoToCentavosSafe } from "@/lib/money/parse"

/** The longest note the form accepts. */
export const TRANSACTION_NOTE_MAX_LENGTH = 280

/** Every way a transaction form can fail. */
export const TRANSACTION_ERROR_CODES = [
  "type-invalid",
  "amount-required",
  "amount-invalid",
  "amount-not-positive",
  "date-required",
  "date-invalid",
  "time-invalid",
  "account-required",
  "account-invalid",
  "category-required",
  "category-invalid",
  "category-kind-mismatch",
  "to-account-required",
  "to-account-invalid",
  "to-account-same",
  "note-too-long",
] as const

export type TransactionErrorCode = (typeof TRANSACTION_ERROR_CODES)[number]

/** The message shown for each error code. */
export const TRANSACTION_ERROR_MESSAGES: Record<TransactionErrorCode, string> = {
  "type-invalid": "Choose whether this is income, an expense or a transfer.",
  "amount-required": "Enter an amount.",
  "amount-invalid": "Enter a valid amount, for example 1,250.50.",
  "amount-not-positive": "Enter an amount greater than zero.",
  "date-required": "Choose a date.",
  "date-invalid": "Enter a real calendar date.",
  "time-invalid": "Enter a real time of day.",
  "account-required": "Choose an account.",
  "account-invalid": "Choose an account.",
  "category-required": "Choose a category.",
  "category-invalid": "Choose a category.",
  "category-kind-mismatch": "That category does not match income or expense.",
  "to-account-required": "Choose the account the money moves to.",
  "to-account-invalid": "Choose the account the money moves to.",
  "to-account-same": "The destination must be a different account.",
  "note-too-long": `Notes can be at most ${TRANSACTION_NOTE_MAX_LENGTH} characters.`,
}

/** Human labels for the transaction types, shared by every transaction screen. */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
}

/** The raw values of the transaction form, before anything is validated. */
export interface TransactionFormValues {
  type: string
  /** The raw text of the amount field. */
  amount: string
  date: string
  /** The raw text of the time field (`HH:MM`). */
  time: string
  accountId: string
  categoryId: string
  toAccountId: string
  note: string
}

/** A validated transaction, ready to be written to the database. */
export interface TransactionInput {
  type: TransactionType
  /** Always positive centavos — direction lives in `type`. */
  amount: number
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:MM`, or `null` when the form left it empty. */
  time: string | null
  accountId: string
  /** `null` for a transfer, which has no category. */
  categoryId: string | null
  /** `null` for income and expense. */
  toAccountId: string | null
  note: string | null
}

/** The outcome of validating a transaction form. */
export type TransactionValidationResult =
  | { ok: true; value: TransactionInput }
  | { ok: false; code: TransactionErrorCode }

/** The result of a transaction Server Action. */
export interface TransactionActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: TransactionErrorCode
}

/**
 * Builds the error result for a failure code.
 *
 * The message is read out of the same map the page uses, so the action and
 * the page can never disagree about the wording.
 */
export function transactionFailure(code: TransactionErrorCode): TransactionActionResult {
  return { error: TRANSACTION_ERROR_MESSAGES[code], code }
}

/**
 * Reads the transaction form out of a `FormData`.
 *
 * Every field is coerced to the shape the validator expects, so it never has
 * to deal with `File` objects or missing values.
 */
export function readTransactionFormValues(formData: FormData): TransactionFormValues {
  const read = (key: string): string => {
    const value = formData.get(key)
    return typeof value === "string" ? value : ""
  }

  return {
    type: read("type"),
    amount: read("amount"),
    date: read("date"),
    time: read("time"),
    accountId: read("accountId"),
    categoryId: read("categoryId"),
    toAccountId: read("toAccountId"),
    note: read("note"),
  }
}

/** The shape of the transaction form, checked by Zod. */
const transactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
})

/**
 * The code used when a Zod failure cannot be traced to a single field.
 *
 * The type is the first control of the form and the one that changes the
 * meaning of every other field, so it is the safest fallback.
 */
const TRANSACTION_FALLBACK_CODE: TransactionErrorCode = "type-invalid"

/**
 * Validates the transaction form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 */
export function validateTransaction(values: TransactionFormValues): TransactionValidationResult {
  const parsed = transactionSchema.safeParse({ type: values.type })

  if (!parsed.success) {
    return { ok: false, code: TRANSACTION_FALLBACK_CODE }
  }

  const type = parsed.data.type
  const isTransfer = type === "transfer"

  // The amount is always positive: direction lives in the type, never in the
  // sign. `result.ok` is checked, never the value itself — ₱0.00 is a
  // perfectly valid parse and `0` is falsy.
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

  // The time is optional so a record created before times existed can still
  // be saved untouched; when it is present it must be a real `HH:MM`.
  const time = values.time.trim()

  if (time.length > 0 && !isValidTimeKey(time)) {
    return { ok: false, code: "time-invalid" }
  }

  const accountId = values.accountId.trim()

  if (accountId.length === 0) {
    return { ok: false, code: "account-required" }
  }

  // A transfer moves money between two accounts and has no category.
  // Income and expense have no destination and must have a category.
  let categoryId: string | null = null
  let toAccountId: string | null = null

  if (isTransfer) {
    const destination = values.toAccountId.trim()

    if (destination.length === 0) {
      return { ok: false, code: "to-account-required" }
    }

    if (destination === accountId) {
      return { ok: false, code: "to-account-same" }
    }

    toAccountId = destination
  } else {
    const category = values.categoryId.trim()

    if (category.length === 0) {
      return { ok: false, code: "category-required" }
    }

    categoryId = category
  }

  const noteText = values.note.trim()

  if (noteText.length > TRANSACTION_NOTE_MAX_LENGTH) {
    return { ok: false, code: "note-too-long" }
  }

  return {
    ok: true,
    value: {
      type,
      amount: parsedAmount.value,
      date,
      time: time.length === 0 ? null : time,
      accountId,
      categoryId,
      toAccountId,
      note: noteText.length === 0 ? null : noteText,
    },
  }
}
