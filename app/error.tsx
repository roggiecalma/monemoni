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
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface-raised p-8 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-expense/10 text-expense">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5"
          >
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
          MoneMoni could not load this page. Nothing was changed — you can try again.
        </p>
        {digest ? <p className="mt-2 text-xs text-ink-subtle">Reference: {digest}</p> : null}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
