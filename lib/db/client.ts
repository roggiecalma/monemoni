/**
 * MoneMoni — libSQL (Turso) client + Drizzle instance.
 *
 * SERVER ONLY. This module reads `process.env` and opens a database
 * connection, so it must never be imported from a Client Component or any
 * other client-bundled module. Import it from Server Components, Server
 * Actions and Route Handlers only.
 *
 * The same code path works locally (`file:./local.db`) and in production
 * (`libsql://<db>.turso.io` + `DATABASE_AUTH_TOKEN`).
 */

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"

import * as schema from "./schema"

if (typeof window !== "undefined") {
  throw new Error("lib/db/client.ts is server-only and must not be imported in the browser.")
}

/**
 * Resolves the database URL, refusing to fall back to a local file in
 * production.
 *
 * A missing (or mistyped) `DATABASE_URL` must not silently point the app at
 * a throwaway local SQLite file: the app would look like it had lost all of
 * the user's data, and the seed would happily write defaults into it.
 */
function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL
  const isProduction = process.env.NODE_ENV === "production"

  // `next build` runs with NODE_ENV=production but has no database to talk
  // to — it only imports this module to collect page data. Next sets
  // NEXT_PHASE to "phase-production-build" for the duration of the build, so
  // the guard is skipped there and a local build keeps working.
  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build"

  if (isProduction && !isProductionBuild) {
    if (!configured) {
      throw new Error(
        "DATABASE_URL is not set. Production requires a hosted libSQL/Turso URL (e.g. libsql://<db>.turso.io).",
      )
    }

    if (configured.startsWith("file:")) {
      throw new Error(
        `DATABASE_URL points at a local SQLite file ("${configured}"). A local file cannot be used in production — set DATABASE_URL to the hosted libSQL/Turso URL.`,
      )
    }
  }

  return configured ?? "file:./local.db"
}

const url = resolveDatabaseUrl()
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined

export const client = createClient({ url, authToken })

export const db = drizzle(client, { schema })

export type Db = typeof db

/** Convenience accessor in case a caller prefers lazy access. */
export function getDb(): Db {
  return db
}
