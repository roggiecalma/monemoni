import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password"
import {
  createSession,
  destroySession,
  getCurrentUser,
  getSession,
  hasUser,
  hashToken,
  requireSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { sessions, users } from "@/lib/db/schema"

import { insertUser, resetDatabase } from "./setup/db"

/**
 * `next/headers` is a Next.js runtime API: it only works inside a request.
 * The tests replace it with a small in-memory cookie jar that behaves like the
 * documented API (`cookies()` is async, `get` returns `{ name, value }`).
 *
 * The jar has to be created inside `vi.hoisted()` because the mock factory
 * runs before the imports of this file.
 */
const { cookieStore } = vi.hoisted(() => {
  interface StoredCookie {
    name: string
    value: string
    options?: Record<string, unknown>
  }

  const cookies = new Map<string, StoredCookie>()

  return {
    cookieStore: {
      get: (name: string): StoredCookie | undefined => cookies.get(name),
      getAll: (): StoredCookie[] => [...cookies.values()],
      has: (name: string): boolean => cookies.has(name),
      set: (name: string, value: string, options?: Record<string, unknown>): void => {
        cookies.set(name, { name, value, options })
      },
      delete: (name: string): void => {
        cookies.delete(name)
      },
      clear: (): void => {
        cookies.clear()
      },
    },
  }
})

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
}))

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
}))

const USER_ID = "user-1"
const PASSWORD = "correct-horse"

async function createUser(): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD)
  return insertUser(USER_ID, passwordHash)
}

beforeEach(async () => {
  await resetDatabase()
  cookieStore.clear()
})

describe("hashPassword", () => {
  it("produces a different hash every time", async () => {
    const first = await hashPassword(PASSWORD)
    const second = await hashPassword(PASSWORD)

    expect(first).not.toBe(second)
    expect(first).not.toBe(PASSWORD)
  })

  it("uses bcrypt with cost 10", async () => {
    const hash = await hashPassword(PASSWORD)
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
  })
})

describe("verifyPassword", () => {
  it("accepts the correct password", async () => {
    const hash = await hashPassword(PASSWORD)
    await expect(verifyPassword(PASSWORD, hash)).resolves.toBe(true)
  })

  it("rejects a wrong password", async () => {
    const hash = await hashPassword(PASSWORD)
    await expect(verifyPassword("wrong-horse", hash)).resolves.toBe(false)
    await expect(verifyPassword("", hash)).resolves.toBe(false)
    await expect(verifyPassword(`${PASSWORD} `, hash)).resolves.toBe(false)
  })

  it("rejects a password against a hash of a different password", async () => {
    const hash = await hashPassword(PASSWORD)
    const other = await hashPassword("something-else")

    await expect(verifyPassword(PASSWORD, other)).resolves.toBe(false)
    await expect(verifyPassword("something-else", other)).resolves.toBe(true)
  })
})

describe("validatePassword", () => {
  it("rejects short passwords", () => {
    for (const password of ["", "a", "1234567"]) {
      const result = validatePassword(password)
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.error?.length).toBeGreaterThan(0)
    }
  })

  it("accepts valid passwords", () => {
    expect(validatePassword("12345678").ok).toBe(true)
    expect(validatePassword("a-very-long-passcode").ok).toBe(true)
  })

  it("keeps the minimum length rule", () => {
    // Seven characters is one short, and the rule is unchanged.
    expect(validatePassword("a".repeat(7)).ok).toBe(false)
    expect(validatePassword("a".repeat(7)).error).toBe(
      "Passcode must be at least 8 characters.",
    )

    // Exactly eight characters is accepted.
    expect(validatePassword("a".repeat(8)).ok).toBe(true)
    expect(validatePassword("a".repeat(8)).error).toBeUndefined()
  })

  it("accepts a passcode of exactly 72 bytes", () => {
    const passcode = "a".repeat(72)

    expect(Buffer.byteLength(passcode, "utf8")).toBe(72)
    expect(passcode.length).toBe(72)

    const result = validatePassword(passcode)
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("rejects a passcode of 73 bytes", () => {
    const passcode = "a".repeat(73)

    expect(Buffer.byteLength(passcode, "utf8")).toBe(73)

    const result = validatePassword(passcode)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Passcode is too long (72 bytes maximum).")
  })

  it("measures the length in bytes and not in characters", () => {
    // "é" is two bytes in UTF-8: 36 characters are exactly 72 bytes.
    const exactly72Bytes = "é".repeat(36)
    expect(exactly72Bytes.length).toBe(36)
    expect(Buffer.byteLength(exactly72Bytes, "utf8")).toBe(72)
    expect(validatePassword(exactly72Bytes).ok).toBe(true)

    // 40 characters are only 80 bytes — far below 72 *characters*, but above
    // the 72 *bytes* bcrypt reads, so bcrypt would truncate them.
    const eightyBytes = "é".repeat(40)
    expect(eightyBytes.length).toBe(40)
    expect(eightyBytes.length).toBeLessThan(72)
    expect(Buffer.byteLength(eightyBytes, "utf8")).toBe(80)

    const result = validatePassword(eightyBytes)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Passcode is too long (72 bytes maximum).")
  })

  it("protects against the truncation bcrypt really performs", async () => {
    // Two passcodes that share their first 72 bytes hash to the same
    // credential — which is exactly what the 72 byte rule prevents.
    const shared = "a".repeat(72)
    const hash = await hashPassword(`${shared}b`)

    await expect(verifyPassword(shared, hash)).resolves.toBe(true)
    expect(validatePassword(`${shared}b`).ok).toBe(false)
  })
})

describe("createSession", () => {
  it("stores only the sha256 hash of the token, never the raw token", async () => {
    await createUser()
    await createSession(USER_ID)

    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(1)

    const stored = rows[0]
    expect(stored.id).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.id).toBe(
      createHash("sha256").update(cookieStore.get(SESSION_COOKIE)!.value).digest("hex"),
    )
    expect(stored.id).toBe(hashToken(cookieStore.get(SESSION_COOKIE)!.value))

    // The raw token must not appear anywhere in the stored row.
    const rawToken = cookieStore.get(SESSION_COOKIE)!.value
    expect(stored.id).not.toBe(rawToken)
    expect(JSON.stringify(stored)).not.toContain(rawToken)
  })

  it("writes the cookie documented in ARCHITECTURE.md", async () => {
    await createUser()
    await createSession(USER_ID)

    const cookie = cookieStore.get(SESSION_COOKIE)
    expect(cookie).toBeDefined()
    expect(cookie!.value.length).toBeGreaterThan(20)

    const options = cookie!.options
    expect(options?.httpOnly).toBe(true)
    expect(options?.sameSite).toBe("lax")
    expect(options?.path).toBe("/")
    expect(options?.secure).toBe(false) // not production
    expect(options?.maxAge).toBe(Math.floor(SESSION_TTL_MS / 1000))
  })

  it("expires the session 30 days from now", async () => {
    await createUser()
    const before = Date.now()
    await createSession(USER_ID)

    const rows = await db.select().from(sessions)
    expect(rows[0].expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS)
    expect(rows[0].expiresAt).toBeLessThanOrEqual(Date.now() + SESSION_TTL_MS)
    expect(rows[0].userId).toBe(USER_ID)
  })

  it("creates a new token for every session", async () => {
    await createUser()
    await createSession(USER_ID)
    const first = cookieStore.get(SESSION_COOKIE)!.value

    await createSession(USER_ID)
    const second = cookieStore.get(SESSION_COOKIE)!.value

    expect(first).not.toBe(second)
    const rows = await db.select().from(sessions)
    expect(rows).toHaveLength(2)
  })
})

describe("getSession", () => {
  it("returns the session for a valid, unexpired token", async () => {
    await createUser()
    await createSession(USER_ID)

    const session = await getSession()
    expect(session).not.toBeNull()
    expect(session?.userId).toBe(USER_ID)
    expect(session?.id).toBe(hashToken(cookieStore.get(SESSION_COOKIE)!.value))
  })

  it("returns null when there is no cookie", async () => {
    await expect(getSession()).resolves.toBeNull()
  })

  it("returns null for an unknown token", async () => {
    await createUser()
    await createSession(USER_ID)

    cookieStore.set(SESSION_COOKIE, "not-a-real-token")
    await expect(getSession()).resolves.toBeNull()
  })

  it("returns null for an expired token", async () => {
    await createUser()
    const expiredToken = "expired-token"
    await db.insert(sessions).values({
      id: hashToken(expiredToken),
      userId: USER_ID,
      createdAt: Date.now() - SESSION_TTL_MS - 1000,
      expiresAt: Date.now() - 1000,
    })

    cookieStore.set(SESSION_COOKIE, expiredToken)
    await expect(getSession()).resolves.toBeNull()
  })

  it("returns null when the row belongs to another token", async () => {
    await createUser()
    await createSession(USER_ID)

    // A token that hashes to a different (existing) session id.
    const otherToken = "other-token"
    await db.insert(sessions).values({
      id: hashToken(otherToken),
      userId: USER_ID,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    })

    cookieStore.set(SESSION_COOKIE, otherToken)
    const session = await getSession()
    expect(session?.id).toBe(hashToken(otherToken))
  })
})

describe("destroySession", () => {
  it("removes the row and clears the cookie", async () => {
    await createUser()
    await createSession(USER_ID)
    expect(await db.select().from(sessions)).toHaveLength(1)

    await destroySession()

    expect(await db.select().from(sessions)).toHaveLength(0)
    expect(cookieStore.has(SESSION_COOKIE)).toBe(false)
  })

  it("does nothing when there is no cookie", async () => {
    await createUser()
    await createSession(USER_ID)

    cookieStore.delete(SESSION_COOKIE)
    await expect(destroySession()).resolves.toBeUndefined()

    // The row of the session that is no longer reachable is left untouched.
    expect(await db.select().from(sessions)).toHaveLength(1)
  })
})

describe("requireSession", () => {
  it("returns the session when one is valid", async () => {
    await createUser()
    await createSession(USER_ID)

    const session = await requireSession()
    expect(session.userId).toBe(USER_ID)
  })

  it("redirects to /login when there is no session", async () => {
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login")
  })
})

describe("hasUser", () => {
  it("is false on an empty users table", async () => {
    await expect(hasUser()).resolves.toBe(false)
    await expect(getCurrentUser()).resolves.toBeNull()
  })

  it("is true once a user exists", async () => {
    await createUser()

    await expect(hasUser()).resolves.toBe(true)
    const user = await getCurrentUser()
    expect(user?.id).toBe(USER_ID)
  })
})

describe("users table", () => {
  it("never stores the plain password", async () => {
    await createUser()

    const rows = await db.select().from(users)
    expect(rows).toHaveLength(1)
    expect(rows[0].passwordHash).not.toBe(PASSWORD)
    expect(rows[0].passwordHash).toMatch(/^\$2[aby]\$10\$/)
  })
})
