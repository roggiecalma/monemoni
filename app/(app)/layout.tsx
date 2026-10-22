import { logout } from "@/lib/actions/auth"
import { requireSession } from "@/lib/auth/session"
import { ensureSeedData } from "@/lib/db/seed"
import { NAV_ITEMS } from "@/lib/nav"

/**
 * The authenticated app shell.
 *
 * Server Component: the header, the navigation and the sign-out button are
 * plain HTML, so the shell ships no client JavaScript.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Unauthenticated visitors are sent to the login screen.
  await requireSession()

  // Seed the default accounts and categories on first use.
  await ensureSeedData()

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <a href="/dashboard" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              M
            </span>
            <span className="text-base font-semibold tracking-tight">MoneMoni</span>
          </a>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>

        <nav aria-label="Main" className="mx-auto max-w-3xl px-4">
          {/* Horizontally scrollable on phones, a plain row on larger screens. */}
          <ul className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none] sm:overflow-visible">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="inline-block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  )
}
