import { describe, expect, it } from "vitest"

import { lookupMessage } from "@/lib/validation/errors"
import {
  CONTRIBUTION_ERROR_CODES,
  CONTRIBUTION_ERROR_MESSAGES,
  CONTRIBUTION_NOTE_MAX_LENGTH,
  GOAL_ERROR_CODES,
  GOAL_ERROR_MESSAGES,
  GOAL_NAME_MAX_LENGTH,
  contributionFailure,
  goalFailure,
  readContributionFormValues,
  readGoalFormValues,
  validateContribution,
  validateGoal,
  type ContributionFormValues,
  type GoalFormValues,
} from "@/lib/validation/goals"

function goalValues(overrides: Partial<GoalFormValues> = {}): GoalFormValues {
  return {
    name: "Emergency Fund",
    targetAmount: "100,000.00",
    targetDate: "2026-12-31",
    color: "#22c55e",
    ...overrides,
  }
}

function contributionValues(
  overrides: Partial<ContributionFormValues> = {},
): ContributionFormValues {
  return {
    amount: "5,000.00",
    date: "2026-06-15",
    accountId: "acct-bank",
    note: "Initial deposit",
    ...overrides,
  }
}

describe("validateGoal", () => {
  it("accepts a fully specified goal", () => {
    const result = validateGoal(goalValues())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      name: "Emergency Fund",
      targetAmount: 10000000,
      targetDate: "2026-12-31",
      color: "#22c55e",
    })
  })

  it("accepts a goal without a target date", () => {
    const result = validateGoal(goalValues({ targetDate: "   " }))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.targetDate).toBeNull()
  })

  it("normalizes uppercase hex colors to lowercase", () => {
    const result = validateGoal(goalValues({ color: "#22C55E" }))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.color).toBe("#22c55e")
  })

  it("parses amounts with and without thousands separators", () => {
    const withCommas = validateGoal(goalValues({ targetAmount: "1,000,000.00" }))
    expect(withCommas.ok).toBe(true)
    if (withCommas.ok) expect(withCommas.value.targetAmount).toBe(100000000)

    const plain = validateGoal(goalValues({ targetAmount: "50000" }))
    expect(plain.ok).toBe(true)
    if (plain.ok) expect(plain.value.targetAmount).toBe(5000000)
  })

  it("rejects empty or whitespace name", () => {
    expect(validateGoal(goalValues({ name: "" }))).toEqual({
      ok: false,
      code: "name-required",
    })
    expect(validateGoal(goalValues({ name: "   " }))).toEqual({
      ok: false,
      code: "name-required",
    })
  })

  it("enforces goal name max length", () => {
    const maxName = "g".repeat(GOAL_NAME_MAX_LENGTH)
    const valid = validateGoal(goalValues({ name: maxName }))
    expect(valid.ok).toBe(true)

    const tooLong = "g".repeat(GOAL_NAME_MAX_LENGTH + 1)
    expect(validateGoal(goalValues({ name: tooLong }))).toEqual({
      ok: false,
      code: "name-too-long",
    })
  })

  it("rejects empty target amount", () => {
    expect(validateGoal(goalValues({ targetAmount: "" }))).toEqual({
      ok: false,
      code: "target-required",
    })
    expect(validateGoal(goalValues({ targetAmount: "   " }))).toEqual({
      ok: false,
      code: "target-required",
    })
  })

  it("rejects malformed target amount", () => {
    expect(validateGoal(goalValues({ targetAmount: "abc" }))).toEqual({
      ok: false,
      code: "target-invalid",
    })
    expect(validateGoal(goalValues({ targetAmount: "1,23" }))).toEqual({
      ok: false,
      code: "target-invalid",
    })
  })

  it("rejects zero and negative target amount", () => {
    expect(validateGoal(goalValues({ targetAmount: "0" }))).toEqual({
      ok: false,
      code: "target-not-positive",
    })
    expect(validateGoal(goalValues({ targetAmount: "-500" }))).toEqual({
      ok: false,
      code: "target-not-positive",
    })
  })

  it("rejects invalid target dates", () => {
    expect(validateGoal(goalValues({ targetDate: "2026-02-30" }))).toEqual({
      ok: false,
      code: "target-date-invalid",
    })
    expect(validateGoal(goalValues({ targetDate: "2026-13-01" }))).toEqual({
      ok: false,
      code: "target-date-invalid",
    })
    expect(validateGoal(goalValues({ targetDate: "invalid" }))).toEqual({
      ok: false,
      code: "target-date-invalid",
    })
  })

  it("rejects invalid colors", () => {
    expect(validateGoal(goalValues({ color: "green" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
    expect(validateGoal(goalValues({ color: "#fff" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
    expect(validateGoal(goalValues({ color: "22c55e" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
    expect(validateGoal(goalValues({ color: "#22c55ee" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
    expect(validateGoal(goalValues({ color: "#22c55g" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
    expect(validateGoal(goalValues({ color: "" }))).toEqual({
      ok: false,
      code: "color-invalid",
    })
  })
})

describe("validateContribution", () => {
  it("accepts a fully specified contribution", () => {
    const result = validateContribution(contributionValues())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      amount: 500000,
      date: "2026-06-15",
      accountId: "acct-bank",
      note: "Initial deposit",
    })
  })

  it("stores an empty or whitespace note as null", () => {
    const result = validateContribution(contributionValues({ note: "   " }))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.note).toBeNull()
  })

  it("rejects missing amount", () => {
    expect(validateContribution(contributionValues({ amount: "" }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateContribution(contributionValues({ amount: "   " }))).toEqual({
      ok: false,
      code: "amount-required",
    })
  })

  it("rejects malformed amount", () => {
    expect(validateContribution(contributionValues({ amount: "xyz" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateContribution(contributionValues({ amount: "10,0" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
  })

  it("rejects zero and negative contribution amount", () => {
    expect(validateContribution(contributionValues({ amount: "0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateContribution(contributionValues({ amount: "-100" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
  })

  it("rejects missing date", () => {
    expect(validateContribution(contributionValues({ date: "" }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateContribution(contributionValues({ date: "   " }))).toEqual({
      ok: false,
      code: "date-required",
    })
  })

  it("rejects invalid date", () => {
    expect(validateContribution(contributionValues({ date: "2026-02-30" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateContribution(contributionValues({ date: "2026-14-01" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateContribution(contributionValues({ date: "abc" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
  })

  it("rejects missing account", () => {
    expect(validateContribution(contributionValues({ accountId: "" }))).toEqual({
      ok: false,
      code: "account-required",
    })
    expect(validateContribution(contributionValues({ accountId: "   " }))).toEqual({
      ok: false,
      code: "account-required",
    })
  })

  it("enforces note max length boundary", () => {
    const maxNote = "n".repeat(CONTRIBUTION_NOTE_MAX_LENGTH)
    const valid = validateContribution(contributionValues({ note: maxNote }))
    expect(valid.ok).toBe(true)
    if (valid.ok) expect(valid.value.note).toBe(maxNote)

    const tooLong = "n".repeat(CONTRIBUTION_NOTE_MAX_LENGTH + 1)
    expect(validateContribution(contributionValues({ note: tooLong }))).toEqual({
      ok: false,
      code: "note-too-long",
    })
  })
})

describe("readGoalFormValues & readContributionFormValues", () => {
  it("reads goal form values from FormData", () => {
    const data = new FormData()
    data.append("name", "New Car")
    data.append("targetAmount", "750,000.00")
    data.append("targetDate", "2027-01-01")
    data.append("color", "#0ea5e9")

    expect(readGoalFormValues(data)).toEqual({
      name: "New Car",
      targetAmount: "750,000.00",
      targetDate: "2027-01-01",
      color: "#0ea5e9",
    })
  })

  it("returns empty strings for omitted goal fields", () => {
    expect(readGoalFormValues(new FormData())).toEqual({
      name: "",
      targetAmount: "",
      targetDate: "",
      color: "",
    })
  })

  it("reads contribution form values from FormData", () => {
    const data = new FormData()
    data.append("amount", "10,000.00")
    data.append("date", "2026-07-01")
    data.append("accountId", "acct-cash")
    data.append("note", "Bonus")

    expect(readContributionFormValues(data)).toEqual({
      amount: "10,000.00",
      date: "2026-07-01",
      accountId: "acct-cash",
      note: "Bonus",
    })
  })

  it("returns empty strings for omitted contribution fields", () => {
    expect(readContributionFormValues(new FormData())).toEqual({
      amount: "",
      date: "",
      accountId: "",
      note: "",
    })
  })
})

describe("goalFailure & contributionFailure", () => {
  it("constructs error result matching the maps", () => {
    expect(goalFailure("name-required")).toEqual({
      code: "name-required",
      error: GOAL_ERROR_MESSAGES["name-required"],
    })
    expect(contributionFailure("account-invalid")).toEqual({
      code: "account-invalid",
      error: CONTRIBUTION_ERROR_MESSAGES["account-invalid"],
    })
  })
})

describe("goal and contribution error messages", () => {
  it("has non-empty message for all goal error codes", () => {
    for (const code of GOAL_ERROR_CODES) {
      expect(GOAL_ERROR_MESSAGES[code]).toBeDefined()
      expect(GOAL_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it("has non-empty message for all contribution error codes", () => {
    for (const code of CONTRIBUTION_ERROR_CODES) {
      expect(CONTRIBUTION_ERROR_MESSAGES[code]).toBeDefined()
      expect(CONTRIBUTION_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })

  it("protects against prototype chain lookups", () => {
    expect(lookupMessage(GOAL_ERROR_MESSAGES, "constructor")).toBeNull()
    expect(lookupMessage(GOAL_ERROR_MESSAGES, "__proto__")).toBeNull()
    expect(lookupMessage(CONTRIBUTION_ERROR_MESSAGES, "constructor")).toBeNull()
    expect(lookupMessage(CONTRIBUTION_ERROR_MESSAGES, "__proto__")).toBeNull()
  })
})
