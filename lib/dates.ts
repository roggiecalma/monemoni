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
