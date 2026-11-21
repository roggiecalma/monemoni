import type { ReactNode } from "react"

import { Icon, type IconName } from "./icons"

/**
 * Small layout primitives shared by the app screens.
 *
 * These are Server Components: they only render markup, so using them never
 * pulls a client bundle into a page.
 */

/** The title block at the top of a screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-400">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** A labelled form control with optional helper copy. */
export function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor: string
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-ink-muted">{hint}</p> : null}
    </div>
  )
}

/** A form-level error, announced to assistive technology. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-expense/25 bg-expense/10 px-3.5 py-3 text-sm font-medium text-expense"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

/** The panel that wraps a form's fields. */
export function FormPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02] sm:p-6">
      <div className="space-y-5">{children}</div>
    </div>
  )
}

/** A quiet inline notice used inside forms and panels. */
export function InlineNote({
  icon = "shield",
  children,
}: {
  icon?: IconName
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />
      <div>{children}</div>
    </div>
  )
}
