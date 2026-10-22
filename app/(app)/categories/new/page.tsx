import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createCategory } from "@/lib/actions/categories"
import { CATEGORY_KINDS } from "@/lib/db/schema"
import {
  CATEGORY_ERROR_MESSAGES,
  CATEGORY_ICON_MAX_LENGTH,
  CATEGORY_KIND_LABELS,
  CATEGORY_NAME_MAX_LENGTH,
} from "@/lib/validation/categories"
import { lookupMessage } from "@/lib/validation/errors"

/**
 * New category screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await createCategory(formData)
    if (result) {
      redirect(`/categories/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(CATEGORY_ERROR_MESSAGES, error)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New category</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          A category groups your income or your spending.
        </p>
      </div>

      <form
        action={submit}
        className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            autoFocus
            placeholder="Food & Dining"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="kind" className="block text-sm font-medium">
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue="expense"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          >
            {CATEGORY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CATEGORY_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="icon" className="block text-sm font-medium">
            Icon
          </label>
          <input
            id="icon"
            name="icon"
            type="text"
            required
            maxLength={CATEGORY_ICON_MAX_LENGTH}
            placeholder="🍔"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
          />
          <p className="text-xs text-ink-muted">A single emoji, e.g. 🍔</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="color" className="block text-sm font-medium">
            Colour
          </label>
          <input
            id="color"
            name="color"
            type="color"
            defaultValue="#f97316"
            className="h-10 w-20 cursor-pointer rounded border border-border bg-surface p-1"
          />
        </div>

        {message ? (
          <p
            role="alert"
            className="rounded-lg bg-expense/10 px-3 py-2 text-sm font-medium text-expense"
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Create category
        </button>
      </form>
    </div>
  )
}
