/**
 * MoneMoni — shared validation helpers.
 *
 * A Server Component cannot read the return value of a Server Action without
 * shipping client JavaScript, so a failed submission travels back to the
 * form as a short code in the URL (`/accounts/new?error=name-required`).
 * This module owns the lookup that turns such a code back into a message.
 */

/**
 * Looks up the message for an error code in a code → message map.
 *
 * Returns `null` for an unknown code. The lookup uses an own-property check
 * on purpose: the code arrives from the `?error=` query parameter, so it is
 * attacker-controlled, and a plain property lookup would resolve
 * `"constructor"` or `"__proto__"` through the prototype chain.
 */
export function lookupMessage<T extends Record<string, string>>(
  messages: T,
  code: string | undefined,
): string | null {
  if (!code) return null

  const map = messages as Record<string, string>
  if (!Object.hasOwn(map, code)) return null

  return map[code]
}
