import { describe, expect, it } from "vitest"

import { daysInMonth, isValidDateKey, isValidMonthKey, isValidTimeKey, nowTimeKey, timeKey } from "@/lib/dates"
import {
  TRANSACTION_ERROR_MESSAGES,
  TRANSACTION_TYPE_LABELS,
  readTransactionFormValues,
  validateTransaction,
  type TransactionFormValues,
} from "@/lib/validation/transactions"
import { lookupMessage } from "@/lib/validation/errors"

/** The standard valid form, overridable per test. */
function values(overrides: Partial<TransactionFormValues> = {}): TransactionFormValues {
  return {
    type: "expense",
    amount: "125.50",
    date: "2026-10-05",
    time: "12:30",
    accountId: "acct-cash",
    categoryId: "cat-food",
    toAccountId: "",
    note: "Lunch",
    ...overrides,
  }
}

describe("validateTransaction", () => {
  it("accepts a valid expense", () => {
    const result = validateTransaction(values())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      type: "expense",
      amount: 12550,
      date: "2026-10-05",
      time: "12:30",
      accountId: "acct-cash",
      categoryId: "cat-food",
      toAccountId: null,
      note: "Lunch",
    })
  })

  it("accepts a valid income", () => {
    const result = validateTransaction(values({ type: "income", categoryId: "cat-salary" }))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.type).toBe("income")
  })

  it("accepts a transfer and drops the category", () => {
    const result = validateTransaction(
      values({ type: "transfer", categoryId: "cat-food", toAccountId: "acct-bank" }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.categoryId).toBeNull()
    expect(result.value.toAccountId).toBe("acct-bank")
  })

  it("parses thousands separators", () => {
    const result = validateTransaction(values({ amount: "1,234.50" }))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.amount).toBe(123450)
  })

  it("rejects an unknown type", () => {
    expect(validateTransaction(values({ type: "bogus" }))).toEqual({
      ok: false,
      code: "type-invalid",
    })
  })

  it("rejects a missing amount", () => {
    expect(validateTransaction(values({ amount: "   " }))).toEqual({
      ok: false,
      code: "amount-required",
    })
  })

  it("rejects a malformed amount and a malformed separator", () => {
    expect(validateTransaction(values({ amount: "abc" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateTransaction(values({ amount: "1,23" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
  })

  it("rejects zero and negative amounts", () => {
    expect(validateTransaction(values({ amount: "0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateTransaction(values({ amount: "-50" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
  })

  it("rejects a missing or impossible date", () => {
    expect(validateTransaction(values({ date: "" }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateTransaction(values({ date: "2026-02-31" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateTransaction(values({ date: "05/10/2026" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
  })

  it("rejects an impossible time", () => {
    expect(validateTransaction(values({ time: "24:00" }))).toEqual({
      ok: false,
      code: "time-invalid",
    })
    expect(validateTransaction(values({ time: "09:60" }))).toEqual({
      ok: false,
      code: "time-invalid",
    })
    expect(validateTransaction(values({ time: "9:30" }))).toEqual({
      ok: false,
      code: "time-invalid",
    })
    expect(validateTransaction(values({ time: "noon" }))).toEqual({
      ok: false,
      code: "time-invalid",
    })
  })

  it("treats an empty time as no time", () => {
    const result = validateTransaction(values({ time: "  " }))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.time).toBeNull()
  })

  it("accepts midnight and the last minute of the day", () => {
    const midnight = validateTransaction(values({ time: "00:00" }))
    expect(midnight.ok && midnight.value.time).toBe("00:00")

    const last = validateTransaction(values({ time: "23:59" }))
    expect(last.ok && last.value.time).toBe("23:59")
  })

  it("rejects a missing account", () => {
    expect(validateTransaction(values({ accountId: " " }))).toEqual({
      ok: false,
      code: "account-required",
    })
  })

  it("requires a category for income and expense", () => {
    expect(validateTransaction(values({ categoryId: "" }))).toEqual({
      ok: false,
      code: "category-required",
    })
  })

  it("requires a destination account for a transfer", () => {
    expect(validateTransaction(values({ type: "transfer", toAccountId: "" }))).toEqual({
      ok: false,
      code: "to-account-required",
    })
  })

  it("rejects a transfer to the same account", () => {
    expect(
      validateTransaction(
        values({ type: "transfer", accountId: "acct-cash", toAccountId: "acct-cash" }),
      ),
    ).toEqual({ ok: false, code: "to-account-same" })
  })

  it("rejects a note that is too long", () => {
    expect(validateTransaction(values({ note: "x".repeat(281) }))).toEqual({
      ok: false,
      code: "note-too-long",
    })
  })

  it("stores an empty note as null and trims the rest", () => {
    const empty = validateTransaction(values({ note: "   " }))
    expect(empty.ok && empty.value.note).toBeNull()

    const padded = validateTransaction(values({ note: "  Lunch  " }))
    expect(padded.ok && padded.value.note).toBe("Lunch")
  })
})

describe("readTransactionFormValues", () => {
  it("coerces every field to a string", () => {
    const formData = new FormData()
    formData.append("type", "income")
    formData.append("amount", "10")
    formData.append("date", "2026-10-05")
    formData.append("time", "08:15")
    formData.append("accountId", "a")
    formData.append("categoryId", "c")
    formData.append("toAccountId", "b")
    formData.append("note", "n")

    expect(readTransactionFormValues(formData)).toEqual({
      type: "income",
      amount: "10",
      date: "2026-10-05",
      time: "08:15",
      accountId: "a",
      categoryId: "c",
      toAccountId: "b",
      note: "n",
    })
  })

  it("returns empty strings for missing fields", () => {
    const result = readTransactionFormValues(new FormData())

    expect(result).toEqual({
      type: "",
      amount: "",
      date: "",
      time: "",
      accountId: "",
      categoryId: "",
      toAccountId: "",
      note: "",
    })
  })
})

describe("error messages", () => {
  it("has a message for every known code", () => {
    for (const message of Object.values(TRANSACTION_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0)
    }
  })

  it("labels every transaction type", () => {
    expect(TRANSACTION_TYPE_LABELS).toEqual({
      income: "Income",
      expense: "Expense",
      transfer: "Transfer",
    })
  })

  it("cannot be read through the prototype chain", () => {
    expect(lookupMessage(TRANSACTION_ERROR_MESSAGES, "constructor")).toBeNull()
    expect(lookupMessage(TRANSACTION_ERROR_MESSAGES, "__proto__")).toBeNull()
    expect(lookupMessage(TRANSACTION_ERROR_MESSAGES, "amount-invalid")).toBe(
      TRANSACTION_ERROR_MESSAGES["amount-invalid"],
    )
  })
})

describe("date helpers", () => {
  it("knows the length of every month", () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(1900, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it("validates a real calendar day", () => {
    expect(isValidDateKey("2026-10-05")).toBe(true)
    expect(isValidDateKey("2024-02-29")).toBe(true)
    expect(isValidDateKey("2026-02-29")).toBe(false)
    expect(isValidDateKey("2026-02-31")).toBe(false)
    expect(isValidDateKey("2026-13-01")).toBe(false)
    expect(isValidDateKey("2026-00-10")).toBe(false)
    expect(isValidDateKey("2026-1-5")).toBe(false)
    expect(isValidDateKey("not-a-date")).toBe(false)
  })

  it("validates a month key", () => {
    expect(isValidMonthKey("2026-10")).toBe(true)
    expect(isValidMonthKey("2026-01")).toBe(true)
    expect(isValidMonthKey("2026-13")).toBe(false)
    expect(isValidMonthKey("2026-00")).toBe(false)
    expect(isValidMonthKey("2026-1")).toBe(false)
    expect(isValidMonthKey("October")).toBe(false)
  })

  it("builds a zero-padded time key from the local clock", () => {
    expect(timeKey(new Date(2026, 9, 22, 8, 5))).toBe("08:05")
    expect(timeKey(new Date(2026, 9, 22, 0, 0))).toBe("00:00")
    expect(timeKey(new Date(2026, 9, 22, 23, 59))).toBe("23:59")
    // Midday stays on the same local day.
    expect(timeKey(new Date(2026, 9, 22, 12, 30))).toBe("12:30")
  })

  it("returns the current time on demand", () => {
    expect(nowTimeKey(new Date(2026, 0, 2, 7, 9))).toBe("07:09")
    expect(isValidTimeKey(nowTimeKey())).toBe(true)
  })

  it("validates a time of day", () => {
    expect(isValidTimeKey("00:00")).toBe(true)
    expect(isValidTimeKey("23:59")).toBe(true)
    expect(isValidTimeKey("12:30")).toBe(true)
    expect(isValidTimeKey("24:00")).toBe(false)
    expect(isValidTimeKey("23:60")).toBe(false)
    expect(isValidTimeKey("9:30")).toBe(false)
    expect(isValidTimeKey("09:5")).toBe(false)
    expect(isValidTimeKey("")).toBe(false)
  })
})
