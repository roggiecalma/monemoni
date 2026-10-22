import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { archiveCategory, updateCategory } from "@/lib/actions/categories"
import { getCategoryById } from "@/lib/db/queries"
import { CATEGORY_KINDS } from "@/lib/db/schema"
import {
  CATEGORY_ERROR_MESSAGES,
  CATEGORY_ICON_MAX_LENGTH,
  CATEGORY_KIND_LABELS,
  CATEGORY_NAME_MAX_LENGTH,
} from "@/lib/validation/categories"
import { lookupMessage } from "@/lib/validation/errors"

/**
 * Edit category screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  const { id } = await params
  const category = await getCategoryById(id)

  if (!category) {
    notFound()
  }

  // The id of the category comes from the URL, so the action can be bound
  // to it instead of taking it from the form data.
  const categoryId = category.id

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateCategory.bind(null, categoryId)(formData)
    if (result) {
      redirect(`/categories/${categoryId}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(CATEGORY_ERROR_MESSAGES, error)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Edit category</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {category.icon} {category.name}
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
            defaultValue={category.name}
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
            defaultValue={category.kind}
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
            defaultValue={category.icon}
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
            defaultValue={category.color}
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
          Save changes
        </button>
      </form>

      {/*
        The destructive action lives in its own form, below the save button,
        and behind a native <details> so that a second, deliberate step is
        needed before anything is archived. No JavaScript involved.
      */}
      <form action={archiveCategory.bind(null, categoryId)}>
        <details className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-expense">
            Archive this category
          </summary>
          <p className="mt-2 text-sm text-ink-muted">
            Archived categories are hidden from the pickers, but past transactions still show
            their name and colour. You can restore this one later.
          </p>
          <button
            type="submit"
            className="mt-3 rounded-lg border border-expense px-3 py-1.5 text-sm font-semibold text-expense transition-colors hover:bg-expense/10"
          >
            Yes, archive it
          </button>
        </details>
      </form>
    </div>
  )
}
