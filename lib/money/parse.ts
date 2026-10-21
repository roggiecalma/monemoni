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

export type PesoParseResult = { ok: true; value: number } | { ok: false; error: string }

/** Strips whitespace, the `₱` sign and thousands separators. */
function stripDecorations(input: string): string {
  return input.replace(/[\s,₱]/g, "")
}

function parseInternal(input: string): PesoParseResult {
  const cleaned = stripDecorations(input)
  const match = NUMBER_PATTERN.exec(cleaned)
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
 * Returns `null` for empty input, non-numeric text, or more than two
 * decimal places.
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
 */
export function centavosToPesoString(amount: number): string {
  if (!Number.isFinite(amount)) return "0.00"

  const truncated = Math.trunc(amount)
  const negative = truncated < 0
  const digits = Math.abs(truncated).toString().padStart(3, "0")
  const whole = digits.slice(0, -2)
  const cents = digits.slice(-2)

  return `${negative ? "-" : ""}${whole}.${cents}`
}
