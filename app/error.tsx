"use client"
/**
 * Error boundary for everything below the root layout — `/login`, `/setup`
 * and the other top level screens.
 *
 * Error boundaries must be Client Components, so this file is the one
 * exception to the "no client JavaScript" rule of this app. It ships as
 * little as possible: a calm message and a button.
 */

import { useEffect } from "react"

export default function AppError({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="mx-auto max-w-sm text-sm text-ink-muted">
        MoneMoni could not load this page. Nothing was changed — you can try again.
      </p>
      {digest ? <p className="text-xs text-ink-muted">Reference: {digest}</p> : null}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Try again
      </button>
    </main>
  )
}
