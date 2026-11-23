"use server"
/**
 * MoneMoni — peer-to-peer loan Server Actions.
 *
 * Every action follows the same order: `requireSession()` first, then the
 * pure validation, then database-dependent checks, then the write, and
 * finally a `redirect()` (post/redirect/get).
 *
 * A validation failure is **never** thrown at the caller: the action
 * returns an error result carrying a short code and the page turns that
 * into a redirect with the code in the URL. That keeps every screen a pure
 * Server Component — no client JavaScript required.
 */

import { and, eq, inArray } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { nowTimeKey } from "@/lib/dates"
import { db } from "@/lib/db/client"
import { getLoanById, getLoanPayments } from "@/lib/db/queries"
import { accounts, loanPayments, loans, transactions } from "@/lib/db/schema"
import {
  loanFailure,
  loanPaymentFailure,
  readLoanFormValues,
  readLoanPaymentFormValues,
  validateLoan,
  validateLoanPayment,
  type LoanActionResult,
  type LoanPaymentActionResult,
} from "@/lib/validation/loans"

/**
 * Does this account exist?
 *
 * Archived accounts are accepted: archiving hides a record from the pickers,
 * it never invalidates a transaction or repayment that points at it.
 */
async function accountExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1)

  return rows.length > 0
}

/**
 * Creates a peer-to-peer loan.
 */
export async function createLoan(formData: FormData): Promise<LoanActionResult> {
  await requireSession()

  const validation = validateLoan(readLoanFormValues(formData))

  if (!validation.ok) {
    return loanFailure(validation.code)
  }

  const { person, amount, direction, date, dueDate, accountId, note } = validation.value
  const now = Date.now()

  let transactionId: string | null = null

  if (accountId) {
    if (!(await accountExists(accountId))) {
      return loanFailure("account-invalid")
    }

    transactionId = crypto.randomUUID()
    await db.insert(transactions).values({
      id: transactionId,
      date,
      time: nowTimeKey(),
      type: direction === "i_owe" ? "income" : "expense",
      amount,
      accountId,
      note:
        direction === "i_owe"
          ? note
            ? `Borrowed from ${person} — ${note}`
            : `Borrowed from ${person}`
          : note
            ? `Lent to ${person} — ${note}`
            : `Lent to ${person}`,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db.insert(loans).values({
    id: crypto.randomUUID(),
    person,
    amount,
    currency: "PHP",
    direction,
    accountId,
    transactionId,
    date,
    dueDate,
    note,
    archived: false,
    createdAt: now,
    updatedAt: now,
  })

  redirect("/loans")
}

/**
 * Updates an existing loan.
 */
export async function updateLoan(id: string, formData: FormData): Promise<LoanActionResult> {
  await requireSession()

  const existing = await getLoanById(id)

  if (!existing) {
    redirect("/loans")
  }

  const validation = validateLoan(readLoanFormValues(formData))

  if (!validation.ok) {
    return loanFailure(validation.code)
  }

  const { person, amount, direction, date, dueDate, accountId, note } = validation.value
  const targetAccountId = accountId ?? existing.accountId
  const now = Date.now()

  if (accountId && !(await accountExists(accountId))) {
    return loanFailure("account-invalid")
  }

  let finalTxnId = existing.transactionId

  const txnNote =
    direction === "i_owe"
      ? note
        ? `Borrowed from ${person} — ${note}`
        : `Borrowed from ${person}`
      : note
        ? `Lent to ${person} — ${note}`
        : `Lent to ${person}`

  if (existing.transactionId) {
    const existingTxns = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.id, existing.transactionId))
      .limit(1)

    if (existingTxns.length > 0) {
      await db
        .update(transactions)
        .set({
          date,
          type: direction === "i_owe" ? "income" : "expense",
          amount,
          accountId: targetAccountId ?? undefined,
          note: txnNote,
          updatedAt: now,
        })
        .where(eq(transactions.id, existing.transactionId))
    } else if (targetAccountId) {
      finalTxnId = crypto.randomUUID()
      await db.insert(transactions).values({
        id: finalTxnId,
        date,
        time: nowTimeKey(),
        type: direction === "i_owe" ? "income" : "expense",
        amount,
        accountId: targetAccountId,
        note: txnNote,
        createdAt: now,
        updatedAt: now,
      })
    }
  } else if (targetAccountId) {
    finalTxnId = crypto.randomUUID()
    await db.insert(transactions).values({
      id: finalTxnId,
      date,
      time: nowTimeKey(),
      type: direction === "i_owe" ? "income" : "expense",
      amount,
      accountId: targetAccountId,
      note: txnNote,
      createdAt: now,
      updatedAt: now,
    })
  }

  await db
    .update(loans)
    .set({
      person,
      amount,
      direction,
      accountId: targetAccountId,
      transactionId: finalTxnId,
      date,
      dueDate,
      note,
      updatedAt: now,
    })
    .where(eq(loans.id, id))

  redirect(`/loans/${id}`)
}

/**
 * Archives a loan.
 */
export async function archiveLoan(id: string, formData?: FormData): Promise<void> {
  await requireSession()

  const existing = await getLoanById(id)

  if (!existing) {
    redirect("/loans")
  }

  await db.update(loans).set({ archived: true, updatedAt: Date.now() }).where(eq(loans.id, id))

  redirect("/loans")
}

/**
 * Restores an archived loan.
 */
export async function restoreLoan(id: string, formData?: FormData): Promise<void> {
  await requireSession()

  const existing = await getLoanById(id)

  if (!existing) {
    redirect("/loans")
  }

  await db.update(loans).set({ archived: false, updatedAt: Date.now() }).where(eq(loans.id, id))

  redirect("/loans")
}

/**
 * Deletes a loan and any linked transactions created by its payments.
 */
export async function deleteLoan(id: string, formData?: FormData): Promise<void> {
  await requireSession()

  const existing = await getLoanById(id)

  if (!existing) {
    redirect("/loans")
  }

  const payments = await getLoanPayments(id)
  const txnIds = payments
    .map((p) => p.transactionId)
    .filter((tid): tid is string => typeof tid === "string" && tid.length > 0)

  if (existing.transactionId) {
    txnIds.push(existing.transactionId)
  }

  if (txnIds.length > 0) {
    await db.delete(transactions).where(inArray(transactions.id, txnIds))
  }

  await db.delete(loans).where(eq(loans.id, id))

  redirect("/loans")
}

/**
 * Records a repayment for a loan.
 */
export async function recordLoanPayment(
  loanId: string,
  formData: FormData,
): Promise<LoanPaymentActionResult> {
  await requireSession()

  const loan = await getLoanById(loanId)

  if (!loan) {
    redirect("/loans")
  }

  const validation = validateLoanPayment(readLoanPaymentFormValues(formData))

  if (!validation.ok) {
    return loanPaymentFailure(validation.code)
  }

  const { amount, accountId, date, note } = validation.value

  if (!(await accountExists(accountId))) {
    return loanPaymentFailure("account-invalid")
  }

  const transactionId = crypto.randomUUID()
  const paymentId = crypto.randomUUID()
  const now = Date.now()

  // Insert repayment into ledger transactions
  await db.insert(transactions).values({
    id: transactionId,
    date,
    time: nowTimeKey(),
    type: loan.direction === "i_owe" ? "expense" : "income",
    amount,
    accountId,
    note: loan.direction === "i_owe" ? "Repayment to " + loan.person : "Repayment from " + loan.person,
    createdAt: now,
    updatedAt: now,
  })

  // Insert payment record linked to the transaction
  await db.insert(loanPayments).values({
    id: paymentId,
    loanId: loan.id,
    date,
    amount,
    accountId,
    transactionId,
    note,
    createdAt: now,
  })

  redirect(`/loans/${loanId}?paid=1`)
}

/**
 * Deletes a repayment and its linked transaction.
 */
export async function deleteLoanPayment(
  loanId: string,
  paymentId: string,
  formData?: FormData,
): Promise<void> {
  await requireSession()

  const rows = await db
    .select({
      id: loanPayments.id,
      transactionId: loanPayments.transactionId,
    })
    .from(loanPayments)
    .where(and(eq(loanPayments.id, paymentId), eq(loanPayments.loanId, loanId)))
    .limit(1)

  const payment = rows[0]

  if (!payment) {
    redirect(`/loans/${loanId}`)
  }

  if (payment.transactionId) {
    await db.delete(transactions).where(eq(transactions.id, payment.transactionId))
  }

  await db.delete(loanPayments).where(eq(loanPayments.id, paymentId))

  redirect(`/loans/${loanId}`)
}
