/**
 * Lightweight loading state for the authenticated routes.
 * Pure CSS — no client JavaScript.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
        <div className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
      </div>
      <div className="h-56 animate-pulse rounded-xl border border-border bg-surface" />
    </div>
  )
}
