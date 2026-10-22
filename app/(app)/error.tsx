"use client"
/**
 * Error boundary for the authenticated routes.
 *
 * It lives inside the `(app)` group, so it is rendered inside the app
 * shell: the user keeps the header and the navigation and only the screen
 * itself is replaced by the fallback.
 *
 * Error boundaries must be Client Components, so this file is the one
 * exception to the "no client JavaScript" rule of this app.
 */

import { useEffect } from "react"

export default function AppSectionError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  useEffect(() => {
    // Log the error so it shows up in the browser console and in the server
    // logs. The `digest` correlates the two.
    console.error(error)
  }, [error])

  // The forwarded error may be anything at all, so it is narrowed before
  // any property is read. The message itself is never shown to the user: in
  // production it is a generic string, and in development it can hold
  // database internals.
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : null

  return (
    <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
      <h1 className="text-base font-semibold">Something went wrong</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
        This screen could not be loaded. Nothing was changed — you can try again.
      </p>
      {digest ? <p className="mt-2 text-xs text-ink-muted">Reference: {digest}</p> : null}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Try again
      </button>
    </section>
  )
}
