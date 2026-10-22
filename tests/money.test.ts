/**
 * MoneMoni — money parsing and formatting.
 *
 * The parsing rules are the ones written down in ARCHITECTURE.md:
 *
 * - User input may contain thousands separators, but they must be **well
 *   formed**: groups of exactly three digits with a first group of one to
 *   three digits (`1,234`, `1,234,567`). A malformed grouping (`1,23`,
 *   `1,2,3`, `1234,567`) is **rejected** — it must never be silently
 *   reinterpreted as a different amount.
 * - A comma is never allowed in the decimal fraction.
 * - All arithmetic is integer (centavos) arithmetic — no float ever touches
 *   a peso amount.
 */

import { describe, expect, it } from "vitest"

import {
  formatDate,
  formatMonth,
  formatPercent,
  formatPeso,
  formatPesoCompact,
} from "@/lib/money/format"
import {
  centavosToPesoString,
  parsePesoToCentavos,
  parsePesoToCentavosSafe,
} from "@/lib/money/parse"

describe("parsePesoToCentavos — well-formed thousands separators", () => {
  it("parses amounts whose separators are correctly grouped", () => {
    // No separator at all.
    expect(parsePesoToCentavos("1234")).toBe(123400)
    // One group of three.
    expect(parsePesoToCentavos("1,234")).toBe(123400)
    expect(parsePesoToCentavos("12,345")).toBe(1234500)
    // Several groups of three.
    expect(parsePesoToCentavos("1,234,567")).toBe(123456700)
    expect(parsePesoToCentavos("123,456,789")).toBe(12345678900)
    // A separator plus decimals.
    expect(parsePesoToCentavos("1,234.56")).toBe(123456)
    // The peso sign is stripped wherever it appears.
    expect(parsePesoToCentavos("₱1,234.56")).toBe(123456)
  })

  it("parses amounts with whitespace, a sign and a separator", () => {
    expect(parsePesoToCentavos(" 12.5 ")).toBe(1250)
    expect(parsePesoToCentavos("-50")).toBe(-5000)
    expect(parsePesoToCentavos("+1,234")).toBe(123400)
    expect(parsePesoToCentavos("-12,345.67")).toBe(-1234567)
  })

  it("rejects a malformed thousands separator instead of silently reinterpreting it", () => {
    // A group that is not exactly three digits.
    expect(parsePesoToCentavos("1,23")).toBeNull()
    expect(parsePesoToCentavos("1,2,3")).toBeNull()
    // A dangling or leading separator.
    expect(parsePesoToCentavos("1,")).toBeNull()
    expect(parsePesoToCentavos(",123")).toBeNull()
    // A group with too many digits.
    expect(parsePesoToCentavos("1,2345")).toBeNull()
    expect(parsePesoToCentavos("1,23,456")).toBeNull()
    // The first group may only hold one to three digits.
    expect(parsePesoToCentavos("1234,567")).toBeNull()
    // A short group in the middle.
    expect(parsePesoToCentavos("1,234,56,789")).toBeNull()
  })

  it("rejects a comma in the decimal fraction", () => {
    expect(parsePesoToCentavos("1.23,45")).toBeNull()
    expect(parsePesoToCentavos("1,23.45")).toBeNull()
    expect(parsePesoToCentavos("0.5,5")).toBeNull()
  })

  it("is unaffected by the length of a number that has no separator", () => {
    // The separator validation only ever applies to inputs that contain a
    // comma — a plain long number is parsed normally.
    expect(parsePesoToCentavos("1234567890")).toBe(123456789000)
    expect(parsePesoToCentavos("1234567890123")).toBe(123456789012300)
    // The largest whole-peso amount that still fits into a safe integer.
    expect(parsePesoToCentavos("90071992547409")).toBe(9007199254740900)
    // One peso more and the amount cannot be represented exactly any more.
    expect(parsePesoToCentavos("90071992547410")).toBeNull()
  })

  it("rejects input that is not a valid amount", () => {
    expect(parsePesoToCentavos("")).toBeNull()
    expect(parsePesoToCentavos("   ")).toBeNull()
    expect(parsePesoToCentavos("abc")).toBeNull()
    expect(parsePesoToCentavos("12abc")).toBeNull()
    // More than two decimal places cannot be represented in centavos.
    expect(parsePesoToCentavos("1.234")).toBeNull()
    expect(parsePesoToCentavos("-")).toBeNull()
    expect(parsePesoToCentavos(".")).toBeNull()
    expect(parsePesoToCentavos("1e5")).toBeNull()
    expect(parsePesoToCentavos("₱")).toBeNull()
  })

  it("handles edge cases", () => {
    // Explicit plus sign.
    expect(parsePesoToCentavos("+50")).toBe(5000)
    // The peso sign is stripped wherever it appears, so "50₱" is accepted.
    expect(parsePesoToCentavos("50₱")).toBe(5000)
    // Zero with decimals.
    expect(parsePesoToCentavos("0")).toBe(0)
    expect(parsePesoToCentavos("0.00")).toBe(0)
    expect(parsePesoToCentavos(".50")).toBe(50)
    expect(parsePesoToCentavos("12.")).toBe(1200)
    expect(parsePesoToCentavos("-0.01")).toBe(-1)
    // Whitespace-only around a valid amount is trimmed.
    expect(parsePesoToCentavos("\t1,000\n")).toBe(100000)
    // A number that cannot be represented exactly as an integer is rejected
    // instead of silently losing precision.
    expect(parsePesoToCentavos("99999999999999999999")).toBeNull()
  })
})

describe("parsePesoToCentavosSafe — error messages", () => {
  it("returns ok/true with the parsed value for valid input", () => {
    const result = parsePesoToCentavosSafe("1,234.56")
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected a successful parse")
    expect(result.value).toBe(123456)

    const zero = parsePesoToCentavosSafe("0")
    expect(zero.ok).toBe(true)
    if (!zero.ok) throw new Error("expected a successful parse")
    expect(zero.value).toBe(0)
  })

  it("reports a malformed thousands separator", () => {
    for (const input of [
      "1,23",
      "1,2,3",
      "1,",
      ",123",
      "1,2345",
      "1,23,456",
      "1234,567",
      "1,234,56,789",
      "1.23,45",
    ]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error).toBe("Invalid thousands separator.")
    }
  })

  it("reports empty input", () => {
    for (const input of ["", "   ", "\t\n"]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error).toBe("Enter an amount.")
    }
  })

  it("reports more than two decimal places", () => {
    for (const input of ["1.234", "0.001", "1,234.567", "-1.234"]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error).toBe("Use at most 2 decimal places.")
    }
  })

  it("reports input that contains no digits at all as an empty amount", () => {
    // "-" and "." carry no number, and "₱" on its own is an empty amount —
    // the parser treats all three as "nothing was typed".
    for (const input of ["-", ".", "₱", "+"]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error).toBe("Enter an amount.")
    }
  })

  it("reports non-numeric input", () => {
    for (const input of ["abc", "12abc", "1e5", "12,34a", "1.2.3"]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error).toBe("Enter a valid amount.")
    }
  })

  it("reports an amount that cannot be represented exactly", () => {
    const result = parsePesoToCentavosSafe("99999999999999999999")
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected a failure")
    expect(result.error).toBe("Enter a valid amount.")
  })

  it("never returns an empty error message", () => {
    for (const input of [
      "",
      "   ",
      "abc",
      "12abc",
      "1.234",
      "-",
      ".",
      "1e5",
      "₱",
      "1,23",
      "1,",
      ",123",
    ]) {
      const result = parsePesoToCentavosSafe(input)
      expect(result.ok, `expected "${input}" to fail`).toBe(false)
      if (result.ok) throw new Error("expected a failure")
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})

describe("money module — exported API shape", () => {
  it("exports exactly the documented parsing helpers", async () => {
    const parse = await import("@/lib/money/parse")
    expect(Object.keys(parse).sort()).toEqual([
      "centavosToPesoString",
      "parsePesoToCentavos",
      "parsePesoToCentavosSafe",
    ])
  })

  it("exports exactly the documented formatting helpers", async () => {
    const format = await import("@/lib/money/format")
    expect(Object.keys(format).sort()).toEqual([
      "formatDate",
      "formatMonth",
      "formatPercent",
      "formatPeso",
      "formatPesoCompact",
    ])
  })

  it("keeps the signatures of the parsing helpers stable", () => {
    expect(typeof parsePesoToCentavos).toBe("function")
    expect(typeof parsePesoToCentavosSafe).toBe("function")
    expect(typeof centavosToPesoString).toBe("function")

    expect(parsePesoToCentavos.length).toBe(1)
    expect(parsePesoToCentavosSafe.length).toBe(1)
    expect(centavosToPesoString.length).toBe(1)

    // `parsePesoToCentavos` answers with a number or with null.
    expect(parsePesoToCentavos("1")).toBeTypeOf("number")
    expect(parsePesoToCentavos("nope")).toBeNull()

    // `parsePesoToCentavosSafe` answers with a discriminated result.
    const ok = parsePesoToCentavosSafe("1")
    expect(ok).toHaveProperty("ok", true)
    const failed = parsePesoToCentavosSafe("nope")
    expect(failed).toHaveProperty("ok", false)
    expect(failed).toHaveProperty("error")
  })
})

describe("centavosToPesoString", () => {
  it("converts centavos into a plain peso string", () => {
    expect(centavosToPesoString(123456)).toBe("1234.56")
    expect(centavosToPesoString(-500)).toBe("-5.00")
    expect(centavosToPesoString(0)).toBe("0.00")
    expect(centavosToPesoString(5)).toBe("0.05")
    expect(centavosToPesoString(50)).toBe("0.50")
  })

  it("degrades to 0.00 outside the safe integer range", () => {
    // Past the safe integer range the magnitude switches to exponential
    // notation ("1e+21"), which used to leak into the peso string as the
    // malformed "1e+.21".
    expect(centavosToPesoString(1e21)).toBe("0.00")
    expect(centavosToPesoString(-1e21)).toBe("0.00")
    expect(centavosToPesoString(1e21)).not.toBe("1e+.21")

    // The largest amount that is still a safe integer is formatted exactly.
    expect(centavosToPesoString(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91")
  })

  it("degrades to 0.00 for non-finite input", () => {
    expect(centavosToPesoString(Number.NaN)).toBe("0.00")
    expect(centavosToPesoString(Number.POSITIVE_INFINITY)).toBe("0.00")
    expect(centavosToPesoString(Number.NEGATIVE_INFINITY)).toBe("0.00")
  })

  it("handles edge cases", () => {
    // Smallest possible amount.
    expect(centavosToPesoString(1)).toBe("0.01")
    // Negative zero must not produce "-0.00".
    expect(centavosToPesoString(-0)).toBe("0.00")
    // Large amounts keep every digit.
    expect(centavosToPesoString(123456789)).toBe("1234567.89")
  })

  it("round-trips with parsePesoToCentavos", () => {
    for (const amount of [0, 1, 99, 100, 123456, -2500]) {
      const text = centavosToPesoString(amount)
      expect(parsePesoToCentavos(text)).toBe(amount)
    }
  })
})

describe("formatPeso", () => {
  it("formats centavos as a peso amount", () => {
    expect(formatPeso(123456)).toBe("₱1,234.56")
    expect(formatPeso(0)).toBe("₱0.00")
    expect(formatPeso(-123456)).toBe("-₱1,234.56")
    expect(formatPeso(123456789)).toBe("₱1,234,567.89")
  })

  it("handles edge cases", () => {
    // Negative zero is formatted as a plain zero.
    expect(formatPeso(-0)).toBe("₱0.00")
    // One centavo.
    expect(formatPeso(1)).toBe("₱0.01")
    // Non finite input degrades gracefully.
    expect(formatPeso(Number.NaN)).toBe("₱0.00")
    expect(formatPeso(Number.POSITIVE_INFINITY)).toBe("₱0.00")
  })
})

describe("formatPesoCompact", () => {
  it("formats centavos in a compact form", () => {
    expect(formatPesoCompact(0)).toBe("₱0")
    expect(formatPesoCompact(150000)).toBe("₱1.5k")
    expect(formatPesoCompact(120000)).toBe("₱1.2k")
    expect(formatPesoCompact(1230000)).toBe("₱12.3k")
    expect(formatPesoCompact(123456700)).toBe("₱1.2M")
  })

  it("handles edge cases", () => {
    // Below a thousand pesos the compact form is the plain amount.
    expect(formatPesoCompact(99900)).toBe("₱999")
    expect(formatPesoCompact(999)).toBe("₱9.99")
    // Exactly one thousand pesos drops the ".0".
    expect(formatPesoCompact(100000)).toBe("₱1k")
    // Negative amounts keep the sign in front of the symbol.
    expect(formatPesoCompact(-150000)).toBe("-₱1.5k")
    // Non finite input degrades gracefully.
    expect(formatPesoCompact(Number.NaN)).toBe("₱0")
  })
})

describe("formatPercent", () => {
  it("formats a percentage with one decimal", () => {
    expect(formatPercent(12.34)).toBe("12.3%")
    expect(formatPercent(0)).toBe("0.0%")
    expect(formatPercent(100)).toBe("100.0%")
    expect(formatPercent(-5.55)).toBe("-5.5%")
  })

  it("handles edge cases", () => {
    expect(formatPercent(Number.NaN)).toBe("0.0%")
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("0.0%")
  })
})

describe("formatMonth", () => {
  it("formats every month of the year", () => {
    const expected = [
      "January 2026",
      "February 2026",
      "March 2026",
      "April 2026",
      "May 2026",
      "June 2026",
      "July 2026",
      "August 2026",
      "September 2026",
      "October 2026",
      "November 2026",
      "December 2026",
    ]

    expected.forEach((label, index) => {
      const month = `2026-${String(index + 1).padStart(2, "0")}`
      expect(formatMonth(month)).toBe(label)
    })
  })

  it("formats the December → January boundary", () => {
    expect(formatMonth("2026-12")).toBe("December 2026")
    expect(formatMonth("2027-01")).toBe("January 2027")
    expect(formatMonth("2026-12")).not.toBe(formatMonth("2027-01"))
  })

  it("returns unrecognised input unchanged", () => {
    expect(formatMonth("")).toBe("")
    expect(formatMonth("not-a-month")).toBe("not-a-month")
    expect(formatMonth("2026-13")).toBe("2026-13")
    expect(formatMonth("2026-00")).toBe("2026-00")
    expect(formatMonth("2026-1")).toBe("2026-1")
  })
})

describe("formatDate — valid calendar dates", () => {
  it("formats a YYYY-MM-DD date", () => {
    expect(formatDate("2026-10-21")).toBe("Oct 21, 2026")
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026")
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026")
  })

  it("validates the day against the length of the month", () => {
    // 31-day months.
    expect(formatDate("2026-01-31")).toBe("Jan 31, 2026")
    expect(formatDate("2026-03-31")).toBe("Mar 31, 2026")
    expect(formatDate("2026-12-31")).toBe("Dec 31, 2026")
    // 30-day months.
    expect(formatDate("2026-04-30")).toBe("Apr 30, 2026")
    expect(formatDate("2026-06-30")).toBe("Jun 30, 2026")
    expect(formatDate("2026-09-30")).toBe("Sep 30, 2026")
    expect(formatDate("2026-11-30")).toBe("Nov 30, 2026")
    // February in a common year.
    expect(formatDate("2026-02-28")).toBe("Feb 28, 2026")
  })

  it("accepts the last day of a leap-year February", () => {
    expect(formatDate("2024-02-29")).toBe("Feb 29, 2024")
  })

  it("applies the century rule to leap years", () => {
    // 2000 is divisible by 400 → a leap year.
    expect(formatDate("2000-02-29")).toBe("Feb 29, 2000")
    // 2100 is divisible by 100 but not by 400 → not a leap year.
    expect(formatDate("2100-02-29")).toBe("2100-02-29")
    // 1900 is divisible by 100 but not by 400 → not a leap year.
    expect(formatDate("1900-02-29")).toBe("1900-02-29")
  })

  it("trims surrounding whitespace before validating", () => {
    expect(formatDate(" 2026-10-21 ")).toBe("Oct 21, 2026")
  })
})

describe("formatDate — impossible dates are returned unchanged", () => {
  it("rejects a day that does not exist in the month", () => {
    // February of a common year.
    expect(formatDate("2026-02-29")).toBe("2026-02-29")
    expect(formatDate("2026-02-31")).toBe("2026-02-31")
    // 30-day months.
    expect(formatDate("2026-04-31")).toBe("2026-04-31")
    expect(formatDate("2026-06-31")).toBe("2026-06-31")
    expect(formatDate("2026-09-31")).toBe("2026-09-31")
    expect(formatDate("2026-11-31")).toBe("2026-11-31")
    // 31-day months.
    expect(formatDate("2026-01-32")).toBe("2026-01-32")
  })

  it("rejects an out-of-range month", () => {
    expect(formatDate("2026-13-01")).toBe("2026-13-01")
    expect(formatDate("2026-00-10")).toBe("2026-00-10")
  })

  it("rejects an out-of-range day", () => {
    expect(formatDate("2026-10-00")).toBe("2026-10-00")
    expect(formatDate("2026-10-32")).toBe("2026-10-32")
  })

  it("requires the whole string to be a date", () => {
    // The pattern is anchored on both ends.
    expect(formatDate("2026-10-21garbage")).toBe("2026-10-21garbage")
    expect(formatDate("garbage2026-10-21")).toBe("garbage2026-10-21")
    // The month and the day must have two digits.
    expect(formatDate("2026-1-1")).toBe("2026-1-1")
    expect(formatDate("")).toBe("")
    expect(formatDate("not-a-date")).toBe("not-a-date")
  })
})
