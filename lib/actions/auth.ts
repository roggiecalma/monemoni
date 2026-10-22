"use server"
/**
 * MoneMoni — authentication Server Actions.
 *
 * Single user, single passcode: the app is either in *setup mode* (no row in
 * `users` yet) or it has a passcode that can be used to sign in.
 *
 * Failures are never thrown at the caller: the actions return an error
 * result (`{ error, code }`) instead. The pages turn that result into a
 * redirect carrying the code, which lets them render the message inline while
 * staying pure Server Components — no client JavaScript required.
 */

import { redirect } from "next/navigation"
import { z } from "zod"

import { authFailure, type AuthActionResult } from "@/lib/auth/errors"
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password"
import { createSession, destroySession, getCurrentUser, hasUser, requireSession } from "@/lib/auth/session"
import {
  assertLoginAllowed,
  LoginLockedError,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/throttle"
import { db } from "@/lib/db/client"
import { users } from "@/lib/db/schema"

const setupSchema = z.object({
  password: z.string().min(1, "Passcode is required."),
  confirmPassword: z.string().min(1, "Please confirm the passcode."),
})

const loginSchema = z.object({
  password: z.string().min(1, "Passcode is required."),
})

/**
 * Creates the passcode of the single user of this installation.
 *
 * Only succeeds while no user exists — afterwards the app is in login mode
 * and the passcode can no longer be created here.
 *
 * Returns an error result when the form data is invalid; the caller decides
 * how to show it. On success the user is signed in and redirected to the
 * dashboard, so this function does not return in that case.
 */
export async function setupPasscode(formData: FormData): Promise<AuthActionResult> {
  // Setup mode only: a passcode can be created while there is no user.
  if (await hasUser()) {
    redirect("/login")
  }

  const parsed = setupSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!parsed.success) {
    return authFailure("invalid-input")
  }

  const { password, confirmPassword } = parsed.data

  const strength = validatePassword(password)
  if (!strength.ok) {
    // The validation knows *why* the passcode was rejected: a passcode that
    // is too long must not be reported as one that is too short.
    return authFailure(strength.code)
  }

  if (password !== confirmPassword) {
    return authFailure("mismatch")
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)

  // The existence check is repeated inside the write transaction: two
  // submissions that race each other would both see "no user" and both
  // insert a row, leaving two users behind — and `getCurrentUser()` would
  // then pick one of them at random. The second insert is refused here.
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.select({ id: users.id }).from(users).limit(1)
    if (existing.length > 0) return "already-setup" as const

    await tx.insert(users).values({ id: userId, passwordHash, createdAt: Date.now() })
    return "created" as const
  })

  if (outcome === "already-setup") {
    redirect("/login")
  }

  // A brand new passcode starts with a clean login throttle.
  await recordLoginSuccess()

  await createSession(userId)
  redirect("/dashboard")
}

/**
 * Signs the user in with their passcode.
 *
 * Returns an error result when the passcode is wrong; the caller decides how
 * to show it. On success a session is created and the user is redirected to
 * the dashboard, so this function does not return in that case.
 */
export async function login(formData: FormData): Promise<AuthActionResult> {
  // There is nothing to sign in to until the passcode has been created.
  if (!(await hasUser())) {
    redirect("/setup")
  }

  const parsed = loginSchema.safeParse({ password: formData.get("password") })

  if (!parsed.success) {
    return authFailure("invalid-input")
  }

  // The lockout is checked *before* the passcode is verified: a locked out
  // install must not spend any bcrypt time on the attempt.
  try {
    await assertLoginAllowed()
  } catch (error) {
    if (error instanceof LoginLockedError) {
      return authFailure("too-many-attempts")
    }
    throw error
  }

  const user = await getCurrentUser()
  if (!user) {
    redirect("/setup")
  }

  const matches = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!matches) {
    // One more failure — the lockout grows with every one of them.
    await recordLoginFailure()
    return authFailure("invalid-passcode")
  }

  // A successful login clears the throttle.
  await recordLoginSuccess()

  await createSession(user.id)
  redirect("/dashboard")
}

/** Ends the current session and returns to the login screen. */
export async function logout(): Promise<void> {
  await requireSession()
  await destroySession()
  redirect("/login")
}
