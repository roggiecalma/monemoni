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

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { dangerButtonClass, inputClass, primaryButtonClass } from "@/lib/ui"

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
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/categories"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to categories
      </a>

      <PageHeader
        eyebrow="Categories"
        title="Edit category"
        description={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true">{category.icon}</span>
            {category.name}
          </span>
        }
      />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              defaultValue={category.name}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="kind" label="Kind">
            <select id="kind" name="kind" defaultValue={category.kind} className={inputClass}>
              {CATEGORY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {CATEGORY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field htmlFor="icon" label="Icon" hint="A single emoji, e.g. 🍔">
              <input
                id="icon"
                name="icon"
                type="text"
                required
                maxLength={CATEGORY_ICON_MAX_LENGTH}
                defaultValue={category.icon}
                placeholder="🍔"
                className={inputClass}
              />
            </Field>

            <Field htmlFor="color" label="Colour" hint="Used in lists and charts">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={category.color}
                className="h-[46px] w-full cursor-pointer rounded-xl border border-border bg-surface p-1.5 sm:w-24"
              />
            </Field>
          </div>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="check" className="size-4" />
            Save changes
          </button>
        </FormPanel>
      </form>

      {/*
        The destructive action lives in its own form, below the save button,
        and behind a native <details> so that a second, deliberate step is
        needed before anything is archived. No JavaScript involved.
      */}
      <form action={archiveCategory.bind(null, categoryId)}>
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-expense/10 text-expense">
                <Icon name="archive" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Archive this category</p>
                <p className="text-xs text-ink-muted">
                  Hidden from pickers; past transactions keep its name and colour.
                </p>
              </div>
            </div>
            <Icon name="chevron-right" className="size-4 text-ink-subtle transition group-open:rotate-90" />
          </summary>

          <div className="border-t border-border px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              Archived categories are hidden from the pickers, but past transactions still show
              their name and colour. You can restore this one later from the categories screen.
            </p>
            <button type="submit" className={`${dangerButtonClass} mt-3`}>
              <Icon name="archive" className="size-4" />
              Yes, archive it
            </button>
          </div>
        </details>
      </form>
    </div>
  )
}
