/**
 * Shared class strings for the small set of repeated UI primitives.
 *
 * They live in one module so every screen uses the same radius, spacing and
 * focus treatment. Tailwind scans these strings like any other source file,
 * so the utilities are emitted normally.
 */

/** A raised content surface. */
export const panelClass =
  "rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]"

/** A quieter surface used inside a panel. */
export const insetClass = "rounded-xl border border-border bg-surface-muted"

/** Standard form control. */
export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink-subtle hover:border-border-strong focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"

/** The label above a form control. */
export const labelClass = "block text-sm font-medium text-ink"

/** Helper copy below a control. */
export const hintClass = "text-xs leading-relaxed text-ink-muted"

/** Primary action. */
export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800 active:translate-y-px disabled:pointer-events-none disabled:opacity-60"

/** Secondary action. */
export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-border-strong hover:bg-surface-muted active:translate-y-px"

/** Small, quiet action used inside lists. */
export const ghostButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-border hover:bg-surface-muted hover:text-ink"

/** Destructive outline action. */
export const dangerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-expense/40 bg-expense/5 px-4 py-2.5 text-sm font-semibold text-expense transition hover:bg-expense/10"

/** Uppercase section kicker. */
export const eyebrowClass =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle"
