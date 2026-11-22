/**
 * Apply Drizzle migrations to Turso database.
 *
 * Usage:
 *   DATABASE_URL="libsql://..." DATABASE_AUTH_TOKEN="..." node scripts/migrate-turso.mjs
 *
 * This script reads the migration SQL files from drizzle/ and applies them
 * to the Turso database specified by DATABASE_URL.
 */

import { createClient } from "@libsql/client"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const rootDir = new URL("..", import.meta.url).pathname

/** Read all migration SQL files in order. */
function readMigrations() {
  const migrationsDir = join(rootDir, "drizzle")
  const files = readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"tag"'))
    .map((line) => JSON.parse(line))
    .map((entry) => entry.value)

  const migrations = []
  for (const tag of files) {
    const file = join(migrationsDir, `${tag}.sql`)
    const sql = readFileSync(file, "utf-8")
    // Split on statement-breakpoint to get individual statements
    const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)
    migrations.push(...statements)
  }

  return migrations
}

/** Connect to Turso and apply migrations. */
async function main() {
  const url = process.env.DATABASE_URL
  const authToken = process.env.DATABASE_AUTH_TOKEN

  if (!url) {
    console.error("Error: DATABASE_URL environment variable is not set.")
    console.error("Usage: DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' node scripts/migrate-turso.mjs")
    process.exit(1)
  }

  console.log(`Connecting to Turso at ${url}...`)

  const client = createClient({ url, authToken })

  try {
    const migrations = readMigrations()
    console.log(`Found ${migrations.length} migration statements.`)

    for (let i = 0; i < migrations.length; i++) {
      const statement = migrations[i]
      console.log(`Applying migration ${i + 1}/${migrations.length}...`)

      try {
        await client.execute(statement)
        console.log(`  ✓ Applied`)
      } catch (error) {
        // Skip "already exists" errors for indexes and tables
        if (error.message.includes("already exists") || error.message.includes("duplicate column")) {
          console.log(`  ⚠ Skipped (already exists): ${error.message.split("\n")[0]}`)
          continue
        }
        throw error
      }
    }

    console.log("\n✓ All migrations applied successfully!")
  } finally {
    client.close()
  }
}

main().catch((error) => {
  console.error("Migration failed:", error)
  process.exit(1)
})
