/**
 * MoneMoni — peso parsing.
 *
 * All conversions are done with **string arithmetic** so that no float ever
 * touches a peso amount. Amounts are centavos (integers).
 *
 * This module is pure and safe to import from client components.
 */

/** Matches an optional sign, an optional integer part and an optional fraction. */
const NUMBER_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?$/

/**
 * Matches the first thousands group: an optional sign followed by one to
 * three digits.
 */
const FIRST_GROUP_PATTERN = /^[+-]?\d{1,3}$/

/** Matches a thousands group after the first: exactly three digits. */
const THOUSANDS_GROUP_PATTERN = /^\d{3}$/

export type PesoParseResult = { ok: true; value: number } | { ok: false; error: string }

/**
 * Strips whitespace and the `₱` sign. Thousands separators are kept so they
 * can be validated before they are removed.
 */
function stripDecorations(input: string): string {
  return input.replace(/[\s₱]/g, "")
}

/**
 * Checks that every comma in a cleaned amount is a well-formed thousands
 * separator.
 *
 * A well-formed amount groups its digits as `"1,234"` or `"1,234,567"`: the
 * first group holds the leading digits (one to three) and every group after
 * the first holds exactly three digits. `"1,23"`, `"1,2,3"`, `"1234,567"`,
 * `"1,2345"`, `"1,"` and `",123"` are all rejected so a typo can never
 * silently become a different amount.
 *
 * A comma is never allowed in the decimal fraction.
 */
function hasWellFormedSeparators(value: string): boolean {
  const segments = value.split(".")
  const integerPart = segments[0] ?? ""
  const fractionParts = segments.slice(1)

  // Thousands separators only ever belong to the integer part.
  if (fractionParts.some((part) => part.includes(","))) return false

  const groups = integerPart.split(",")
  if (groups.length === 1) return true

  const first = groups[0] ?? ""
  if (!FIRST_GROUP_PATTERN.test(first)) return false

  return groups.slice(1).every((group) => THOUSANDS_GROUP_PATTERN.test(group))
}

function parseInternal(input: string): PesoParseResult {
  const cleaned = stripDecorations(input)
  // The commas are only removed once they have been validated.
  const digitsOnly = cleaned.replace(/,/g, "")

  const match = NUMBER_PATTERN.exec(digitsOnly)
  if (!match) {
    return { ok: false, error: "Enter a valid amount." }
  }

  const sign = match[1] ?? ""
  const wholePart = match[2] ?? ""
  const fractionPart = match[3] ?? ""

  // Nothing numeric at all (e.g. "", "-", ".").
  if (wholePart.length === 0 && fractionPart.length === 0) {
    return { ok: false, error: "Enter an amount." }
  }

  // A comma is only accepted as a well-formed thousands separator.
  if (cleaned.includes(",") && !hasWellFormedSeparators(cleaned)) {
    return { ok: false, error: "Invalid thousands separator." }
  }

  // More than two decimals cannot be represented in centavos — reject it
  // rather than silently rounding the user's input.
  if (fractionPart.length > 2) {
    return { ok: false, error: "Use at most 2 decimal places." }
  }

  // Exact string arithmetic: pesos * 100 + fractional pesos, no floats.
  const wholeCentavos = BigInt(wholePart.length === 0 ? "0" : wholePart) * 100n
  const fractionalCentavos = BigInt(fractionPart.padEnd(2, "0"))
  const centavos = sign === "-" ? -(wholeCentavos + fractionalCentavos) : wholeCentavos + fractionalCentavos

  const value = Number(centavos)
  if (!Number.isSafeInteger(value)) {
    return { ok: false, error: "Enter a valid amount." }
  }

  return { ok: true, value }
}

/**
 * Parses a user-entered peso amount into centavos.
 *
 * Accepts `"1,234.56"`, `"1234"`, `"₱99.90"`, `" 12.5 "`, `"-50"`.
 * Returns `null` for empty input, non-numeric text, more than two decimal
 * places, or a malformed thousands separator (`"1,23"`).
 */
export function parsePesoToCentavos(input: string): number | null {
  const result = parseInternal(input)
  return result.ok ? result.value : null
}

/**
 * Same as {@link parsePesoToCentavos} but returns a discriminated result with
 * a human readable error message.
 */
export function parsePesoToCentavosSafe(input: string): PesoParseResult {
  if (input.trim().length === 0) {
    return { ok: false, error: "Enter an amount." }
  }
  return parseInternal(input)
}

/**
 * Converts centavos to a plain peso string: `123456` → `"1234.56"`,
 * `-500` → `"-5.00"`, `0` → `"0.00"`.
 *
 * An amount outside the safe integer range degrades to `"0.00"`: past that
 * point the decimal string of the magnitude switches to exponential notation
 * (`1e21` → `"1e+21"`), which would produce a malformed peso string.
 */
export function centavosToPesoString(amount: number): string {
  if (!Number.isFinite(amount)) return "0.00"

  const truncated = Math.trunc(amount)

  // The safe integer ceiling is about 9.007e15 — well below the 1e21 point
  // where `Number.prototype.toString` starts using exponential notation.
  if (!Number.isSafeInteger(truncated)) return "0.00"

  const negative = truncated < 0
  const digits = Math.abs(truncated).toString().padStart(3, "0")
  const whole = digits.slice(0, -2)
  const cents = digits.slice(-2)

  return `${negative ? "-" : ""}${whole}.${cents}`
}
