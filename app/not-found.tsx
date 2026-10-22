/**
 * 404 page. Plain links — no client JavaScript needed.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold text-brand-600">404</p>
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-ink-muted">
        The page you were looking for does not exist or has moved.
      </p>
      <a
        href="/dashboard"
        className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Back to the dashboard
      </a>
    </main>
  )
}
