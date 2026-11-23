"use server"
/**
 * MoneMoni — transaction Server Actions.
 *
 * Every action follows the same order: `requireSession()` first, then the
 * pure validation, then the database-dependent checks, then the write, and
 * finally a `redirect()` (post/redirect/get).
 *
 * A validation failure is **never** thrown at the caller: the action
 * returns an error result carrying a short code and the page turns that
 * into a redirect with the code in the URL. That keeps every screen a pure
 * Server Component — no client JavaScript required.
 *
 * Only async functions may be exported from a `"use server"` module, so the
 * error codes and their messages live in `@/lib/validation/transactions`.
 */

import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"

import { requireSession } from "@/lib/auth/session"
import { isValidTimeKey, nowTimeKey } from "@/lib/dates"
import { db } from "@/lib/db/client"
import { accounts, categories, loans, transactions } from "@/lib/db/schema"
import { getTransactionById } from "@/lib/db/queries"
import {
  readTransactionFormValues,
  transactionFailure,
  validateTransaction,
  type TransactionActionResult,
} from "@/lib/validation/transactions"
import {
  validateLoan,
  type LoanErrorCode,
} from "@/lib/validation/loans"

/**
 * Does this account exist?
 *
 * Archived accounts are found as well: archiving hides a record from the
 * pickers, it never removes it from the ledger, so a historic transaction
 * that belongs to one is still valid.
 */
async function accountExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1)

  return rows.length > 0
}

/** The kind of a category, or `null` when there is no such category. */
async function categoryKind(id: string): Promise<"income" | "expense" | null> {
  const rows = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1)

  return rows[0]?.kind ?? null
}

/**
 * The database-dependent checks both writes share.
 *
 * Returns the failure code, or `null` when every reference is valid.
 * The kind check enforces ARCHITECTURE.md: "a transaction whose category
 * kind disagrees with its type is a data-integrity error — writes must
 * reject it."
 */
async function checkReferences(input: {
  type: "income" | "expense" | "transfer"
  accountId: string
  categoryId: string | null
  toAccountId: string | null
}): Promise<TransactionActionResult | null> {
  if (!(await accountExists(input.accountId))) {
    return transactionFailure("account-invalid")
  }

  if (input.type === "transfer") {
    if (!input.toAccountId || !(await accountExists(input.toAccountId))) {
      return transactionFailure("to-account-invalid")
    }

    return null
  }

  if (!input.categoryId) {
    return transactionFailure("category-required")
  }

  const kind = await categoryKind(input.categoryId)

  if (!kind) {
    return transactionFailure("category-invalid")
  }

  if (kind !== input.type) {
    return transactionFailure("category-kind-mismatch")
  }

  return null
}

/**
 * Creates a transaction.
 *
 * Returns an error result when the form is not valid; the caller decides
 * how to show it. On success the transaction is stored and the user is sent
 * to the list, so this function does not return in that case.
 */
export async function createTransaction(formData: FormData): Promise<TransactionActionResult> {
  // No session, no write — this check comes before anything else.
  await requireSession()

  const rawType = formData.get("type")
  if (rawType === "borrowed" || rawType === "lent") {
    const direction = rawType === "borrowed" ? "i_owe" : "owed_to_me"
    const read = (key: string): string => {
      const value = formData.get(key)
      return typeof value === "string" ? value : ""
    }

    const loanValidation = validateLoan({
      person: read("person"),
      amount: read("amount"),
      direction,
      date: read("date"),
      dueDate: read("dueDate"),
      accountId: read("accountId"),
      note: read("note"),
    })

    if (!loanValidation.ok) {
      const codeMap: Record<LoanErrorCode, Parameters<typeof transactionFailure>[0]> = {
        "person-required": "person-required",
        "person-too-long": "person-too-long",
        "amount-required": "amount-required",
        "amount-invalid": "amount-invalid",
        "amount-not-positive": "amount-not-positive",
        "direction-invalid": "type-invalid",
        "date-required": "date-required",
        "date-invalid": "date-invalid",
        "due-date-invalid": "date-invalid",
        "account-required": "account-required",
        "account-invalid": "account-invalid",
        "note-too-long": "note-too-long",
      }
      return transactionFailure(codeMap[loanValidation.code] ?? "type-invalid")
    }

    const { person, amount, date, dueDate, accountId, note } = loanValidation.value
    if (!accountId) {
      return transactionFailure("account-required")
    }
    if (!(await accountExists(accountId))) {
      return transactionFailure("account-invalid")
    }

    const transactionId = crypto.randomUUID()
    const loanId = crypto.randomUUID()
    const now = Date.now()
    const rawTime = read("time").trim()
    if (rawTime.length > 0 && !isValidTimeKey(rawTime)) {
      return transactionFailure("time-invalid")
    }
    const time = rawTime.length > 0 ? rawTime : nowTimeKey()

    const txnNote =
      direction === "i_owe"
        ? note
          ? `Borrowed from ${person} — ${note}`
          : `Borrowed from ${person}`
        : note
          ? `Lent to ${person} — ${note}`
          : `Lent to ${person}`

    await db.insert(transactions).values({
      id: transactionId,
      date,
      time,
      type: direction === "i_owe" ? "income" : "expense",
      amount,
      accountId,
      note: txnNote,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(loans).values({
      id: loanId,
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

    redirect(`/loans?tab=${direction}`)
  }

  const validation = validateTransaction(readTransactionFormValues(formData))

  if (!validation.ok) {
    return transactionFailure(validation.code)
  }

  const { type, amount, date, time, accountId, categoryId, toAccountId, note } = validation.value

  // The reference checks need the database, so they cannot live in the pure
  // validator.
  const referenceFailure = await checkReferences({ type, accountId, categoryId, toAccountId })

  if (referenceFailure) {
    return referenceFailure
  }

  await db.insert(transactions).values({
    id: crypto.randomUUID(),
    date,
    time,
    type,
    amount,
    accountId,
    toAccountId,
    categoryId,
    note,
  })

  redirect("/transactions")
}

/**
 * Saves the changes to a transaction.
 *
 * The id comes from the URL (it is bound to the action by the page), never
 * from the form data. Returns an error result when the form is not valid;
 * the caller decides how to show it.
 */
export async function updateTransaction(
  id: string,
  formData: FormData,
): Promise<TransactionActionResult> {
  await requireSession()

  const existing = await getTransactionById(id)

  if (!existing) {
    // The transaction is gone — there is nothing to save.
    redirect("/transactions")
  }

  const validation = validateTransaction(readTransactionFormValues(formData))

  if (!validation.ok) {
    return transactionFailure(validation.code)
  }

  const { type, amount, date, time, accountId, categoryId, toAccountId, note } = validation.value

  const referenceFailure = await checkReferences({ type, accountId, categoryId, toAccountId })

  if (referenceFailure) {
    return referenceFailure
  }

  await db
    .update(transactions)
    .set({
      date,
      time,
      type,
      amount,
      accountId,
      toAccountId,
      categoryId,
      note,
      updatedAt: Date.now(),
    })
    .where(eq(transactions.id, id))

  redirect("/transactions")
}

/**
 * Deletes a transaction.
 *
 * Transactions carry no `archived` flag, so unlike accounts and categories
 * this is a real, irreversible delete — the edit screen asks for
 * confirmation first. The form posts no fields; the id comes from the URL.
 */
export async function deleteTransaction(id: string, formData: FormData): Promise<void> {
  await requireSession()

  const existing = await getTransactionById(id)

  if (!existing) {
    // Nothing to delete — go back to the list.
    redirect("/transactions")
  }

  await db.delete(transactions).where(eq(transactions.id, id))

  redirect("/transactions")
}
