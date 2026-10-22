/**
 * MoneMoni — default seed data.
 *
 * ARCHITECTURE.md: "Accounts and categories are seeded **independently and
 * idempotently**: each is inserted only while its own table is empty, so
 * emptying one table can never duplicate the rows of the other."
 *
 * The expectations are read out of ARCHITECTURE.md by `tests/setup/architecture.ts`
 * instead of being hard coded, so the seed cannot silently drift away from
 * the specification.
 */

import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/lib/db/client"
import { getAccounts, getCategories } from "@/lib/db/queries"
import { accounts, categories } from "@/lib/db/schema"
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, ensureSeedData } from "@/lib/db/seed"

import { documentedAccounts, documentedCategories } from "./setup/architecture"
import { resetDatabase } from "./setup/db"

beforeEach(async () => {
  await resetDatabase()
})

describe("ensureSeedData — a fresh database", () => {
  it("seeds 5 accounts and 20 categories", async () => {
    await ensureSeedData()

    expect(await db.select().from(accounts)).toHaveLength(5)
    expect(await db.select().from(categories)).toHaveLength(20)
  })

  it("inserts the documented default accounts", async () => {
    await ensureSeedData()

    const rows = await db.select().from(accounts)
    const documented = documentedAccounts()

    expect(documented.map((account) => account.name)).toEqual([
      "Cash Wallet",
      "BPI Bank",
      "GCash",
      "Maya",
      "Credit Card",
    ])

    for (const account of documented) {
      const row = rows.find((candidate) => candidate.name === account.name)
      expect(row, `missing account "${account.name}"`).toBeDefined()
      expect(row?.type).toBe(account.type)
      expect(row?.isLiability).toBe(account.isLiability)
      expect(row?.openingBalance).toBe(0)
      expect(row?.archived).toBe(false)
    }
  })

  it("inserts the documented default categories", async () => {
    await ensureSeedData()

    const rows = await db.select().from(categories)
    const documented = documentedCategories()

    // 13 expense categories + 7 income categories.
    expect(documented).toHaveLength(20)
    expect(rows).toHaveLength(20)

    for (const category of documented) {
      const row = rows.find(
        (candidate) => candidate.name === category.name && candidate.kind === category.kind,
      )
      expect(row, `missing category "${category.name}" (${category.kind})`).toBeDefined()
      expect(row?.icon).toBe(category.icon)
      expect(row?.color).toBe(category.color)
      expect(row?.archived).toBe(false)
    }
  })

  it("keeps the documented order of the accounts and categories", async () => {
    await ensureSeedData()

    const accountRows = await getAccounts()
    expect(accountRows.map((account) => account.name)).toEqual(
      documentedAccounts().map((account) => account.name),
    )

    const expense = await getCategories("expense")
    expect(expense.map((category) => category.name)).toEqual(
      documentedCategories()
        .filter((category) => category.kind === "expense")
        .map((category) => category.name),
    )

    const income = await getCategories("income")
    expect(income.map((category) => category.name)).toEqual(
      documentedCategories()
        .filter((category) => category.kind === "income")
        .map((category) => category.name),
    )
  })

  it("numbers the accounts and the categories within their kind", async () => {
    await ensureSeedData()

    const accountRows = await getAccounts()
    expect(accountRows.map((account) => account.sortOrder)).toEqual([0, 1, 2, 3, 4])

    const expense = await getCategories("expense")
    expect(expense.map((category) => category.sortOrder)).toEqual(
      expense.map((_, index) => index),
    )

    const income = await getCategories("income")
    expect(income.map((category) => category.sortOrder)).toEqual(
      income.map((_, index) => index),
    )
  })
})

describe("ensureSeedData — idempotency", () => {
  it("is a no-op when called again", async () => {
    await ensureSeedData()
    const accountsAfterFirst = await db.select().from(accounts)
    const categoriesAfterFirst = await db.select().from(categories)

    await ensureSeedData()
    await ensureSeedData()

    const accountsAfterThird = await db.select().from(accounts)
    const categoriesAfterThird = await db.select().from(categories)

    expect(accountsAfterThird).toHaveLength(5)
    expect(categoriesAfterThird).toHaveLength(20)
    expect(accountsAfterThird).toHaveLength(accountsAfterFirst.length)
    expect(categoriesAfterThird).toHaveLength(categoriesAfterFirst.length)

    // The rows are the very same rows — not a second copy of them.
    expect(accountsAfterThird.map((account) => account.id).sort()).toEqual(
      accountsAfterFirst.map((account) => account.id).sort(),
    )
    expect(categoriesAfterThird.map((category) => category.id).sort()).toEqual(
      categoriesAfterFirst.map((category) => category.id).sort(),
    )

    // No duplicated names either.
    expect(new Set(accountsAfterThird.map((account) => account.name)).size).toBe(
      accountsAfterThird.length,
    )
    expect(
      new Set(
        categoriesAfterThird.map((category) => `${category.kind}:${category.name}`),
      ).size,
    ).toBe(categoriesAfterThird.length)
  })

  it("does not duplicate anything when the calls race each other", async () => {
    await Promise.all([
      ensureSeedData(),
      ensureSeedData(),
      ensureSeedData(),
      ensureSeedData(),
    ])

    expect(await db.select().from(accounts)).toHaveLength(5)
    expect(await db.select().from(categories)).toHaveLength(20)
  })
})

describe("ensureSeedData — the two tables are seeded independently", () => {
  it("restores the categories and leaves the accounts alone", async () => {
    // This is the scenario that used to duplicate the default accounts: the
    // seed decided what to insert by looking at the `categories` table only.
    await ensureSeedData()
    const accountsBefore = await db.select().from(accounts)
    expect(accountsBefore).toHaveLength(5)

    // The user removes every category.
    await db.delete(categories)
    expect(await db.select().from(categories)).toHaveLength(0)

    await ensureSeedData()

    const accountsAfter = await db.select().from(accounts)
    const categoriesAfter = await db.select().from(categories)

    // The categories are back …
    expect(categoriesAfter).toHaveLength(20)
    // … and the accounts were not duplicated.
    expect(accountsAfter).toHaveLength(5)
    expect(new Set(accountsAfter.map((account) => account.name)).size).toBe(5)
    expect(accountsAfter.map((account) => account.id).sort()).toEqual(
      accountsBefore.map((account) => account.id).sort(),
    )
  })

  it("restores the accounts and leaves the categories alone", async () => {
    await ensureSeedData()
    const categoriesBefore = await db.select().from(categories)
    expect(categoriesBefore).toHaveLength(20)

    // The user removes every account.
    await db.delete(accounts)
    expect(await db.select().from(accounts)).toHaveLength(0)

    await ensureSeedData()

    const accountsAfter = await db.select().from(accounts)
    const categoriesAfter = await db.select().from(categories)

    // The accounts are back …
    expect(accountsAfter).toHaveLength(5)
    // … and the categories were not duplicated.
    expect(categoriesAfter).toHaveLength(20)
    expect(
      new Set(categoriesAfter.map((category) => `${category.kind}:${category.name}`)).size,
    ).toBe(20)
    expect(categoriesAfter.map((category) => category.id).sort()).toEqual(
      categoriesBefore.map((category) => category.id).sort(),
    )
  })

  it("only fills the categories when a category already exists", async () => {
    await db.insert(categories).values({
      id: "cat-1",
      name: "Groceries",
      kind: "expense",
      icon: "🛒",
      color: "#84cc16",
      sortOrder: 0,
      createdAt: 1,
    })

    await ensureSeedData()

    const accountRows = await db.select().from(accounts)
    const categoryRows = await db.select().from(categories)

    // The categories table was not empty, so it was left alone …
    expect(categoryRows).toHaveLength(1)
    expect(categoryRows[0]?.id).toBe("cat-1")
    // … while the empty accounts table was filled.
    expect(accountRows).toHaveLength(5)
  })

  it("only fills the accounts when an account already exists", async () => {
    await db.insert(accounts).values({
      id: "acc-1",
      name: "Cash Wallet",
      type: "cash",
      isLiability: false,
      openingBalance: 0,
      archived: false,
      sortOrder: 0,
      createdAt: 1,
    })

    await ensureSeedData()

    const accountRows = await db.select().from(accounts)
    const categoryRows = await db.select().from(categories)

    // The accounts table was not empty, so it was left alone …
    expect(accountRows).toHaveLength(1)
    expect(accountRows[0]?.id).toBe("acc-1")
    // … while the empty categories table was filled.
    expect(categoryRows).toHaveLength(20)
  })

  it("re-seeds a table with the documented values", async () => {
    await ensureSeedData()
    await db.delete(categories)
    await db.delete(accounts)

    await ensureSeedData()

    const accountRows = await db.select().from(accounts)
    for (const account of documentedAccounts()) {
      const row = accountRows.find((candidate) => candidate.name === account.name)
      expect(row, `missing account "${account.name}"`).toBeDefined()
      expect(row?.type).toBe(account.type)
      expect(row?.isLiability).toBe(account.isLiability)
    }

    const categoryRows = await db.select().from(categories)
    for (const category of documentedCategories()) {
      const row = categoryRows.find(
        (candidate) => candidate.name === category.name && candidate.kind === category.kind,
      )
      expect(row, `missing category "${category.name}" (${category.kind})`).toBeDefined()
      expect(row?.icon).toBe(category.icon)
      expect(row?.color).toBe(category.color)
    }
  })
})

describe("seed defaults", () => {
  it("exposes the defaults as exported constants", () => {
    expect(DEFAULT_ACCOUNTS).toHaveLength(5)
    expect(DEFAULT_CATEGORIES).toHaveLength(20)

    const documented = documentedCategories()
    expect(
      DEFAULT_CATEGORIES.map((category) => ({
        name: category.name,
        kind: category.kind,
        icon: category.icon,
        color: category.color,
      })),
    ).toEqual(documented)

    expect(
      DEFAULT_ACCOUNTS.map((account) => ({
        name: account.name,
        type: account.type,
        isLiability: account.isLiability,
      })),
    ).toEqual(documentedAccounts())
  })
})
