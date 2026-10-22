/**
 * MoneMoni — auth form failures.
 *
 * A Server Component cannot read the return value of a Server Action without
 * shipping client JavaScript, so failures travel back to the form through the
 * URL as a short code (`/login?error=invalid-passcode`). This module owns
 * both the codes and their messages, which keeps user-facing copy out of the
 * URL and lets the actions stay free of any client-only plumbing.
 */

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "./password"

export const AUTH_ERROR_CODES = [
  "invalid-input",
  "too-short",
  "too-long",
  "mismatch",
  "invalid-passcode",
  "too-many-attempts",
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
  "too-long": `Passcode is too long (${PASSWORD_MAX_BYTES} bytes maximum).`,
  mismatch: "The passcodes do not match.",
  "invalid-passcode": "That passcode is incorrect.",
  "too-many-attempts": "Too many failed attempts. Please try again later.",
  "already-setup": "A passcode has already been set up. Please sign in.",
  "no-user": "No passcode has been set up yet.",
}

/**
 * Builds the error result for a failure code.
 *
 * The message is looked up as an **own** property of the map: a plain
 * lookup would resolve `constructor` or `__proto__` through the prototype
 * chain and hand back something that is not a message at all.
 */
export function authFailure(code: AuthErrorCode): AuthActionResult {
  const messages = MESSAGES as Record<string, string>

  if (!Object.prototype.hasOwnProperty.call(messages, code)) {
    // Not a code this module knows. Fall back to a code that is always safe
    // to show, so the returned code is always one of AUTH_ERROR_CODES.
    return { error: messages["invalid-input"], code: "invalid-input" }
  }

  return { error: messages[code], code }
}

/**
 * Message for an error code that came in through the URL, or `null` when the
 * code is missing or unknown.
 */
export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null

  // The code arrives in the query string, so it is attacker-controlled.
  // Only the map's own properties may be resolved: a plain lookup would
  // find `constructor`, `__proto__` and the other inherited members and
  // return a non-string, which React refuses to render as a child.
  const messages = MESSAGES as Record<string, string>
  if (!Object.prototype.hasOwnProperty.call(messages, code)) return null

  return messages[code]
}
