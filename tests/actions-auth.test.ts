/**
 * MoneMoni — the authentication Server Actions (`lib/actions/auth.ts`).
 *
 * The actions need a request scope, because `lib/auth/session.ts` reads and
 * writes the session cookie through `cookies()` from `next/headers`. The
 * tests therefore replace `next/headers` with a small in-memory cookie jar
 * that implements the documented API (`cookies()` is async, `get` returns
 * `{ name, value }`, `set` takes `{ httpOnly, sameSite, path, secure, maxAge }`).
 *
 * That is the *only* thing that is mocked: the cookie jar is a stand-in for
 * the request scope, not for the logic under test. Everything that is being
 * verified — the Zod parsing, the passcode rules, the bcrypt hash, the
 * session row, the sha256 of the raw token, the redirect target — is the
 * real implementation running against the real (test) database.
 *
 * `next/navigation`'s `redirect()` is replaced by a function that throws a
 * marked error, because the real one throws as well: a successful action
 * never returns, it redirects.
 */

import { createHash } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { login, logout, setupPasscode } from "@/lib/actions/auth"
import { hashPassword } from "@/lib/auth/password"
import { hashToken, SESSION_COOKIE } from "@/lib/auth/session"
import { db } from "@/lib/db/client"
import { sessions, users } from "@/lib/db/schema"

import { insertUser, resetDatabase } from "./setup/db"

/**
 * The cookie jar has to be created inside `vi.hoisted()` because the mock
 * factory runs before the imports of this file.
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

const PASSCODE = "correct-horse"
const OTHER_PASSCODE = "a-different-passcode"

/** Builds the form data the actions expect. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    data.append(key, value)
  }
  return data
}

async function createUser(passcode = PASSCODE): Promise<string> {
  return insertUser("user-1", await hashPassword(passcode))
}

beforeEach(async () => {
  await resetDatabase()
  cookieStore.clear()
})

describe("setupPasscode", () => {
  it("rejects a missing passcode", async () => {
    const result = await setupPasscode(formData({}))

    expect(result.code).toBe("invalid-input")
    expect(result.error).toBe("Please enter your passcode.")
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it("rejects a passcode that is too short", async () => {
    const result = await setupPasscode(
      formData({ password: "short", confirmPassword: "short" }),
    )

    expect(result.code).toBe("too-short")
    expect(result.error).toBe("Passcode must be at least 8 characters.")
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it("rejects a confirmation that does not match", async () => {
    const result = await setupPasscode(
      formData({ password: PASSCODE, confirmPassword: OTHER_PASSCODE }),
    )

    expect(result.code).toBe("mismatch")
    expect(result.error).toBe("The passcodes do not match.")
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it("creates the user, signs in and redirects to the dashboard", async () => {
    await expect(
      setupPasscode(formData({ password: PASSCODE, confirmPassword: PASSCODE })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")

    const userRows = await db.select().from(users)
    expect(userRows).toHaveLength(1)
    expect(userRows[0].passwordHash).toMatch(/^\$2[aby]\$10\$/)

    const sessionRows = await db.select().from(sessions)
    expect(sessionRows).toHaveLength(1)
    expect(sessionRows[0].userId).toBe(userRows[0].id)

    // The cookie holds the raw token, the table only its sha256.
    const cookie = cookieStore.get(SESSION_COOKIE)
    expect(cookie).toBeDefined()
    expect(sessionRows[0].id).toBe(createHash("sha256").update(cookie!.value).digest("hex"))
    expect(sessionRows[0].id).toBe(hashToken(cookie!.value))
  })

  it("never stores the plain passcode", async () => {
    await expect(
      setupPasscode(formData({ password: PASSCODE, confirmPassword: PASSCODE })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")

    const userRows = await db.select().from(users)
    expect(userRows[0].passwordHash).not.toBe(PASSCODE)
    expect(JSON.stringify(userRows)).not.toContain(PASSCODE)
  })

  it("refuses to set up a second passcode", async () => {
    await createUser()

    await expect(
      setupPasscode(formData({ password: PASSCODE, confirmPassword: PASSCODE })),
    ).rejects.toThrow("NEXT_REDIRECT:/login")

    expect(await db.select().from(users)).toHaveLength(1)
    expect(await db.select().from(sessions)).toHaveLength(0)
  })
})

describe("login", () => {
  it("redirects to the setup page while no passcode exists", async () => {
    await expect(login(formData({ password: PASSCODE }))).rejects.toThrow(
      "NEXT_REDIRECT:/setup",
    )

    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  it("rejects a missing passcode", async () => {
    await createUser()

    const result = await login(formData({}))

    expect(result.code).toBe("invalid-input")
    expect(result.error).toBe("Please enter your passcode.")
    expect(await db.select().from(sessions)).toHaveLength(0)
  })

  it("rejects a wrong passcode", async () => {
    await createUser()

    const result = await login(formData({ password: OTHER_PASSCODE }))

    expect(result.code).toBe("invalid-passcode")
    expect(result.error).toBe("That passcode is incorrect.")
    expect(await db.select().from(sessions)).toHaveLength(0)
    expect(cookieStore.has(SESSION_COOKIE)).toBe(false)
  })

  it("signs the user in and redirects to the dashboard", async () => {
    await createUser()

    await expect(login(formData({ password: PASSCODE }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    )

    const sessionRows = await db.select().from(sessions)
    expect(sessionRows).toHaveLength(1)
    expect(sessionRows[0].userId).toBe("user-1")

    const cookie = cookieStore.get(SESSION_COOKIE)
    expect(cookie).toBeDefined()
    expect(sessionRows[0].id).toBe(hashToken(cookie!.value))
  })
})

describe("logout", () => {
  it("ends the session and redirects to the login page", async () => {
    await createUser()

    // Sign in first so that there is a session to end.
    await expect(login(formData({ password: PASSCODE }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    )
    expect(await db.select().from(sessions)).toHaveLength(1)

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login")

    expect(await db.select().from(sessions)).toHaveLength(0)
    expect(cookieStore.has(SESSION_COOKIE)).toBe(false)
  })

  it("redirects to the login page when there is no session", async () => {
    await createUser()

    await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login")

    expect(await db.select().from(sessions)).toHaveLength(0)
  })
})
