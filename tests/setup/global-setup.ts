/**
 * Vitest global setup.
 *
 * Recreates the throwaway test database (`.tmp/test.db`) from scratch on
 * every test run and applies the Drizzle migrations to it, so every run
 * starts from a clean, fully migrated database.
 *
 * The development database (`local.db`) is never touched: the URL is
 * hard-coded to the `.tmp` folder and the `DATABASE_URL` of the current
 * process is overwritten with it.
 */

import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

/** Repository root — this file lives in `<root>/tests/setup/`. */
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

const tmpDir = path.join(repoRoot, ".tmp")
const dbPath = path.join(tmpDir, "test.db")
const dbUrl = `file:${dbPath}`

export async function setup(): Promise<void> {
  mkdirSync(tmpDir, { recursive: true })

  // Remove the database and its WAL/SHM side files.
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true })
  }

  // Make sure nothing in this process (or in a worker forked from it) can
  // fall back to the development database.
  process.env.DATABASE_URL = dbUrl
  process.env.DATABASE_AUTH_TOKEN = ""

  const client = createClient({ url: dbUrl })
  try {
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: path.join(repoRoot, "drizzle") })
  } finally {
    client.close()
  }
}

export async function teardown(): Promise<void> {
  // The database file is kept around on purpose: it makes it easy to inspect
  // the state a test run left behind. It is recreated on the next run.
}
