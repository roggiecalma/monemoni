/**
 * MoneMoni — local calendar date helpers.
 *
 * Dates in this app are **local calendar** dates, never timestamps: months
 * are `YYYY-MM` and days are `YYYY-MM-DD` (see ARCHITECTURE.md). Every
 * helper below therefore reads the local calendar fields of the `Date` it is
 * given — using UTC would shift dates by a day for users in other timezones.
 *
 * This module is pure and safe to import from client components.
 */

/** Zero-pads a number to two digits (`7` → `"07"`). */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** Days per month for a non-leap year, indexed by month number (1–12). */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

/**
 * A year is a leap year when it is divisible by 4, except for century years,
 * which must also be divisible by 400 (`2024` yes, `1900` no, `2000` yes).
 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/**
 * Number of days in a month (1–12) of a given year.
 *
 * This is a pure integer calculation on purpose: parsing the date string
 * would silently roll impossible dates over into the next month
 * (`new Date("2026-02-31")` is March 3rd).
 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month - 1] ?? 0
}

/**
 * Is this a real `YYYY-MM-DD` calendar day?
 *
 * Checks the shape and the day-of-month, so impossible dates such as
 * `2026-02-31` are rejected rather than silently rolled over into March.
 */
export function isValidDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) return false
  if (day < 1) return false

  return day <= daysInMonth(year, month)
}

/**
 * Is this a well-formed `YYYY-MM` month?
 *
 * The month is a calendar month, not a date, so only the shape and the
 * 1–12 range are checked.
 */
export function isValidMonthKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return false

  const month = Number(match[2])
  return month >= 1 && month <= 12
}

/**
 * The month key (`YYYY-MM`) of a date, using the local calendar.
 *
 * `new Date(2026, 9, 22)` → `"2026-10"`.
 */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/**
 * The day key (`YYYY-MM-DD`) of a date, using the local calendar.
 *
 * `new Date(2026, 9, 22)` → `"2026-10-22"`.
 */
export function dateKey(date: Date): string {
  return `${monthKey(date)}-${pad2(date.getDate())}`
}

/**
 * The day key (`YYYY-MM-DD`) of the last day of the given date's month.
 *
 * `new Date(2026, 1, 10)` → `"2026-02-28"`.
 */
export function lastDayOfMonth(date: Date): string {
  return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

/**
 * The day key (`YYYY-MM-DD`) of today, in the local calendar.
 *
 * Handy as the default value of a date input. The date can be passed in
 * explicitly to keep the helper testable.
 */
export function todayKey(today: Date = new Date()): string {
  return dateKey(today)
}

/**
 * The time key (`HH:MM`) of a date, using the local clock.
 *
 * `new Date(2026, 9, 22, 8, 5)` → `"08:05"`. Minutes only — seconds are
 * noise on a personal ledger entry.
 */
export function timeKey(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** The time key (`HH:MM`) of right now, in the local clock. */
export function nowTimeKey(now: Date = new Date()): string {
  return timeKey(now)
}

/**
 * Is this a real `HH:MM` time of day?
 *
 * `00:00` and `23:59` are valid; `24:00` and `09:60` are not.
 */
export function isValidTimeKey(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return false

  const hours = Number(match[1])
  const minutes = Number(match[2])

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}
