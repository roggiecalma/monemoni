import { beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import {
  archiveLoan,
  createLoan,
  deleteLoan,
  deleteLoanPayment,
  recordLoanPayment,
  restoreLoan,
  updateLoan,
} from "@/lib/actions/loans"
import { deleteTransaction } from "@/lib/actions/transactions"
import { hashPassword } from "@/lib/auth/password"
import { createSession } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import {
  getAccountBalances,
  getLoanById,
  getLoanPayments,
  getLoans,
  getLoanSummary,
  getSummary,
} from "@/lib/db/queries"
import { accounts, loanPayments, loans, transactions } from "@/lib/db/schema"

import {
  insertAccount,
  insertLoan,
  insertTransaction,
  insertUser,
  resetDatabase,
} from "./setup/db"

const { cookieStore } = vi.hoisted(() => {
  interface StoredCookie {
    name: string
    value: string
    options?: Record<string, unknown>
  }

  const cookies = new Map<string, StoredCookie>()

  return {
    cookieStore: {
      get: (name: string): StoredCookie | undefined => cookies.get(name),
      getAll: (): StoredCookie[] => [...cookies.values()],
      has: (name: string): boolean => cookies.has(name),
      set: (name: string, value: string, options?: Record<string, unknown>): void => {
        cookies.set(name, { name, value, options })
      },
      delete: (name: string): void => {
        cookies.delete(name)
      },
      clear: (): void => {
        cookies.clear()
      },
    },
  }
})

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}))

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

const CASH = "acct-cash"
const BANK = "acct-bank"

function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}

function loanForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    person: "Maria Santos",
    amount: "10,000.00",
    direction: "i_owe",
    date: "2026-06-01",
    dueDate: "2026-12-31",
    note: "Emergency money",
    ...overrides,
  })
}

function paymentForm(overrides: Record<string, string> = {}): FormData {
  return formData({
    amount: "5,000.00",
    accountId: CASH,
    date: "2026-07-01",
    note: "Partial repayment",
    ...overrides,
  })
}

describe("loan Server Actions", () => {
  beforeEach(async () => {
    cookieStore.clear()
    await resetDatabase()

    await insertUser("user", await hashPassword("super-secret-passcode"))
    await createSession("user")

    await insertAccount({ id: CASH, name: "Cash", type: "cash", openingBalance: 500000 })
    await insertAccount({ id: BANK, name: "Bank", type: "bank", openingBalance: 1000000 })
  })

  it("requires an active session for every loan action", async () => {
    await insertLoan({
      id: "loan-1",
      person: "Maria Santos",
      amount: 1000000,
      direction: "i_owe",
      date: "2026-06-01",
    })
    cookieStore.clear()

    await expect(createLoan(loanForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(updateLoan("loan-1", loanForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(archiveLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(restoreLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(deleteLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(recordLoanPayment("loan-1", paymentForm())).rejects.toThrow("NEXT_REDIRECT:/login")
    await expect(deleteLoanPayment("loan-1", "lp-1")).rejects.toThrow("NEXT_REDIRECT:/login")

    expect(await db.select().from(loans)).toHaveLength(1)
    expect(await db.select().from(loanPayments)).toHaveLength(0)
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  describe("createLoan", () => {
    it("creates an i_owe loan and redirects to /loans", async () => {
      await expect(createLoan(loanForm())).rejects.toThrow("NEXT_REDIRECT:/loans")

      const rows = await db.select().from(loans)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.person).toBe("Maria Santos")
      expect(rows[0]?.amount).toBe(1000000)
      expect(rows[0]?.direction).toBe("i_owe")
      expect(rows[0]?.archived).toBe(false)
    })

    it("creates an owed_to_me loan without due date or note", async () => {
      await expect(
        createLoan(loanForm({ direction: "owed_to_me", dueDate: "", note: "   " })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans")

      const rows = await db.select().from(loans)
      expect(rows[0]?.direction).toBe("owed_to_me")
      expect(rows[0]?.dueDate).toBeNull()
      expect(rows[0]?.note).toBeNull()
    })

    it("rejects zero, negative, and invalid amounts without writing to database", async () => {
      expect(await createLoan(loanForm({ person: "" }))).toEqual({
        code: "person-required",
        error: "Enter a person's name.",
      })
      expect(await createLoan(loanForm({ amount: "0" }))).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })
      expect(await createLoan(loanForm({ amount: "-500.00" }))).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })
      expect(await createLoan(loanForm({ amount: "1,23" }))).toEqual({
        code: "amount-invalid",
        error: "Enter a valid amount, for example 1,250.50.",
      })

      expect(await db.select().from(loans)).toHaveLength(0)
    })
  })

  describe("updateLoan", () => {
    it("updates an existing loan and redirects to /loans/[id]", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Maria Santos",
        amount: 1000000,
        direction: "i_owe",
        date: "2026-06-01",
        dueDate: "2026-12-31",
        note: "Initial note",
      })

      await expect(
        updateLoan(
          "loan-1",
          loanForm({
            person: "Maria Santos-Reyes",
            amount: "12,000.00",
            direction: "owed_to_me",
            dueDate: "",
            note: "",
          }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1")

      const updated = (await db.select().from(loans).where(eq(loans.id, "loan-1")))[0]
      expect(updated?.person).toBe("Maria Santos-Reyes")
      expect(updated?.amount).toBe(1200000)
      expect(updated?.direction).toBe("owed_to_me")
      expect(updated?.dueDate).toBeNull()
      expect(updated?.note).toBeNull()
    })

    it("returns validation failure and preserves existing loan values", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Maria Santos",
        amount: 1000000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      const result = await updateLoan("loan-1", loanForm({ amount: "0.00" }))
      expect(result).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })

      const unchanged = (await db.select().from(loans).where(eq(loans.id, "loan-1")))[0]
      expect(unchanged?.amount).toBe(1000000)
    })

    it("redirects to /loans when updating a non-existent loan", async () => {
      await expect(updateLoan("non-existent", loanForm())).rejects.toThrow("NEXT_REDIRECT:/loans")
    })

    it("marks loan settled when updated amount is below existing payments", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Maria Santos",
        amount: 1000000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "6,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      await expect(
        updateLoan("loan-1", loanForm({ amount: "5,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1")

      const loan = await getLoanById("loan-1")
      expect(loan?.totalPaid).toBe(600000)
      expect(loan?.remainingBalance).toBe(0)
      expect(loan?.status).toBe("settled")
    })
  })

  describe("archiveLoan and restoreLoan", () => {
    it("redirects to /loans for a non-existent loan", async () => {
      await expect(archiveLoan("missing")).rejects.toThrow("NEXT_REDIRECT:/loans")
      await expect(restoreLoan("missing")).rejects.toThrow("NEXT_REDIRECT:/loans")
    })

    it("archives and restores a loan while preserving payments and excluding archived loans from summary", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Pedro",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "1,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      await expect(archiveLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/loans")
      let loan = (await db.select().from(loans).where(eq(loans.id, "loan-1")))[0]
      expect(loan?.archived).toBe(true)
      expect(await getLoans(false)).toHaveLength(0)
      expect(await getLoanSummary()).toEqual({
        totalIOwe: 0,
        totalOwedToMe: 0,
        netPosition: 0,
      })
      expect(await getLoanPayments("loan-1")).toHaveLength(1)

      await expect(restoreLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/loans")
      loan = (await db.select().from(loans).where(eq(loans.id, "loan-1")))[0]
      expect(loan?.archived).toBe(false)
      expect(await getLoans(false)).toHaveLength(1)
      expect(await getLoanSummary()).toEqual({
        totalIOwe: 400000,
        totalOwedToMe: 0,
        netPosition: -400000,
      })
    })
  })

  describe("deleteLoan", () => {
    it("redirects to /loans when deleting a non-existent loan", async () => {
      await expect(deleteLoan("missing")).rejects.toThrow("NEXT_REDIRECT:/loans")
    })

    it("deletes a loan with no payments cleanly", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Pedro",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(deleteLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/loans")
      expect(await db.select().from(loans)).toHaveLength(0)
    })

    it("deletes a loan and all associated repayment transactions without affecting unrelated transactions", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Pedro",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await insertLoan({
        id: "loan-2",
        person: "Ana",
        amount: 300000,
        direction: "owed_to_me",
        date: "2026-06-01",
      })
      await insertTransaction({
        id: "unrelated-txn",
        date: "2026-06-15",
        type: "expense",
        amount: 15000,
        accountId: CASH,
        note: "Groceries",
      })

      // Record multiple payments for loan-1 and one payment for loan-2
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "2,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "3,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")
      await expect(
        recordLoanPayment("loan-2", paymentForm({ amount: "1,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-2?paid=1")

      expect(await db.select().from(loans)).toHaveLength(2)
      expect(await db.select().from(loanPayments)).toHaveLength(3)
      expect(await db.select().from(transactions)).toHaveLength(4)

      // Delete loan-1
      await expect(deleteLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/loans")

      expect(await db.select().from(loans)).toHaveLength(1)
      expect(await db.select().from(loanPayments)).toHaveLength(1)
      const remainingTxns = await db.select().from(transactions)
      expect(remainingTxns).toHaveLength(2)
      expect(remainingTxns.some((t) => t.id === "unrelated-txn")).toBe(true)
    })

    it("deletes a loan even if one payment's linked transaction was already deleted", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Pedro",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "2,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "1,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      const payments = await db.select().from(loanPayments)
      const firstTxnId = payments[0]!.transactionId!

      // Delete the first linked transaction directly via transaction Server Action
      await expect(deleteTransaction(firstTxnId, new FormData())).rejects.toThrow(
        "NEXT_REDIRECT:/transactions",
      )

      const refreshedFirst = (
        await db.select().from(loanPayments).where(eq(loanPayments.id, payments[0]!.id))
      )[0]!
      expect(refreshedFirst.transactionId).toBeNull()

      await expect(deleteLoan("loan-1")).rejects.toThrow("NEXT_REDIRECT:/loans")
      expect(await db.select().from(loans)).toHaveLength(0)
      expect(await db.select().from(loanPayments)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
    })
  })

  describe("recordLoanPayment and deleteLoanPayment", () => {
    it("redirects to /loans when recording payment for a non-existent loan", async () => {
      await expect(recordLoanPayment("no-such-loan", paymentForm())).rejects.toThrow(
        "NEXT_REDIRECT:/loans",
      )
      expect(await db.select().from(loanPayments)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
    })

    it("rejects zero, negative, and invalid payment amounts without creating a payment or transaction", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      expect(await recordLoanPayment("loan-1", paymentForm({ amount: "0" }))).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })
      expect(await recordLoanPayment("loan-1", paymentForm({ amount: "-100.00" }))).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })
      expect(await recordLoanPayment("loan-1", paymentForm({ amount: "" }))).toEqual({
        code: "amount-required",
        error: "Enter an amount.",
      })
      expect(await recordLoanPayment("loan-1", paymentForm({ date: "2026-02-31" }))).toEqual({
        code: "date-invalid",
        error: "Enter a real calendar date.",
      })

      expect(await db.select().from(loanPayments)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
    })

    it("creates an expense transaction for an i_owe repayment and updates balances and summary", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(
        recordLoanPayment(
          "loan-1",
          paymentForm({
            amount: "3,000.00",
            accountId: CASH,
            date: "2026-06-15",
          }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      const payments = await db.select().from(loanPayments).where(eq(loanPayments.loanId, "loan-1"))
      expect(payments).toHaveLength(1)
      expect(payments[0]?.amount).toBe(300000)
      expect(payments[0]?.accountId).toBe(CASH)

      const txns = await db.select().from(transactions).where(eq(transactions.id, payments[0]!.transactionId!))
      expect(txns).toHaveLength(1)
      expect(txns[0]?.type).toBe("expense")
      expect(txns[0]?.amount).toBe(300000)
      expect(txns[0]?.note).toBe("Repayment to Kuya Mark")

      const balances = await getAccountBalances()
      expect(balances.find((a) => a.id === CASH)?.balance).toBe(500000 - 300000)
      expect(await getSummary("2026-06-01", "2026-06-30")).toEqual({
        income: 0,
        expense: 300000,
        net: -300000,
      })
    })

    it("creates an income transaction for an owed_to_me repayment and updates balances and summary", async () => {
      await insertLoan({
        id: "loan-2",
        person: "Ana Reyes",
        amount: 800000,
        direction: "owed_to_me",
        date: "2026-06-01",
      })

      await expect(
        recordLoanPayment(
          "loan-2",
          paymentForm({
            amount: "4,000.00",
            accountId: BANK,
            date: "2026-06-20",
          }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-2?paid=1")

      const payments = await db.select().from(loanPayments).where(eq(loanPayments.loanId, "loan-2"))
      expect(payments).toHaveLength(1)
      expect(payments[0]?.amount).toBe(400000)
      expect(payments[0]?.accountId).toBe(BANK)

      const txns = await db.select().from(transactions).where(eq(transactions.id, payments[0]!.transactionId!))
      expect(txns).toHaveLength(1)
      expect(txns[0]?.type).toBe("income")
      expect(txns[0]?.amount).toBe(400000)
      expect(txns[0]?.note).toBe("Repayment from Ana Reyes")

      const balances = await getAccountBalances()
      expect(balances.find((a) => a.id === BANK)?.balance).toBe(1000000 + 400000)
      expect(await getSummary("2026-06-01", "2026-06-30")).toEqual({
        income: 400000,
        expense: 0,
        net: 400000,
      })
    })

    it("accepts repayments on an archived account", async () => {
      await db.update(accounts).set({ archived: true }).where(eq(accounts.id, CASH))
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(
        recordLoanPayment("loan-1", paymentForm({ accountId: CASH, amount: "1,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      expect(await db.select().from(loanPayments)).toHaveLength(1)
    })

    it("rejects an invalid account", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      const result = await recordLoanPayment("loan-1", paymentForm({ accountId: "non-existent" }))
      expect(result).toEqual({
        code: "account-invalid",
        error: "Choose an account.",
      })
    })

    it("handles overpayment cleanly by clamping remainingBalance to zero and marking settled", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
        dueDate: "2020-01-01",
      })

      // Single payment exceeding loan amount (₱6,500 on a ₱5,000 loan)
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "6,500.00", accountId: BANK })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      const loan = await getLoanById("loan-1")
      expect(loan?.totalPaid).toBe(650000)
      expect(loan?.remainingBalance).toBe(0)
      expect(loan?.status).toBe("settled")
      expect(loan?.isOverdue).toBe(false)

      // Settled/overpaid loan is excluded from active summary (never negative)
      expect(await getLoanSummary()).toEqual({
        totalIOwe: 0,
        totalOwedToMe: 0,
        netPosition: 0,
      })

      // Linked transaction records full amount paid
      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]?.amount).toBe(650000)
    })

    it("deletes a payment and its linked transaction, restoring balance and loan status", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "2,000.00", date: "2026-06-10" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")
      await expect(
        recordLoanPayment("loan-1", paymentForm({ amount: "3,000.00", date: "2026-06-20" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/loan-1?paid=1")

      let loan = await getLoanById("loan-1")
      expect(loan?.status).toBe("settled")
      expect(loan?.remainingBalance).toBe(0)

      const payments = await getLoanPayments("loan-1")
      expect(payments).toHaveLength(2)

      // Delete the ₱3,000 payment (newest first)
      await expect(deleteLoanPayment("loan-1", payments[0]!.id)).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1",
      )

      expect(await db.select().from(loanPayments)).toHaveLength(1)
      expect(await db.select().from(transactions)).toHaveLength(1)

      loan = await getLoanById("loan-1")
      expect(loan?.totalPaid).toBe(200000)
      expect(loan?.remainingBalance).toBe(300000)
      expect(loan?.status).toBe("partially_paid")

      const balances = await getAccountBalances()
      expect(balances.find((a) => a.id === CASH)?.balance).toBe(500000 - 200000)

      // Delete the remaining ₱2,000 payment
      await expect(deleteLoanPayment("loan-1", payments[1]!.id)).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1",
      )

      expect(await db.select().from(loanPayments)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)

      loan = await getLoanById("loan-1")
      expect(loan?.totalPaid).toBe(0)
      expect(loan?.remainingBalance).toBe(500000)
      expect(loan?.status).toBe("open")
    })

    it("deletes a payment cleanly even when its linked transaction was already deleted", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Kuya Mark",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await expect(recordLoanPayment("loan-1", paymentForm())).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1?paid=1",
      )

      const payment = (await db.select().from(loanPayments))[0]!
      await expect(deleteTransaction(payment.transactionId!, new FormData())).rejects.toThrow(
        "NEXT_REDIRECT:/transactions",
      )

      // Linked transaction is gone and payment.transactionId is now null via ON DELETE SET NULL
      const orphanedPayment = (
        await db.select().from(loanPayments).where(eq(loanPayments.id, payment.id))
      )[0]!
      expect(orphanedPayment.transactionId).toBeNull()

      await expect(deleteLoanPayment("loan-1", payment.id)).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1",
      )
      expect(await db.select().from(loanPayments)).toHaveLength(0)
    })

    it("refuses to delete a payment belonging to another loan (IDOR guard) or missing payment", async () => {
      await insertLoan({
        id: "loan-1",
        person: "Loan One",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })
      await insertLoan({
        id: "loan-2",
        person: "Loan Two",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(recordLoanPayment("loan-2", paymentForm())).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-2?paid=1",
      )
      const loan2Payment = (await db.select().from(loanPayments))[0]!

      // Attempting to delete loan-2's payment via loan-1's id must not delete anything
      await expect(deleteLoanPayment("loan-1", loan2Payment.id)).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1",
      )
      await expect(deleteLoanPayment("loan-1", "missing-payment")).rejects.toThrow(
        "NEXT_REDIRECT:/loans/loan-1",
      )

      expect(await db.select().from(loanPayments)).toHaveLength(1)
      expect(await db.select().from(transactions)).toHaveLength(1)
    })
  })
})

async function balanceOf(accountId: string): Promise<number | undefined> {
  const balances = await getAccountBalances()
  return balances.find((a) => a.id === accountId)?.balance
}

describe("loan ↔ account and ledger linkage", () => {
  beforeEach(async () => {
    cookieStore.clear()
    await resetDatabase()

    await insertUser("user", await hashPassword("super-secret-passcode"))
    await createSession("user")

    await insertAccount({ id: CASH, name: "Cash", type: "cash", openingBalance: 500000 })
    await insertAccount({ id: BANK, name: "Bank", type: "bank", openingBalance: 1000000 })
  })

  describe("createLoan with accountId", () => {
    it("borrowed (i_owe) creates an income transaction on the account and raises its balance", async () => {
      await expect(createLoan(loanForm({ accountId: BANK }))).rejects.toThrow("NEXT_REDIRECT:/loans")

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({
        type: "income",
        amount: 1000000,
        accountId: BANK,
        toAccountId: null,
        categoryId: null,
        date: "2026-06-01",
        note: "Borrowed from Maria Santos — Emergency money",
      })
      expect(txns[0]?.time).toMatch(/^\d{2}:\d{2}$/)

      const rows = await db.select().from(loans)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        direction: "i_owe",
        accountId: BANK,
        transactionId: txns[0]!.id,
        amount: 1000000,
      })

      expect(await balanceOf(BANK)).toBe(1000000 + 1000000)
      expect(await balanceOf(CASH)).toBe(500000)
    })

    it("borrowed without a note uses the plain 'Borrowed from <person>' note", async () => {
      await expect(createLoan(loanForm({ accountId: CASH, note: "   " }))).rejects.toThrow(
        "NEXT_REDIRECT:/loans",
      )

      const txns = await db.select().from(transactions)
      expect(txns[0]?.note).toBe("Borrowed from Maria Santos")
      expect((await db.select().from(loans))[0]?.note).toBeNull()
    })

    it("lent (owed_to_me) creates an expense transaction on the account and lowers its balance", async () => {
      await expect(
        createLoan(
          loanForm({
            person: "Ana Reyes",
            direction: "owed_to_me",
            amount: "2,500.50",
            accountId: CASH,
            note: "Tuition",
          }),
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/loans")

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({
        type: "expense",
        amount: 250050,
        accountId: CASH,
        note: "Lent to Ana Reyes — Tuition",
      })

      const rows = await db.select().from(loans)
      expect(rows[0]).toMatchObject({
        direction: "owed_to_me",
        accountId: CASH,
        transactionId: txns[0]!.id,
      })

      expect(await balanceOf(CASH)).toBe(500000 - 250050)
      expect(await balanceOf(BANK)).toBe(1000000)
    })

    it("lent without a note uses the plain 'Lent to <person>' note", async () => {
      await expect(
        createLoan(loanForm({ direction: "owed_to_me", accountId: BANK, note: "" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans")

      expect((await db.select().from(transactions))[0]?.note).toBe("Lent to Maria Santos")
    })

    it("trims the account id and surfaces accountId/transactionId through getLoans and getLoanById", async () => {
      await expect(createLoan(loanForm({ accountId: `  ${BANK}  ` }))).rejects.toThrow(
        "NEXT_REDIRECT:/loans",
      )

      const row = (await db.select().from(loans))[0]!
      expect(row.accountId).toBe(BANK)

      const viaList = (await getLoans(false))[0]
      const viaId = await getLoanById(row.id)
      expect(viaList?.accountId).toBe(BANK)
      expect(viaList?.transactionId).toBe(row.transactionId)
      expect(viaId?.accountId).toBe(BANK)
      expect(viaId?.transactionId).toBe(row.transactionId)
      expect(row.transactionId).not.toBeNull()
    })

    it("rejects an unknown account with account-invalid and writes nothing", async () => {
      expect(await createLoan(loanForm({ accountId: "no-such-account" }))).toEqual({
        code: "account-invalid",
        error: "Choose an account.",
      })

      expect(await db.select().from(loans)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
    })

    it("does not create a transaction when the form itself is invalid", async () => {
      expect(await createLoan(loanForm({ accountId: BANK, amount: "0" }))).toEqual({
        code: "amount-not-positive",
        error: "Enter an amount greater than zero.",
      })

      expect(await db.select().from(loans)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
      expect(await balanceOf(BANK)).toBe(1000000)
    })

    it("still creates an unlinked loan (no transaction) when no account is given", async () => {
      await expect(createLoan(loanForm())).rejects.toThrow("NEXT_REDIRECT:/loans")

      const row = (await db.select().from(loans))[0]!
      expect(row.accountId).toBeNull()
      expect(row.transactionId).toBeNull()
      expect(await db.select().from(transactions)).toHaveLength(0)
    })

    it("accepts an archived account (archiving hides it from pickers only)", async () => {
      await db.update(accounts).set({ archived: true }).where(eq(accounts.id, CASH))

      await expect(createLoan(loanForm({ accountId: CASH }))).rejects.toThrow("NEXT_REDIRECT:/loans")
      expect(await db.select().from(transactions)).toHaveLength(1)
    })

    it("includes the borrowed money in the loan summary and lets repayments reverse the balance", async () => {
      await expect(createLoan(loanForm({ accountId: BANK }))).rejects.toThrow("NEXT_REDIRECT:/loans")
      const loan = (await db.select().from(loans))[0]!

      expect(await getLoanSummary()).toEqual({
        totalIOwe: 1000000,
        totalOwedToMe: 0,
        netPosition: -1000000,
      })

      await expect(
        recordLoanPayment(loan.id, paymentForm({ accountId: BANK, amount: "4,000.00" })),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}?paid=1`)

      // +10,000 borrowed, -4,000 repaid.
      expect(await balanceOf(BANK)).toBe(1000000 + 1000000 - 400000)
      expect((await getLoanById(loan.id))?.remainingBalance).toBe(600000)
    })
  })

  describe("updateLoan keeps the linked transaction in sync", () => {
    async function createLinked(overrides: Record<string, string> = {}) {
      await expect(createLoan(loanForm({ accountId: BANK, ...overrides }))).rejects.toThrow(
        "NEXT_REDIRECT:/loans",
      )
      const loan = (await db.select().from(loans))[0]!
      return loan
    }

    it("updates amount, account, direction/type, date and note on the same transaction row", async () => {
      const loan = await createLinked()
      const originalTxnId = loan.transactionId!

      await expect(
        updateLoan(
          loan.id,
          loanForm({
            person: "Maria Santos-Reyes",
            amount: "12,000.00",
            direction: "owed_to_me",
            accountId: CASH,
            date: "2026-06-05",
            note: "Reversed",
          }),
        ),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}`)

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({
        id: originalTxnId,
        type: "expense",
        amount: 1200000,
        accountId: CASH,
        date: "2026-06-05",
        note: "Lent to Maria Santos-Reyes — Reversed",
      })

      const updated = (await db.select().from(loans).where(eq(loans.id, loan.id)))[0]!
      expect(updated).toMatchObject({
        direction: "owed_to_me",
        accountId: CASH,
        transactionId: originalTxnId,
        amount: 1200000,
      })

      // The bank no longer carries the borrowed money; the cash wallet paid it out.
      expect(await balanceOf(BANK)).toBe(1000000)
      expect(await balanceOf(CASH)).toBe(500000 - 1200000)
    })

    it("flips a lent entry back to borrowed (income) and rewrites the note prefix", async () => {
      const loan = await createLinked({ direction: "owed_to_me", note: "" })
      expect((await db.select().from(transactions))[0]?.type).toBe("expense")

      await expect(
        updateLoan(loan.id, loanForm({ direction: "i_owe", accountId: BANK, note: "" })),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}`)

      const txn = (await db.select().from(transactions))[0]!
      expect(txn.type).toBe("income")
      expect(txn.note).toBe("Borrowed from Maria Santos")
      expect(await balanceOf(BANK)).toBe(1000000 + 1000000)
    })

    it("keeps the existing account when the form sends no accountId, but still syncs the amount", async () => {
      const loan = await createLinked()

      await expect(
        updateLoan(loan.id, loanForm({ amount: "3,000.00" })),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}`)

      const updated = (await db.select().from(loans).where(eq(loans.id, loan.id)))[0]!
      expect(updated.accountId).toBe(BANK)
      expect(updated.transactionId).toBe(loan.transactionId)

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({ amount: 300000, accountId: BANK })
      expect(await balanceOf(BANK)).toBe(1000000 + 300000)
    })

    it("rejects an unknown account with account-invalid and leaves loan and transaction untouched", async () => {
      const loan = await createLinked()

      expect(
        await updateLoan(loan.id, loanForm({ accountId: "no-such-account", amount: "99.00" })),
      ).toEqual({ code: "account-invalid", error: "Choose an account." })

      const unchanged = (await db.select().from(loans).where(eq(loans.id, loan.id)))[0]!
      expect(unchanged.amount).toBe(1000000)
      expect(unchanged.accountId).toBe(BANK)

      const txn = (await db.select().from(transactions))[0]!
      expect(txn.amount).toBe(1000000)
      expect(txn.accountId).toBe(BANK)
    })

    it("creates and links a transaction when a legacy unlinked loan is given an account", async () => {
      await insertLoan({
        id: "legacy",
        person: "Pedro",
        amount: 500000,
        direction: "owed_to_me",
        date: "2026-06-01",
      })
      expect(await db.select().from(transactions)).toHaveLength(0)

      await expect(
        updateLoan("legacy", loanForm({ person: "Pedro", amount: "5,000.00", direction: "owed_to_me", accountId: CASH, note: "" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans/legacy")

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      expect(txns[0]).toMatchObject({
        type: "expense",
        amount: 500000,
        accountId: CASH,
        note: "Lent to Pedro",
      })

      const updated = (await db.select().from(loans).where(eq(loans.id, "legacy")))[0]!
      expect(updated.accountId).toBe(CASH)
      expect(updated.transactionId).toBe(txns[0]!.id)
      expect(await balanceOf(CASH)).toBe(500000 - 500000)
    })

    it("does not create a transaction when a legacy loan is updated without an account", async () => {
      await insertLoan({
        id: "legacy",
        person: "Pedro",
        amount: 500000,
        direction: "i_owe",
        date: "2026-06-01",
      })

      await expect(updateLoan("legacy", loanForm({ person: "Pedro" }))).rejects.toThrow(
        "NEXT_REDIRECT:/loans/legacy",
      )

      expect(await db.select().from(transactions)).toHaveLength(0)
      const updated = (await db.select().from(loans).where(eq(loans.id, "legacy")))[0]!
      expect(updated.accountId).toBeNull()
      expect(updated.transactionId).toBeNull()
    })

    it("re-creates the initial transaction when the original one was deleted from the ledger", async () => {
      const loan = await createLinked()

      await expect(deleteTransaction(loan.transactionId!, new FormData())).rejects.toThrow(
        "NEXT_REDIRECT:/transactions",
      )

      // ON DELETE SET NULL keeps the loan but drops the link.
      const orphaned = (await db.select().from(loans).where(eq(loans.id, loan.id)))[0]!
      expect(orphaned.transactionId).toBeNull()
      expect(orphaned.accountId).toBe(BANK)
      expect(await balanceOf(BANK)).toBe(1000000)

      await expect(updateLoan(loan.id, loanForm({ accountId: BANK }))).rejects.toThrow(
        `NEXT_REDIRECT:/loans/${loan.id}`,
      )

      const txns = await db.select().from(transactions)
      expect(txns).toHaveLength(1)
      const relinked = (await db.select().from(loans).where(eq(loans.id, loan.id)))[0]!
      expect(relinked.transactionId).toBe(txns[0]!.id)
      expect(await balanceOf(BANK)).toBe(1000000 + 1000000)
    })
  })

  describe("deleteLoan removes the initial linked transaction", () => {
    it("deletes the initial transaction plus repayments and restores the account balance", async () => {
      await expect(createLoan(loanForm({ accountId: BANK }))).rejects.toThrow("NEXT_REDIRECT:/loans")
      const loan = (await db.select().from(loans))[0]!

      await expect(
        recordLoanPayment(loan.id, paymentForm({ accountId: BANK, amount: "2,000.00" })),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}?paid=1`)
      await expect(
        recordLoanPayment(loan.id, paymentForm({ accountId: CASH, amount: "1,000.00" })),
      ).rejects.toThrow(`NEXT_REDIRECT:/loans/${loan.id}?paid=1`)

      expect(await db.select().from(transactions)).toHaveLength(3)

      await expect(deleteLoan(loan.id)).rejects.toThrow("NEXT_REDIRECT:/loans")

      expect(await db.select().from(loans)).toHaveLength(0)
      expect(await db.select().from(loanPayments)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
      expect(await balanceOf(BANK)).toBe(1000000)
      expect(await balanceOf(CASH)).toBe(500000)
    })

    it("deletes a lent loan's expense transaction (money returns to the account)", async () => {
      await expect(
        createLoan(loanForm({ direction: "owed_to_me", accountId: CASH, amount: "1,000.00" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans")
      const loan = (await db.select().from(loans))[0]!
      expect(await balanceOf(CASH)).toBe(500000 - 100000)

      await expect(deleteLoan(loan.id)).rejects.toThrow("NEXT_REDIRECT:/loans")

      expect(await db.select().from(transactions)).toHaveLength(0)
      expect(await balanceOf(CASH)).toBe(500000)
    })

    it("leaves unrelated transactions and other loans' transactions alone", async () => {
      await expect(createLoan(loanForm({ accountId: BANK, person: "Loan One" }))).rejects.toThrow(
        "NEXT_REDIRECT:/loans",
      )
      await expect(
        createLoan(loanForm({ accountId: CASH, person: "Loan Two", direction: "owed_to_me" })),
      ).rejects.toThrow("NEXT_REDIRECT:/loans")
      await insertTransaction({
        id: "unrelated-txn",
        date: "2026-06-15",
        type: "expense",
        amount: 15000,
        accountId: CASH,
        note: "Groceries",
      })

      const one = (await db.select().from(loans).where(eq(loans.person, "Loan One")))[0]!
      const two = (await db.select().from(loans).where(eq(loans.person, "Loan Two")))[0]!

      await expect(deleteLoan(one.id)).rejects.toThrow("NEXT_REDIRECT:/loans")

      const remaining = await db.select().from(transactions)
      expect(remaining.map((t) => t.id).sort()).toEqual([two.transactionId!, "unrelated-txn"].sort())
      expect(await db.select().from(loans)).toHaveLength(1)
    })

    it("deletes cleanly when the initial transaction was already removed from the ledger", async () => {
      await expect(createLoan(loanForm({ accountId: BANK }))).rejects.toThrow("NEXT_REDIRECT:/loans")
      const loan = (await db.select().from(loans))[0]!

      await expect(deleteTransaction(loan.transactionId!, new FormData())).rejects.toThrow(
        "NEXT_REDIRECT:/transactions",
      )
      await expect(deleteLoan(loan.id)).rejects.toThrow("NEXT_REDIRECT:/loans")

      expect(await db.select().from(loans)).toHaveLength(0)
      expect(await db.select().from(transactions)).toHaveLength(0)
    })
  })
})
