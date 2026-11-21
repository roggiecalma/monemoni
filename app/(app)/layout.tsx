import { logout } from "@/lib/actions/auth"
import { requireSession } from "@/lib/auth/session"
import { ensureSeedData } from "@/lib/db/seed"
import { NAV_ITEMS } from "@/lib/nav"

import { BrandMark, Icon } from "@/components/ui/icons"

/**
 * The authenticated app shell.
 *
 * Server Component: the sidebar, the header, the navigation and the sign-out
 * button are plain HTML, so the shell ships no client JavaScript.
 *
 * Desktop gets a fixed left rail; phones get a compact top bar and a
 * horizontally scrollable set of navigation pills.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Unauthenticated visitors are sent to the login screen.
  await requireSession()

  // Seed the default accounts and categories on first use.
  await ensureSeedData()

  return (
    <div className="min-h-screen bg-surface-muted lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface-raised/80 px-4 py-6 backdrop-blur lg:flex">
        <a href="/dashboard" className="flex items-center gap-3 px-2">
          <BrandMark className="size-10" />
          <span className="font-display text-lg font-semibold tracking-tight">MoneMoni</span>
        </a>

        <p className="mb-2 mt-9 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
          Workspace
        </p>
        <nav aria-label="Main">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-brand-900/30 dark:hover:text-brand-200"
                >
                  <span className="grid size-8 place-items-center rounded-lg border border-border bg-surface text-ink-muted transition group-hover:border-brand-200 group-hover:bg-surface-raised group-hover:text-brand-700 dark:group-hover:border-brand-800 dark:group-hover:text-brand-300">
                    <Icon name={item.icon} className="size-4" />
                  </span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 to-brand-900 p-4 text-white">
            <div
              aria-hidden="true"
              className="absolute -right-6 -top-8 size-24 rounded-full border border-white/10"
            />
            <Icon name="shield" className="size-5 text-brand-300" />
            <p className="mt-3 text-sm font-semibold">Private by design</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-100/75">
              One passcode. One person. No bank connections.
            </p>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            >
              <Icon name="logout" className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 border-b border-border bg-surface-raised/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <a href="/dashboard" className="flex items-center gap-2.5">
              <BrandMark className="size-8 rounded-lg" />
              <span className="font-display text-base font-semibold tracking-tight">MoneMoni</span>
            </a>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Sign out"
                className="grid size-9 place-items-center rounded-xl border border-border bg-surface text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              >
                <Icon name="logout" className="size-4" />
              </button>
            </form>
          </div>

          <nav aria-label="Main" className="px-3 pb-2.5">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => (
                <li key={item.href} className="shrink-0">
                  <a
                    href={item.href}
                    className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                  >
                    <Icon name={item.icon} className="size-4" />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
