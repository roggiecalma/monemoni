import { describe, expect, it } from "vitest"

import { lookupMessage } from "@/lib/validation/errors"
import {
  RECURRING_ERROR_CODES,
  RECURRING_ERROR_MESSAGES,
  RECURRING_FREQUENCY_LABELS,
  RECURRING_NAME_MAX_LENGTH,
  readRecurringFormValues,
  recurringFailure,
  validateRecurring,
  type RecurringFormValues,
} from "@/lib/validation/recurring"

/** Standard valid recurring bill form values, overridable per test. */
function values(overrides: Partial<RecurringFormValues> = {}): RecurringFormValues {
  return {
    name: "Fiber Internet",
    amount: "1,899.00",
    frequency: "monthly",
    dayOfMonth: "15",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    accountId: "acct-bank",
    categoryId: "cat-utilities",
    ...overrides,
  }
}

describe("validateRecurring", () => {
  it("accepts a fully populated valid recurring bill", () => {
    const result = validateRecurring(values())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      name: "Fiber Internet",
      amount: 189900,
      frequency: "monthly",
      dayOfMonth: 15,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      accountId: "acct-bank",
      categoryId: "cat-utilities",
    })
  })

  it("accepts minimal optional fields (no category, no end date)", () => {
    const result = validateRecurring(
      values({
        categoryId: "   ",
        endDate: "   ",
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.categoryId).toBeNull()
    expect(result.value.endDate).toBeNull()
  })

  it("accepts all valid frequencies (weekly, monthly, yearly)", () => {
    for (const freq of ["weekly", "monthly", "yearly"] as const) {
      const result = validateRecurring(values({ frequency: freq }))
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.frequency).toBe(freq)
      }
    }
  })

  it("parses amounts with and without thousands separators", () => {
    const withCommas = validateRecurring(values({ amount: "12,345.50" }))
    expect(withCommas.ok).toBe(true)
    if (withCommas.ok) expect(withCommas.value.amount).toBe(1234550)

    const withoutCommas = validateRecurring(values({ amount: "500" }))
    expect(withoutCommas.ok).toBe(true)
    if (withoutCommas.ok) expect(withoutCommas.value.amount).toBe(50000)
  })

  it("accepts boundary days of month (1, 31, and padded single digits)", () => {
    const day1 = validateRecurring(values({ dayOfMonth: "1" }))
    expect(day1.ok).toBe(true)
    if (day1.ok) expect(day1.value.dayOfMonth).toBe(1)

    const day31 = validateRecurring(values({ dayOfMonth: "31" }))
    expect(day31.ok).toBe(true)
    if (day31.ok) expect(day31.value.dayOfMonth).toBe(31)

    const padded = validateRecurring(values({ dayOfMonth: "07" }))
    expect(padded.ok).toBe(true)
    if (padded.ok) expect(padded.value.dayOfMonth).toBe(7)
  })

  it("rejects an empty or whitespace name", () => {
    expect(validateRecurring(values({ name: "" }))).toEqual({
      ok: false,
      code: "name-required",
    })
    expect(validateRecurring(values({ name: "   " }))).toEqual({
      ok: false,
      code: "name-required",
    })
  })

  it("enforces name max length boundary", () => {
    const maxName = "x".repeat(RECURRING_NAME_MAX_LENGTH)
    const valid = validateRecurring(values({ name: maxName }))
    expect(valid.ok).toBe(true)
    if (valid.ok) expect(valid.value.name).toBe(maxName)

    const tooLong = "x".repeat(RECURRING_NAME_MAX_LENGTH + 1)
    expect(validateRecurring(values({ name: tooLong }))).toEqual({
      ok: false,
      code: "name-too-long",
    })
  })

  it("rejects missing amount", () => {
    expect(validateRecurring(values({ amount: "" }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateRecurring(values({ amount: "   " }))).toEqual({
      ok: false,
      code: "amount-required",
    })
  })

  it("rejects malformed amount and malformed thousands separators", () => {
    expect(validateRecurring(values({ amount: "free" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateRecurring(values({ amount: "1,23" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateRecurring(values({ amount: "123,45" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
  })

  it("rejects zero and negative amounts", () => {
    expect(validateRecurring(values({ amount: "0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateRecurring(values({ amount: "0.00" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateRecurring(values({ amount: "-100" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateRecurring(values({ amount: "-0.50" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
  })

  it("rejects invalid frequency", () => {
    expect(validateRecurring(values({ frequency: "daily" }))).toEqual({
      ok: false,
      code: "frequency-invalid",
    })
    expect(validateRecurring(values({ frequency: "quarterly" }))).toEqual({
      ok: false,
      code: "frequency-invalid",
    })
    expect(validateRecurring(values({ frequency: "" }))).toEqual({
      ok: false,
      code: "frequency-invalid",
    })
  })

  it("rejects invalid day of month", () => {
    expect(validateRecurring(values({ dayOfMonth: "0" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "32" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "-1" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "15th" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "1.5" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "100" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
    expect(validateRecurring(values({ dayOfMonth: "" }))).toEqual({
      ok: false,
      code: "day-of-month-invalid",
    })
  })

  it("rejects missing start date", () => {
    expect(validateRecurring(values({ startDate: "" }))).toEqual({
      ok: false,
      code: "start-date-required",
    })
    expect(validateRecurring(values({ startDate: "   " }))).toEqual({
      ok: false,
      code: "start-date-required",
    })
  })

  it("rejects invalid start date", () => {
    expect(validateRecurring(values({ startDate: "2026-02-30" }))).toEqual({
      ok: false,
      code: "start-date-invalid",
    })
    expect(validateRecurring(values({ startDate: "2026-13-01" }))).toEqual({
      ok: false,
      code: "start-date-invalid",
    })
    expect(validateRecurring(values({ startDate: "not-a-date" }))).toEqual({
      ok: false,
      code: "start-date-invalid",
    })
    expect(validateRecurring(values({ startDate: "01-01-2026" }))).toEqual({
      ok: false,
      code: "start-date-invalid",
    })
  })

  it("validates leap day start date", () => {
    const leapValid = validateRecurring(values({ startDate: "2024-02-29", endDate: "" }))
    expect(leapValid.ok).toBe(true)

    const leapInvalid = validateRecurring(values({ startDate: "2025-02-29" }))
    expect(leapInvalid).toEqual({
      ok: false,
      code: "start-date-invalid",
    })
  })

  it("rejects invalid end date", () => {
    expect(validateRecurring(values({ endDate: "2026-02-31" }))).toEqual({
      ok: false,
      code: "end-date-invalid",
    })
    expect(validateRecurring(values({ endDate: "invalid" }))).toEqual({
      ok: false,
      code: "end-date-invalid",
    })
  })

  it("rejects end date before start date", () => {
    expect(
      validateRecurring(
        values({
          startDate: "2026-06-01",
          endDate: "2026-05-31",
        }),
      ),
    ).toEqual({
      ok: false,
      code: "end-date-before-start",
    })
  })

  it("accepts end date equal to start date", () => {
    const result = validateRecurring(
      values({
        startDate: "2026-06-01",
        endDate: "2026-06-01",
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.startDate).toBe("2026-06-01")
      expect(result.value.endDate).toBe("2026-06-01")
    }
  })

  it("rejects missing account id", () => {
    expect(validateRecurring(values({ accountId: "" }))).toEqual({
      ok: false,
      code: "account-required",
    })
    expect(validateRecurring(values({ accountId: "   " }))).toEqual({
      ok: false,
      code: "account-required",
    })
  })
})

describe("readRecurringFormValues", () => {
  it("reads every field from FormData", () => {
    const data = new FormData()
    data.append("name", "Rent")
    data.append("amount", "25,000.00")
    data.append("frequency", "monthly")
    data.append("dayOfMonth", "1")
    data.append("startDate", "2026-01-01")
    data.append("endDate", "2026-12-31")
    data.append("accountId", "acct-1")
    data.append("categoryId", "cat-1")

    expect(readRecurringFormValues(data)).toEqual({
      name: "Rent",
      amount: "25,000.00",
      frequency: "monthly",
      dayOfMonth: "1",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      accountId: "acct-1",
      categoryId: "cat-1",
    })
  })

  it("returns empty strings for omitted fields", () => {
    expect(readRecurringFormValues(new FormData())).toEqual({
      name: "",
      amount: "",
      frequency: "",
      dayOfMonth: "",
      startDate: "",
      endDate: "",
      accountId: "",
      categoryId: "",
    })
  })
})

describe("recurringFailure", () => {
  it("builds an action result matching the message map", () => {
    expect(recurringFailure("bill-inactive")).toEqual({
      code: "bill-inactive",
      error: RECURRING_ERROR_MESSAGES["bill-inactive"],
    })
    expect(recurringFailure("already-logged")).toEqual({
      code: "already-logged",
      error: RECURRING_ERROR_MESSAGES["already-logged"],
    })
  })
})

describe("recurring error messages and labels", () => {
  it("has a non-empty human message for every code", () => {
    for (const code of RECURRING_ERROR_CODES) {
      expect(RECURRING_ERROR_MESSAGES[code]).toBeDefined()
      expect(RECURRING_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it("labels every frequency", () => {
    expect(RECURRING_FREQUENCY_LABELS).toEqual({
      weekly: "Weekly",
      monthly: "Monthly",
      yearly: "Yearly",
    })
  })

  it("protects against prototype chain lookups", () => {
    expect(lookupMessage(RECURRING_ERROR_MESSAGES, "constructor")).toBeNull()
    expect(lookupMessage(RECURRING_ERROR_MESSAGES, "__proto__")).toBeNull()
    expect(lookupMessage(RECURRING_ERROR_MESSAGES, "toString")).toBeNull()
    expect(lookupMessage(RECURRING_ERROR_MESSAGES, "amount-invalid")).toBe(
      RECURRING_ERROR_MESSAGES["amount-invalid"],
    )
  })
})
