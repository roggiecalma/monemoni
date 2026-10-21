import { describe, expect, it } from "vitest"

import { parsePesoToCentavos, centavosToPesoString } from "@/lib/money/parse"
import { formatPeso, formatMonth } from "@/lib/money/format"
import { db } from "@/lib/db/client"
import { ensureSeedData } from "@/lib/db/seed"
import { accounts, categories, transactions } from "@/lib/db/schema"
import { getSummary, getAccountBalances } from "@/lib/db/queries"

describe("smoke", () => {
  it("parses and formats pesos", () => {
    expect(parsePesoToCentavos("1,234.56")).toBe(123456)
    expect(parsePesoToCentavos("₱99.90")).toBe(9990)
    expect(parsePesoToCentavos("abc")).toBeNull()
    expect(centavosToPesoString(123456)).toBe("1234.56")
    expect(formatPeso(123456)).toBe("₱1,234.56")
    expect(formatMonth("2026-10")).toBe("October 2026")
  })

  it("seeds defaults and computes balances", async () => {
    await ensureSeedData()
    const accts = await db.select().from(accounts)
    const cats = await db.select().from(categories)
    expect(accts.length).toBeGreaterThan(0)
    expect(cats.length).toBeGreaterThan(0)

    const cash = accts.find((a) => a.type === "cash")
    expect(cash).toBeDefined()
    if (!cash) return

    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      date: "2026-10-01",
      type: "income",
      amount: 50000,
      accountId: cash.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    await db.insert(transactions).values({
      id: crypto.randomUUID(),
      date: "2026-10-02",
      type: "expense",
      amount: 12500,
      accountId: cash.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const summary = await getSummary("2026-10-01", "2026-10-31")
    expect(summary.income).toBe(50000)
    expect(summary.expense).toBe(12500)
    expect(summary.net).toBe(37500)

    const balances = await getAccountBalances()
    const cashBalance = balances.find((b) => b.id === cash.id)
    expect(cashBalance?.balance).toBe(37500)
  })
})
