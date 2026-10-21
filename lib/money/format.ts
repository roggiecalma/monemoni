/**
 * MoneMoni — peso / date formatting helpers.
 *
 * Every amount handled here is in **centavos** (integers).
 * This module is pure and safe to import from client components.
 */

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
})

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

/** Drops a trailing `.0` so `1.0` becomes `1`. */
function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value
}

/**
 * Formats centavos as a peso amount: `123456` → `"₱1,234.56"`,
 * `-123456` → `"-₱1,234.56"`.
 */
export function formatPeso(amount: number): string {
  const centavos = Number.isFinite(amount) ? Math.trunc(amount) : 0
  // Avoid "-₱0.00" for negative zero.
  const pesos = centavos === 0 ? 0 : centavos / 100
  return pesoFormatter.format(pesos)
}

/**
 * Compact peso format for charts and tight spaces: `120000` → `"₱1.2k"`,
 * `1230000` → `"₱12.3k"`, `123456700` → `"₱1.2M"`, `0` → `"₱0"`.
 */
export function formatPesoCompact(amount: number): string {
  const centavos = Number.isFinite(amount) ? Math.trunc(amount) : 0
  const pesos = centavos / 100
  const absolute = Math.abs(pesos)
  const sign = pesos < 0 ? "-" : ""

  if (absolute < 1_000) {
    return `${sign}₱${String(Number(absolute.toFixed(2)))}`
  }

  if (absolute < 1_000_000) {
    return `${sign}₱${trimTrailingZero((absolute / 1_000).toFixed(1))}k`
  }

  return `${sign}₱${trimTrailingZero((absolute / 1_000_000).toFixed(1))}M`
}

/**
 * Formats a percentage value (already expressed in percent units, e.g. `12.3`
 * → `"12.3%"`).
 */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.0%"
  return `${value.toFixed(1)}%`
}

/**
 * Formats a `YYYY-MM` month: `"2026-10"` → `"October 2026"`.
 * Unrecognised input is returned unchanged.
 */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim())
  if (!match) return month

  const year = Number(match[1])
  const monthNumber = Number(match[2])
  if (monthNumber < 1 || monthNumber > 12) return month

  return `${MONTH_NAMES[monthNumber - 1]} ${year}`
}

/**
 * Formats a `YYYY-MM-DD` date: `"2026-10-21"` → `"Oct 21, 2026"`.
 * Unrecognised input is returned unchanged.
 */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim())
  if (!match) return date

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return date

  return `${MONTH_NAMES_SHORT[month - 1]} ${day}, ${year}`
}
