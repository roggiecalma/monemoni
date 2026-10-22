/**
 * MoneMoni — account form validation.
 *
 * Everything in this module is **pure**: no database, no request, no clock.
 * The duplicate-name check needs the database, so it lives in the Server
 * Action instead — the action answers with the `name-duplicate` code.
 *
 * The liability sign convention (ARCHITECTURE.md) lives here too: the form
 * asks for a positive "Amount owed", and the server negates it before it is
 * stored, so the stored opening balance of a liability is always negative.
 */

import { z } from "zod"

import { ACCOUNT_TYPES, type Account, type AccountType } from "@/lib/db/schema"
import { centavosToPesoString, parsePesoToCentavosSafe } from "@/lib/money/parse"

/** The longest account name the form accepts. */
export const ACCOUNT_NAME_MAX_LENGTH = 60

/** Every way an account form can fail. */
export const ACCOUNT_ERROR_CODES = [
  "name-required",
  "name-too-long",
  "name-duplicate",
  "type-invalid",
  "opening-balance-invalid",
  "opening-balance-negative",
] as const

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number]

/** The message shown for each error code. */
export const ACCOUNT_ERROR_MESSAGES: Record<AccountErrorCode, string> = {
  "name-required": "Enter an account name.",
  "name-too-long": `Account names can be at most ${ACCOUNT_NAME_MAX_LENGTH} characters.`,
  "name-duplicate": "An account with this name already exists.",
  "type-invalid": "Choose an account type.",
  "opening-balance-invalid": "Enter a valid amount, for example 1,250.50.",
  "opening-balance-negative": "Enter the amount owed as a positive number.",
}

/** Human labels for the account types, shared by the account screens. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-Wallet",
  card: "Credit card",
}

/** The raw values of the account form, before anything is validated. */
export interface AccountFormValues {
  name: string
  type: string
  isLiability: boolean
  /** The raw text of the opening balance field. */
  openingBalance: string
}

/** A validated account, ready to be written to the database. */
export interface AccountInput {
  name: string
  type: AccountType
  isLiability: boolean
  /**
   * The opening balance in centavos, signed the way it is stored: negative
   * for a liability (money owed), exactly as entered for everything else.
   */
  openingBalance: number
}

/** The outcome of validating an account form. */
export type AccountValidationResult =
  | { ok: true; value: AccountInput }
  | { ok: false; code: AccountErrorCode }

/** The result of an account Server Action. */
export interface AccountActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: AccountErrorCode
}

/**
 * Builds the error result for a failure code.
 *
 * The message is read out of the same map the page uses, so the action and
 * the page can never disagree about the wording.
 */
export function accountFailure(code: AccountErrorCode): AccountActionResult {
  return { error: ACCOUNT_ERROR_MESSAGES[code], code }
}

/**
 * Reads the account form out of a `FormData`.
 *
 * Every field is coerced to the shape the validator expects, so it never has
 * to deal with `File` objects or missing values.
 */
export function readAccountFormValues(formData: FormData): AccountFormValues {
  const name = formData.get("name")
  const type = formData.get("type")
  const openingBalance = formData.get("openingBalance")

  return {
    name: typeof name === "string" ? name : "",
    type: typeof type === "string" ? type : "",
    // An unchecked checkbox is not submitted at all, so its presence is the flag.
    isLiability: formData.has("isLiability"),
    openingBalance: typeof openingBalance === "string" ? openingBalance : "",
  }
}

/** The shape of the account form, checked by Zod. */
const accountSchema = z.object({
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
})

/**
 * Maps the field a Zod failure points at to the error code the user sees.
 *
 * The map keeps the message specific: a missing type is "Choose an account
 * type." and not a generic "Invalid input.".
 */
const ACCOUNT_FIELD_CODES: Record<string, AccountErrorCode> = {
  name: "name-required",
  type: "type-invalid",
}

/**
 * The code used when a Zod failure cannot be traced to a single field.
 *
 * The name is the first field of the form and the one the user can always
 * fix, so it is the safest fallback.
 */
const ACCOUNT_FALLBACK_CODE: AccountErrorCode = "name-required"

/** Picks the error code for a failed Zod parse. */
function accountCodeForIssues(issues: readonly { readonly path: PropertyKey[] }[]): AccountErrorCode {
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field !== "string") continue

    const code = ACCOUNT_FIELD_CODES[field]
    if (code) return code
  }

  return ACCOUNT_FALLBACK_CODE
}

/**
 * Validates the account form.
 *
 * Returns the values to store, or the code of the first rule that failed.
 * The rules are the ones in the account form specification: a name that is
 * present and short enough, a known type, and an opening balance that can
 * be parsed.
 */
export function validateAccount(values: AccountFormValues): AccountValidationResult {
  const parsed = accountSchema.safeParse({ name: values.name, type: values.type })

  if (!parsed.success) {
    return { ok: false, code: accountCodeForIssues(parsed.error.issues) }
  }

  const name = parsed.data.name.trim()

  if (name.length === 0) {
    return { ok: false, code: "name-required" }
  }

  if (name.length > ACCOUNT_NAME_MAX_LENGTH) {
    return { ok: false, code: "name-too-long" }
  }

  // The opening balance is optional — an empty field means "no money yet".
  const amountText = values.openingBalance.trim()
  let openingBalance = 0

  if (amountText.length > 0) {
    const parsedAmount = parsePesoToCentavosSafe(amountText)

    // `result.ok` is checked, never the value itself: ₱0.00 is a perfectly
    // valid amount and `0` is falsy.
    if (!parsedAmount.ok) {
      return { ok: false, code: "opening-balance-invalid" }
    }

    openingBalance = parsedAmount.value
  }

  if (values.isLiability) {
    // "Amount owed" is always a positive number: the *stored* balance of a
    // liability is negative, and the server is the one that flips the sign.
    if (openingBalance < 0) {
      return { ok: false, code: "opening-balance-negative" }
    }

    openingBalance = -openingBalance
  }

  return {
    ok: true,
    value: {
      name,
      type: parsed.data.type,
      isLiability: values.isLiability,
      openingBalance,
    },
  }
}

/**
 * The value the opening balance field shows for a stored account.
 *
 * A liability stores a negative balance (money owed) while the form asks
 * for a positive amount, so the magnitude is shown. Every other account
 * shows the signed amount it stores.
 */
export function openingBalanceFieldValue(account: Account): string {
  const amount = account.isLiability ? Math.abs(account.openingBalance) : account.openingBalance

  return centavosToPesoString(amount)
}
