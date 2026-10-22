/**
 * Reads the expectations straight out of ARCHITECTURE.md, which is the source
 * of truth for the default seed data ("Default seed data" section).
 *
 * Parsing the document instead of hard coding the values means the seed
 * cannot silently drift away from the specification.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export interface DocumentedAccount {
  name: string
  type: string
  isLiability: boolean
}

export interface DocumentedCategory {
  name: string
  kind: "income" | "expense"
  icon: string
  color: string
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

/** The raw text of ARCHITECTURE.md. */
export function readArchitecture(): string {
  return readFileSync(path.join(repoRoot, "ARCHITECTURE.md"), "utf8")
}

function lineContaining(text: string, needle: string): string {
  const line = text.split("\n").find((candidate) => candidate.includes(needle))
  if (!line) {
    throw new Error(`ARCHITECTURE.md has no line containing "${needle}"`)
  }
  return line
}

/** Strips the "**Label**:" / "**Label** (…):" prefix from a documentation line. */
function listOf(line: string): string {
  return line.replace(/^\*\*[^*]+\*\*(?:\s*\([^)]*\))?:?\s*/, "")
}

/** The default accounts documented in ARCHITECTURE.md. */
export function documentedAccounts(): DocumentedAccount[] {
  const line = lineContaining(readArchitecture(), "**Accounts:**")

  const accounts: DocumentedAccount[] = []
  const pattern = /([A-Z][A-Za-z0-9 &]+?)\s*\(`(\w+)`(?:,\s*`is_liability = true`)?\)/g

  for (const match of line.matchAll(pattern)) {
    accounts.push({
      name: match[1].trim(),
      type: match[2],
      isLiability: match[0].includes("is_liability = true"),
    })
  }

  if (accounts.length === 0) {
    throw new Error(`Could not parse the default accounts from: ${line}`)
  }

  return accounts
}

/** The default categories documented in ARCHITECTURE.md. */
export function documentedCategories(): DocumentedCategory[] {
  const text = readArchitecture()
  const categories: DocumentedCategory[] = []

  for (const kind of ["expense", "income"] as const) {
    const label = kind === "expense" ? "Expense categories" : "Income categories"
    const line = lineContaining(text, label)

    for (const item of listOf(line).split(", ")) {
      const tokens = item.trim().split(/\s+/)
      if (tokens.length < 3) {
        throw new Error(`Could not parse the seed category from: "${item}"`)
      }

      const color = tokens[tokens.length - 1].replace(/`/g, "")
      const icon = tokens[tokens.length - 2]
      const name = tokens.slice(0, tokens.length - 2).join(" ")

      if (!/^#[0-9a-f]{6}$/i.test(color)) {
        throw new Error(`Could not parse the colour of the seed category from: "${item}"`)
      }

      categories.push({ name, kind, icon, color })
    }
  }

  if (categories.length === 0) {
    throw new Error("Could not parse the default categories from ARCHITECTURE.md")
  }

  return categories
}
