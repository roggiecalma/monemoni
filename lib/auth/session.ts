/**
 * MoneMoni — single-user session handling.
 *
 * A session token is 32 random bytes encoded as base64url. Only the sha256
 * hex digest of the token is stored in the `sessions` table; the raw token
 * lives in the `mm_session` cookie.
 *
 * SERVER ONLY — uses `next/headers` and `next/navigation`.
 */

import { createHash, randomBytes } from "node:crypto"

import { and, eq, gt, lt } from "drizzle-orm"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { db } from "@/lib/db/client"
import { sessions, users, type Session, type User } from "@/lib/db/schema"

export const SESSION_COOKIE = "mm_session"
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type { Session, User }

/** sha256 hex digest of a raw session token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Creates a session for `userId` and sets the `mm_session` cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url")
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS

  // Drop any expired rows so the table does not grow forever.
  await db.delete(sessions).where(lt(sessions.expiresAt, now))

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    createdAt: now,
    expiresAt,
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

/** Returns the current session, or `null` when there is no valid one. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const id = hashToken(token)
  const now = Date.now()

  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1)

  const session = rows[0]
  return session ?? null
}

/** Deletes the current session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  }

  cookieStore.delete(SESSION_COOKIE)
}

/** Returns the single user of this installation, or `null` when setup is pending. */
export async function getCurrentUser(): Promise<User | null> {
  const rows = await db.select().from(users).limit(1)
  return rows[0] ?? null
}

/**
 * Returns the current session or redirects to `/login`.
 * Every Server Action must call this before touching data.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  return session
}

/** Has a passcode already been set up? */
export async function hasUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  return rows.length > 0
}
