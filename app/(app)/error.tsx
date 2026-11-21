"use client"
/**
 * Error boundary for the authenticated routes.
 *
 * It lives inside the `(app)` group, so it is rendered inside the app
 * shell: the user keeps the sidebar and navigation and only the screen
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
    <section className="rounded-2xl border border-border bg-surface-raised p-8 text-center shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-expense/10 text-expense">
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
      <h1 className="mt-4 font-display text-xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
        This screen could not be loaded. Nothing was changed — you can try again.
      </p>
      {digest ? <p className="mt-2 text-xs text-ink-subtle">Reference: {digest}</p> : null}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
      >
        Try again
      </button>
    </section>
  )
}
