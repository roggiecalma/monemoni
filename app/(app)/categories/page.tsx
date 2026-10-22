import { connection } from "next/server"

import { restoreCategory } from "@/lib/actions/categories"
import { getCategories } from "@/lib/db/queries"
import type { Category } from "@/lib/db/schema"
import { CATEGORY_KIND_LABELS } from "@/lib/validation/categories"

/**
 * The category list.
 *
 * Server Component: every row is plain HTML and the Restore button is a
 * form that posts to a Server Action, so the screen ships no client
 * JavaScript.
 */
export default async function CategoriesPage() {
  // The screen shows the signed-in user's categories, so it must be rendered
  // per request — never prerendered at build time.
  await connection()

  const allCategories = await getCategories()

  const income = allCategories.filter((category) => category.kind === "income")
  const expense = allCategories.filter((category) => category.kind === "expense")

  const activeIncome = income.filter((category) => !category.archived)
  const activeExpense = expense.filter((category) => !category.archived)
  const archived = allCategories.filter((category) => category.archived)

  const hasNoCategories = allCategories.length === 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            How your income and spending are grouped.
          </p>
        </div>
        <a
          href="/categories/new"
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          New category
        </a>
      </div>

      {hasNoCategories ? (
        <section className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
          <p className="text-3xl" aria-hidden="true">
            🏷️
          </p>
          <h2 className="mt-2 text-base font-semibold">No categories yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Add an income or expense category to group your transactions.
          </p>
          <a
            href="/categories/new"
            className="mt-3 inline-block rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Add your first category
          </a>
        </section>
      ) : null}

      <CategorySection
        title="Income categories"
        categories={activeIncome}
        emptyMessage="No income categories yet."
      />
      <CategorySection
        title="Expense categories"
        categories={activeExpense}
        emptyMessage="No expense categories yet."
      />

      {archived.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Archived
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Archived categories are hidden from the pickers, but past transactions still show
            their name and colour.
          </p>
          <ul className="divide-y divide-border">
            {archived.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: category.color }}
                  />
                  <span aria-hidden="true" className="shrink-0 text-base">
                    {category.icon}
                  </span>
                  <span className="truncate text-sm font-medium">{category.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {CATEGORY_KIND_LABELS[category.kind]}
                  </span>
                </div>
                <form action={restoreCategory.bind(null, category.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/** A titled list of categories with an Edit link on every row. */
function CategorySection({
  title,
  categories,
  emptyMessage,
}: {
  title: string
  categories: Category[]
  emptyMessage: string
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h2>

      {categories.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: category.color }}
                />
                <span aria-hidden="true" className="shrink-0 text-base">
                  {category.icon}
                </span>
                <span className="truncate text-sm font-medium">{category.name}</span>
              </div>
              <a
                href={`/categories/${category.id}/edit`}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                Edit
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
