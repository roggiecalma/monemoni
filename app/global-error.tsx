"use client"
/**
 * Last resort error boundary: it catches an error in the **root layout**
 * itself (a database that cannot be reached, for example), which no other
 * boundary can catch.
 *
 * It replaces the root layout, so it renders its own `<html>` and `<body>`
 * and it does **not** get the global stylesheet — that is why the styles
 * below are inline instead of Tailwind classes.
 */

import { useEffect } from "react"

export default function GlobalError({
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
    <html lang="en" style={{ colorScheme: "light dark" }}>
      <title>MoneMoni</title>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          background: "Canvas",
          color: "CanvasText",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "24rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", opacity: 0.75 }}>
            MoneMoni could not start. Your data is safe — try again in a moment.
          </p>
          {digest ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", opacity: 0.6 }}>
              Reference: {digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: "0.5rem",
              background: "#2563eb",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
