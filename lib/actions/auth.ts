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
    return authFailure("too-short")
  }

  if (password !== confirmPassword) {
    return authFailure("mismatch")
  }

  const userId = crypto.randomUUID()

  await db.insert(users).values({
    id: userId,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  })

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

  const user = await getCurrentUser()
  if (!user) {
    redirect("/setup")
  }

  const matches = await verifyPassword(parsed.data.password, user.passwordHash)
  if (!matches) {
    return authFailure("invalid-passcode")
  }

  await createSession(user.id)
  redirect("/dashboard")
}

/** Ends the current session and returns to the login screen. */
export async function logout(): Promise<void> {
  await requireSession()
  await destroySession()
  redirect("/login")
}
