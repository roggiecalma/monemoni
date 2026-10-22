/**
 * MoneMoni — passcode hashing (bcrypt via bcryptjs, pure JS so it builds on
 * Vercel without native modules).
 *
 * This module is pure and safe to import from client components.
 */

import bcrypt from "bcryptjs"

export const PASSWORD_MIN_LENGTH = 8

/** bcrypt cost factor. */
const BCRYPT_COST = 10

/**
 * Maximum number of **bytes** bcrypt reads from a passcode. Everything past
 * that point is silently dropped, so two passcodes sharing their first 72
 * bytes would hash to the same credential.
 */
const BCRYPT_MAX_BYTES = 72

/** Hashes a passcode with bcrypt (cost 10). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

/** Verifies a passcode against a stored bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Validates passcode strength.
 *
 * Rejects passcodes that are shorter than {@link PASSWORD_MIN_LENGTH} and
 * passcodes that bcrypt would truncate — bcrypt only reads the first 72
 * **bytes**, so a longer passcode would be stored as something shorter than
 * the user typed.
 */
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Passcode must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }
  }

  // The limit is byte-based, not character-based: 40 accented characters are
  // already 80 bytes and would be truncated.
  if (bcrypt.truncates(password)) {
    return {
      ok: false,
      error: `Passcode is too long (${BCRYPT_MAX_BYTES} bytes maximum).`,
    }
  }

  return { ok: true }
}
