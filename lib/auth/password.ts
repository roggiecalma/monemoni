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

/** Hashes a passcode with bcrypt (cost 10). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

/** Verifies a passcode against a stored bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Validates passcode strength. */
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Passcode must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }
  }

  return { ok: true }
}
