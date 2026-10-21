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

const url = process.env.DATABASE_URL ?? "file:./local.db"
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined

export const client = createClient({ url, authToken })

export const db = drizzle(client, { schema })

export type Db = typeof db

/** Convenience accessor in case a caller prefers lazy access. */
export function getDb(): Db {
  return db
}
