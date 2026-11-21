import { connection } from "next/server"

import { restoreCategory } from "@/lib/actions/categories"
import { getCategories } from "@/lib/db/queries"
import type { Category, CategoryKind } from "@/lib/db/schema"
import { CATEGORY_KIND_LABELS } from "@/lib/validation/categories"

import { Icon } from "@/components/ui/icons"
import { PageHeader } from "@/components/ui/primitives"

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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organisation"
        title="Categories"
        description="How income and spending are grouped. Archived categories stay attached to their history."
        action={
          <a
            href="/categories/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-900/20 transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            New category
          </a>
        }
      />

      {hasNoCategories ? (
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Icon name="tag" className="size-5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No categories yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">
            Add an income or expense category to group your transactions.
          </p>
          <a
            href="/categories/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <Icon name="plus" className="size-4" />
            Add your first category
          </a>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <CategorySection
            title="Income categories"
            kind="income"
            categories={activeIncome}
            emptyMessage="No income categories yet."
          />
          <CategorySection
            title="Expense categories"
            kind="expense"
            categories={activeExpense}
            emptyMessage="No expense categories yet."
          />
        </div>
      )}

      {archived.length > 0 ? (
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-surface-sunken text-ink-subtle">
                <Icon name="archive" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Archived categories</h2>
                <p className="text-xs text-ink-muted">
                  Hidden from pickers; past transactions still show their name and colour.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-xs font-medium text-ink-muted">
              {archived.length}
              <Icon
                name="chevron-right"
                className="size-4 transition group-open:rotate-90"
              />
            </span>
          </summary>

          <ul className="divide-y divide-border border-t border-border">
            {archived.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CategoryGlyph category={category} muted />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{category.name}</p>
                    <p className="text-xs text-ink-muted">{CATEGORY_KIND_LABELS[category.kind]}</p>
                  </div>
                </div>
                <form action={restoreCategory.bind(null, category.id)}>
                  <button
                    type="submit"
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-ink"
                  >
                    Restore
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** A titled panel listing one direction's categories. */
function CategorySection({
  title,
  kind,
  categories,
  emptyMessage,
}: {
  title: string
  kind: CategoryKind
  categories: Category[]
  emptyMessage: string
}) {
  const isIncome = kind === "income"

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-9 place-items-center rounded-xl ${
              isIncome
                ? "bg-income/10 text-income"
                : "bg-expense/10 text-expense"
            }`}
          >
            <Icon name={isIncome ? "arrow-up-right" : "arrow-down-left"} className="size-4" />
          </span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted tabular-nums">
          {categories.length}
        </span>
      </div>

      {categories.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-border">
          {categories.map((category) => (
            <li
              key={category.id}
              className="group flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-surface-muted/60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <CategoryGlyph category={category} />
                <span className="truncate text-sm font-medium">{category.name}</span>
              </div>
              <a
                href={`/categories/${category.id}/edit`}
                aria-label={`Edit ${category.name}`}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-ink-subtle opacity-70 transition hover:border-border hover:bg-surface hover:text-ink group-hover:opacity-100"
              >
                <Icon name="pencil" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The emoji in a bubble tinted with the category's own colour. */
function CategoryGlyph({ category, muted = false }: { category: Category; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-9 shrink-0 place-items-center rounded-xl border text-base ${
        muted ? "grayscale" : ""
      }`}
      style={{
        backgroundColor: `${category.color}14`,
        borderColor: `${category.color}33`,
      }}
    >
      {category.icon}
    </span>
  )
}
