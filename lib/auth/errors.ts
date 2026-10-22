/**
 * MoneMoni — auth form failures.
 *
 * A Server Component cannot read the return value of a Server Action without
 * shipping client JavaScript, so failures travel back to the form through the
 * URL as a short code (`/login?error=invalid-passcode`). This module owns
 * both the codes and their messages, which keeps user-facing copy out of the
 * URL and lets the actions stay free of any client-only plumbing.
 */

import { PASSWORD_MIN_LENGTH } from "./password"

export const AUTH_ERROR_CODES = [
  "invalid-input",
  "too-short",
  "mismatch",
  "invalid-passcode",
  "already-setup",
  "no-user",
] as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/** Result of an auth Server Action. */
export interface AuthActionResult {
  /** Human readable description of what went wrong. */
  error: string
  /** Stable code — this is what travels through the URL. */
  code: AuthErrorCode
}

const MESSAGES: Record<AuthErrorCode, string> = {
  "invalid-input": "Please enter your passcode.",
  "too-short": `Passcode must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  mismatch: "The passcodes do not match.",
  "invalid-passcode": "That passcode is incorrect.",
  "already-setup": "A passcode has already been set up. Please sign in.",
  "no-user": "No passcode has been set up yet.",
}

/** Builds the error result for a failure code. */
export function authFailure(code: AuthErrorCode): AuthActionResult {
  return { error: MESSAGES[code], code }
}

/**
 * Message for an error code that came in through the URL, or `null` when the
 * code is missing or unknown.
 */
export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null
  const messages = MESSAGES as Record<string, string>
  return messages[code] ?? null
}
