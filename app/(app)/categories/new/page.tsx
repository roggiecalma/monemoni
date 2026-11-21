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

import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field, FormPanel, PageHeader } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

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
        title="New category"
        description="A category groups your income or your spending."
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
              autoFocus
              placeholder="Food & Dining"
              className={inputClass}
            />
          </Field>

          <Field htmlFor="kind" label="Kind">
            <select id="kind" name="kind" defaultValue="expense" className={inputClass}>
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
                placeholder="🍔"
                className={inputClass}
              />
            </Field>

            <Field htmlFor="color" label="Colour" hint="Used in lists and charts">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue="#f97316"
                className="h-[46px] w-full cursor-pointer rounded-xl border border-border bg-surface p-1.5 sm:w-24"
              />
            </Field>
          </div>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="plus" className="size-4" />
            Create category
          </button>
        </FormPanel>
      </form>
    </div>
  )
}
