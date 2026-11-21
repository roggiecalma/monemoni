/**
 * Lightweight loading state for the authenticated routes.
 * Pure CSS — no client JavaScript.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded-full bg-surface-sunken" />
        <div className="h-9 w-72 max-w-full animate-pulse rounded-xl bg-surface-sunken" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-full bg-surface-sunken" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-64 animate-pulse rounded-3xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-raised" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-2xl border border-border bg-surface-raised"
          />
        ))}
      </div>

      <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-raised" />
    </div>
  )
}
