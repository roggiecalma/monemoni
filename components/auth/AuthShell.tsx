import type { ReactNode } from "react"

import { BrandMark, Icon } from "@/components/ui/icons"

/**
 * Shared frame for the two pre-auth screens.
 *
 * Server Component: the decorative panel, the feature list and the form slot
 * are all plain HTML. No client JavaScript is involved.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-[#03291f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -right-32 -top-40 size-[28rem] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -right-12 top-4 size-72 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-40 -left-24 size-96 rounded-full bg-brand-500/20 blur-3xl"
        />

        <a href="/" className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="font-display text-lg font-semibold tracking-tight">MoneMoni</span>
        </a>

        <div className="relative max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">
            Personal finance, simplified
          </p>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Every peso,
            <br />
            in its place.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-brand-100/75">
            A quiet, private workspace for your accounts, spending and savings — built for
            Philippine pesos.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              "One passcode protects the whole install",
              "Balances update straight from your ledger",
              "Installable as an app and works offline",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-brand-50/90">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-brand-300">
                  <Icon name="check" className="size-3" strokeWidth={2.5} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200/55">
          Built for Philippine pesos · No bank connections · Your data stays yours
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-9" />
            <span className="font-display text-base font-semibold tracking-tight">MoneMoni</span>
          </div>

          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-400">
              {eyebrow}
            </p>
            <h2 className="mt-1.5 font-display text-3xl font-semibold tracking-tight">{title}</h2>
            <div className="mt-2 text-sm leading-relaxed text-ink-muted">{description}</div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:p-6">
            {children}
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-ink-subtle">
            <Icon name="lock" className="size-3.5" />
            Protected by a passcode only you know
          </p>
        </div>
      </section>
    </main>
  )
}
