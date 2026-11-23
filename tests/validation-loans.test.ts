import { describe, expect, it } from "vitest"

import { lookupMessage } from "@/lib/validation/errors"
import {
  LOAN_ERROR_CODES,
  LOAN_ERROR_MESSAGES,
  LOAN_NOTE_MAX_LENGTH,
  LOAN_PAYMENT_ERROR_CODES,
  LOAN_PAYMENT_ERROR_MESSAGES,
  LOAN_PAYMENT_NOTE_MAX_LENGTH,
  LOAN_PERSON_MAX_LENGTH,
  loanFailure,
  loanPaymentFailure,
  readLoanFormValues,
  readLoanPaymentFormValues,
  validateLoan,
  validateLoanPayment,
  type LoanFormValues,
  type LoanPaymentFormValues,
} from "@/lib/validation/loans"

function loanValues(overrides: Partial<LoanFormValues> = {}): LoanFormValues {
  return {
    person: "Maria Santos",
    amount: "5,000.00",
    direction: "i_owe",
    date: "2026-06-01",
    dueDate: "2026-12-31",
    note: "Emergency money",
    ...overrides,
  }
}

function paymentValues(overrides: Partial<LoanPaymentFormValues> = {}): LoanPaymentFormValues {
  return {
    amount: "2,500.00",
    accountId: "acct-cash",
    date: "2026-07-01",
    note: "First half repayment",
    ...overrides,
  }
}

describe("validateLoan", () => {
  it("accepts a fully specified loan", () => {
    const result = validateLoan(loanValues())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      person: "Maria Santos",
      amount: 500000,
      direction: "i_owe",
      date: "2026-06-01",
      dueDate: "2026-12-31",
      note: "Emergency money",
    })
  })

  it("accepts an owed_to_me loan without dueDate or note", () => {
    const result = validateLoan(
      loanValues({
        direction: "owed_to_me",
        dueDate: "   ",
        note: "   ",
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.direction).toBe("owed_to_me")
    expect(result.value.dueDate).toBeNull()
    expect(result.value.note).toBeNull()
  })

  it("parses amounts with separators, currency symbol, whitespace, and minimum positive amount", () => {
    const withCommas = validateLoan(loanValues({ amount: "1,250.50" }))
    expect(withCommas.ok).toBe(true)
    if (withCommas.ok) expect(withCommas.value.amount).toBe(125050)

    const plain = validateLoan(loanValues({ amount: "1000" }))
    expect(plain.ok).toBe(true)
    if (plain.ok) expect(plain.value.amount).toBe(100000)

    const withPeso = validateLoan(loanValues({ amount: " ₱ 1,250.50 " }))
    expect(withPeso.ok).toBe(true)
    if (withPeso.ok) expect(withPeso.value.amount).toBe(125050)

    const oneCentavo = validateLoan(loanValues({ amount: "0.01" }))
    expect(oneCentavo.ok).toBe(true)
    if (oneCentavo.ok) expect(oneCentavo.value.amount).toBe(1)
  })

  it("trims person, date, dueDate, and note", () => {
    const result = validateLoan(
      loanValues({
        person: "  Maria Santos  ",
        date: " 2026-06-01 ",
        dueDate: " 2026-12-31 ",
        note: "  Emergency money  ",
      }),
    )
    expect(result).toEqual({
      ok: true,
      value: {
        person: "Maria Santos",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
        dueDate: "2026-12-31",
        note: "Emergency money",
      },
    })
  })

  it("rejects empty or whitespace person name", () => {
    expect(validateLoan(loanValues({ person: "" }))).toEqual({
      ok: false,
      code: "person-required",
    })
    expect(validateLoan(loanValues({ person: "   " }))).toEqual({
      ok: false,
      code: "person-required",
    })
  })

  it("enforces person name length ceiling after trimming", () => {
    const valid = validateLoan(loanValues({ person: `  ${"a".repeat(LOAN_PERSON_MAX_LENGTH)}  ` }))
    expect(valid.ok).toBe(true)

    const invalid = validateLoan(loanValues({ person: "a".repeat(LOAN_PERSON_MAX_LENGTH + 1) }))
    expect(invalid).toEqual({ ok: false, code: "person-too-long" })
  })

  it("rejects empty, malformed, zero, and negative amounts", () => {
    expect(validateLoan(loanValues({ amount: "" }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateLoan(loanValues({ amount: "   " }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateLoan(loanValues({ amount: "abc" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoan(loanValues({ amount: "1,23" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoan(loanValues({ amount: "100.123" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoan(loanValues({ amount: "0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoan(loanValues({ amount: "0.00" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoan(loanValues({ amount: "₱0.00" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoan(loanValues({ amount: "-0.01" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoan(loanValues({ amount: "-500" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoan(loanValues({ amount: "-1,000.50" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
  })

  it("rejects unknown direction", () => {
    expect(validateLoan(loanValues({ direction: "" }))).toEqual({
      ok: false,
      code: "direction-invalid",
    })
    expect(validateLoan(loanValues({ direction: "invalid" }))).toEqual({
      ok: false,
      code: "direction-invalid",
    })
    expect(validateLoan(loanValues({ direction: "constructor" }))).toEqual({
      ok: false,
      code: "direction-invalid",
    })
  })

  it("validates date format including leap years", () => {
    expect(validateLoan(loanValues({ date: "" }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateLoan(loanValues({ date: "   " }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateLoan(loanValues({ date: "2026-02-31" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateLoan(loanValues({ date: "2025-02-29" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateLoan(loanValues({ date: "2024-02-29" })).ok).toBe(true)
  })

  it("validates due date when provided", () => {
    expect(validateLoan(loanValues({ dueDate: "2026-13-01" }))).toEqual({
      ok: false,
      code: "due-date-invalid",
    })
    expect(validateLoan(loanValues({ dueDate: "2025-02-29" }))).toEqual({
      ok: false,
      code: "due-date-invalid",
    })
    expect(validateLoan(loanValues({ dueDate: "" })).ok).toBe(true)
  })

  it("enforces loan note length ceiling after trimming", () => {
    const valid = validateLoan(loanValues({ note: `  ${"n".repeat(LOAN_NOTE_MAX_LENGTH)}  ` }))
    expect(valid.ok).toBe(true)

    const invalid = validateLoan(loanValues({ note: "n".repeat(LOAN_NOTE_MAX_LENGTH + 1) }))
    expect(invalid).toEqual({ ok: false, code: "note-too-long" })
  })
})

describe("validateLoanPayment", () => {
  it("accepts a valid repayment", () => {
    const result = validateLoanPayment(paymentValues())

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value).toEqual({
      amount: 250000,
      accountId: "acct-cash",
      date: "2026-07-01",
      note: "First half repayment",
    })
  })

  it("accepts repayment without note and trims fields", () => {
    const result = validateLoanPayment(
      paymentValues({
        amount: " ₱ 2,500.50 ",
        accountId: " acct-cash ",
        date: " 2026-07-01 ",
        note: "   ",
      }),
    )
    expect(result).toEqual({
      ok: true,
      value: {
        amount: 250050,
        accountId: "acct-cash",
        date: "2026-07-01",
        note: null,
      },
    })

    const oneCentavo = validateLoanPayment(paymentValues({ amount: "0.01" }))
    expect(oneCentavo.ok).toBe(true)
    if (oneCentavo.ok) expect(oneCentavo.value.amount).toBe(1)
  })

  it("rejects empty, malformed, zero, and negative amounts", () => {
    expect(validateLoanPayment(paymentValues({ amount: "" }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateLoanPayment(paymentValues({ amount: "   " }))).toEqual({
      ok: false,
      code: "amount-required",
    })
    expect(validateLoanPayment(paymentValues({ amount: "invalid" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoanPayment(paymentValues({ amount: "1,23" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoanPayment(paymentValues({ amount: "10.999" }))).toEqual({
      ok: false,
      code: "amount-invalid",
    })
    expect(validateLoanPayment(paymentValues({ amount: "0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoanPayment(paymentValues({ amount: "0.00" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoanPayment(paymentValues({ amount: "₱0" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoanPayment(paymentValues({ amount: "-0.01" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoanPayment(paymentValues({ amount: "-100" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
    expect(validateLoanPayment(paymentValues({ amount: "-500.25" }))).toEqual({
      ok: false,
      code: "amount-not-positive",
    })
  })

  it("validates date including leap years", () => {
    expect(validateLoanPayment(paymentValues({ date: "" }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateLoanPayment(paymentValues({ date: "   " }))).toEqual({
      ok: false,
      code: "date-required",
    })
    expect(validateLoanPayment(paymentValues({ date: "not-a-date" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateLoanPayment(paymentValues({ date: "2026-02-30" }))).toEqual({
      ok: false,
      code: "date-invalid",
    })
    expect(validateLoanPayment(paymentValues({ date: "2024-02-29" })).ok).toBe(true)
  })

  it("requires non-whitespace accountId", () => {
    expect(validateLoanPayment(paymentValues({ accountId: "" }))).toEqual({
      ok: false,
      code: "account-required",
    })
    expect(validateLoanPayment(paymentValues({ accountId: "   " }))).toEqual({
      ok: false,
      code: "account-required",
    })
  })

  it("enforces payment note length ceiling after trimming", () => {
    const valid = validateLoanPayment(
      paymentValues({ note: `  ${"x".repeat(LOAN_PAYMENT_NOTE_MAX_LENGTH)}  ` }),
    )
    expect(valid.ok).toBe(true)

    const invalid = validateLoanPayment(
      paymentValues({ note: "x".repeat(LOAN_PAYMENT_NOTE_MAX_LENGTH + 1) }),
    )
    expect(invalid).toEqual({ ok: false, code: "note-too-long" })
  })
})

describe("form reading & error lookups", () => {
  it("reads loan form values from FormData", () => {
    const form = new FormData()
    form.append("person", "John Doe")
    form.append("amount", "10,000.00")
    form.append("direction", "owed_to_me")
    form.append("date", "2026-05-10")
    form.append("dueDate", "2026-06-10")
    form.append("note", "Lent for tuition")

    expect(readLoanFormValues(form)).toEqual({
      person: "John Doe",
      amount: "10,000.00",
      direction: "owed_to_me",
      date: "2026-05-10",
      dueDate: "2026-06-10",
      note: "Lent for tuition",
    })
  })

  it("defaults missing or non-string loan FormData fields to empty strings", () => {
    const form = new FormData()
    form.append("person", new File(["x"], "test.txt"))

    expect(readLoanFormValues(form)).toEqual({
      person: "",
      amount: "",
      direction: "",
      date: "",
      dueDate: "",
      note: "",
    })
  })

  it("reads loan payment form values from FormData", () => {
    const form = new FormData()
    form.append("amount", "5,000.00")
    form.append("accountId", "acct-bank")
    form.append("date", "2026-05-20")
    form.append("note", "Partial payment")

    expect(readLoanPaymentFormValues(form)).toEqual({
      amount: "5,000.00",
      accountId: "acct-bank",
      date: "2026-05-20",
      note: "Partial payment",
    })
  })

  it("defaults missing or non-string payment FormData fields to empty strings", () => {
    const form = new FormData()
    form.append("amount", new File(["x"], "test.txt"))

    expect(readLoanPaymentFormValues(form)).toEqual({
      amount: "",
      accountId: "",
      date: "",
      note: "",
    })
  })

  it("provides human messages for every loan and payment error code", () => {
    for (const code of LOAN_ERROR_CODES) {
      const failure = loanFailure(code)
      expect(failure.code).toBe(code)
      expect(failure.error.length).toBeGreaterThan(0)
      expect(lookupMessage(LOAN_ERROR_MESSAGES, code)).toBe(failure.error)
    }

    for (const code of LOAN_PAYMENT_ERROR_CODES) {
      const failure = loanPaymentFailure(code)
      expect(failure.code).toBe(code)
      expect(failure.error.length).toBeGreaterThan(0)
      expect(lookupMessage(LOAN_PAYMENT_ERROR_MESSAGES, code)).toBe(failure.error)
    }
  })

  it("blocks prototype-chain lookups for error messages", () => {
    for (const key of ["constructor", "__proto__", "toString", "valueOf", "unknown", undefined]) {
      expect(lookupMessage(LOAN_ERROR_MESSAGES, key)).toBeNull()
      expect(lookupMessage(LOAN_PAYMENT_ERROR_MESSAGES, key)).toBeNull()
    }
  })
})

describe("loan accountId validation and form reading", () => {
  it("passes a trimmed accountId through validateLoan", () => {
    const result = validateLoan(loanValues({ accountId: "  acct-bank  " }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.accountId).toBe("acct-bank")
  })

  it("leaves accountId unset when it is missing, empty or whitespace", () => {
    for (const accountId of [undefined, "", "   "]) {
      const result = validateLoan(loanValues({ accountId }))

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.accountId ?? null).toBeNull()
    }
  })

  it("reads accountId from FormData only when it is non-empty", () => {
    const withAccount = new FormData()
    withAccount.append("person", "John Doe")
    withAccount.append("accountId", "acct-bank")
    expect(readLoanFormValues(withAccount).accountId).toBe("acct-bank")

    const withoutAccount = new FormData()
    withoutAccount.append("person", "John Doe")
    withoutAccount.append("accountId", "")
    expect(readLoanFormValues(withoutAccount).accountId ?? null).toBeNull()
  })

  it("defines account-required and account-invalid codes with the 'Choose an account.' message", () => {
    expect(LOAN_ERROR_CODES).toContain("account-required")
    expect(LOAN_ERROR_CODES).toContain("account-invalid")
    expect(LOAN_ERROR_MESSAGES["account-required"]).toBe("Choose an account.")
    expect(LOAN_ERROR_MESSAGES["account-invalid"]).toBe("Choose an account.")
    expect(loanFailure("account-invalid")).toEqual({
      code: "account-invalid",
      error: "Choose an account.",
    })
  })
})
