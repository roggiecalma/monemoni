import { BrandMark, Icon } from "@/components/ui/icons"

/**
 * 404 page. Plain links — no client JavaScript needed.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
      <a href="/" className="mb-8 flex items-center gap-3">
        <BrandMark className="size-10" />
        <span className="font-display text-lg font-semibold tracking-tight">MoneMoni</span>
      </a>

      <div className="w-full max-w-md rounded-3xl border border-border bg-surface-raised p-8 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          <Icon name="alert" className="size-5" />
        </span>
        <p className="mt-4 font-display text-5xl font-semibold tracking-tight text-brand-700 dark:text-brand-400">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-ink-muted">
          The page you were looking for does not exist or has moved.
        </p>
        <a
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          <Icon name="arrow-left" className="size-4" />
          Back to the dashboard
        </a>
      </div>
    </main>
  )
}
