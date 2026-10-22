/**
 * MoneMoni — login throttling.
 *
 * The login action accepts a passcode attempt over and over again. bcrypt
 * (cost 10) slows an online attack down, but it does not stop it: a weak
 * passcode is still brute-forceable. The throttle locks the login screen
 * for a while after repeated failures.
 *
 * The state lives in the `settings` table — one row, one JSON string — so
 * it is **durable**: an in-memory counter would be reset by every deploy
 * and would not be shared by the serverless instances of a hosted
 * deployment.
 *
 * Policy:
 * - failures 1 to 3 are answered with a plain "wrong passcode";
 * - from failure 4 on the login is locked for `min(2^(failures - 3), 30)`
 *   minutes — 2, 4, 8, 16 and then 30 minutes;
 * - a successful login clears the counter;
 * - the lock expires on its own: the window is checked against the clock.
 *
 * SERVER ONLY (imports `lib/db/client`).
 */

import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { settings } from "@/lib/db/schema"

/** Settings key that holds the throttle state. */
const THROTTLE_KEY = "auth:login"

/** Failures that are answered with "wrong passcode" before a lock starts. */
const FREE_FAILURES = 3

/** Longest lock, in minutes. */
const MAX_LOCK_MINUTES = 30

/** Milliseconds in a minute. */
const MINUTE_MS = 60_000

/** The persisted throttle state. */
export interface LoginThrottleState {
  /** Failed attempts since the last successful login. */
  failures: number
  /** Epoch milliseconds until which the login is locked (0 = not locked). */
  lockedUntil: number
}

/** Thrown while a lockout is in effect. */
export class LoginLockedError extends Error {
  /** Epoch milliseconds at which the lock expires. */
  readonly lockedUntil: number

  constructor(lockedUntil: number) {
    super("Too many failed login attempts.")
    this.name = "LoginLockedError"
    this.lockedUntil = lockedUntil
  }
}

/**
 * Serialises the read-modify-write of the throttle state inside this
 * process.
 *
 * Two failures that arrive at the same time would otherwise both read the
 * same counter and both write it back, losing one of the two failures. The
 * chain never rejects, so a failed call cannot poison the queue for the
 * calls that come after it.
 */
let throttleQueue: Promise<unknown> = Promise.resolve()

/**
 * Throws a {@link LoginLockedError} while a lockout is in effect.
 *
 * The check belongs *before* the passcode is verified: a locked out install
 * must not spend any bcrypt time on the attempt.
 */
export async function assertLoginAllowed(): Promise<void> {
  const state = await readState()
  if (state.lockedUntil > Date.now()) {
    throw new LoginLockedError(state.lockedUntil)
  }
}

/**
 * Records a failed login attempt and extends the lockout.
 *
 * The counter is incremented and the new lockout window is stored in one
 * go, so the state is never half written.
 */
export async function recordLoginFailure(): Promise<void> {
  const result = throttleQueue.then(() => addFailure())

  // The queue itself must stay usable after a failure: the error belongs to
  // the caller of the failing call, not to the callers that come next.
  throttleQueue = result.catch(() => undefined)

  await result
}

/** Clears the counter after a successful login. */
export async function recordLoginSuccess(): Promise<void> {
  const result = throttleQueue.then(() => writeState({ failures: 0, lockedUntil: 0 }))
  throttleQueue = result.catch(() => undefined)
  await result
}

/** Increments the counter and stores the new lockout window. */
async function addFailure(): Promise<void> {
  const state = await readState()
  const failures = state.failures + 1
  const minutes = lockMinutes(failures)

  await writeState({
    failures,
    lockedUntil: minutes > 0 ? Date.now() + minutes * MINUTE_MS : 0,
  })
}

/** Lock length for a number of failures, in minutes (0 = no lock). */
function lockMinutes(failures: number): number {
  if (failures <= FREE_FAILURES) return 0
  return Math.min(2 ** (failures - FREE_FAILURES), MAX_LOCK_MINUTES)
}

/** Reads the throttle state; a missing or broken row means "no failures". */
async function readState(): Promise<LoginThrottleState> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, THROTTLE_KEY))
    .limit(1)

  const raw = rows[0]?.value
  if (!raw) return { failures: 0, lockedUntil: 0 }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { failures: 0, lockedUntil: 0 }
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { failures: 0, lockedUntil: 0 }
  }

  const record = parsed as Record<string, unknown>
  return {
    failures: toCount(record.failures),
    lockedUntil: toCount(record.lockedUntil),
  }
}

/** Writes the throttle state back to the settings table. */
async function writeState(state: LoginThrottleState): Promise<void> {
  const value = JSON.stringify(state)
  await db
    .insert(settings)
    .values({ key: THROTTLE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** Reads a non-negative integer out of the stored JSON. */
function toCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}
