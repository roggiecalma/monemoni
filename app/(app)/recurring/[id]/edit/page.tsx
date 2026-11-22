import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import {
  deleteRecurringBill,
  postRecurringBill,
  toggleRecurringBill,
  updateRecurringBill,
} from "@/lib/actions/recurring"
import { monthKey } from "@/lib/dates"
import { getAccounts, getCategories, getRecurringBillById } from "@/lib/db/queries"
import { RECURRING_FREQUENCIES } from "@/lib/db/schema"
import { formatMonth } from "@/lib/money/format"
import { centavosToPesoString } from "@/lib/money/parse"
import { lookupMessage } from "@/lib/validation/errors"
import {
  RECURRING_ERROR_MESSAGES,
  RECURRING_FREQUENCY_LABELS,
  RECURRING_NAME_MAX_LENGTH,
} from "@/lib/validation/recurring"

import { Icon } from "@/components/ui/icons"
import {
  ErrorNote,
  Field,
  FormPanel,
  InlineNote,
  PageHeader,
} from "@/components/ui/primitives"
import { dangerButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui"

/**
 * Edit recurring bill screen. Server Component — every form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function EditRecurringBillPage({
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
  const bill = await getRecurringBillById(id)

  if (!bill) {
    notFound()
  }

  // The id of the bill comes from the URL, so the actions can be bound to it
  // instead of taking it from the form data.
  const billId = bill.id

  /**
   * Submits the form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await updateRecurringBill.bind(null, billId)(formData)
    if (result) {
      redirect(`/recurring/${billId}/edit?error=${encodeURIComponent(result.code)}`)
    }
  }

  const [accounts, categories] = await Promise.all([getAccounts(), getCategories("expense")])

  const { error } = await searchParams
  const message = lookupMessage(RECURRING_ERROR_MESSAGES, error)

  const month = monthKey(new Date())
  // A weekly bill can be logged several times in a month, so it is always
  // offered; the others remember the month they were logged for.
  const alreadyLogged = bill.frequency !== "weekly" && bill.lastMaterialized === month
  const canLog = bill.active && !alreadyLogged

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/recurring"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to recurring
      </a>

      <PageHeader eyebrow="Recurring" title="Edit bill" description={bill.name} />

      <form action={submit}>
        <FormPanel>
          <Field htmlFor="name" label="Name">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={RECURRING_NAME_MAX_LENGTH}
              defaultValue={bill.name}
              className={inputClass}
            />
          </Field>

          <Field htmlFor="amount" label="Amount" hint="A positive amount, e.g. 1,250.00.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-sm font-medium text-ink-subtle">
                ₱
              </span>
              <input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                required
                defaultValue={centavosToPesoString(bill.amount)}
                className={`${inputClass} pl-8`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="frequency" label="Repeats">
              <select
                id="frequency"
                name="frequency"
                defaultValue={bill.frequency}
                className={inputClass}
              >
                {RECURRING_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {RECURRING_FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              htmlFor="dayOfMonth"
              label="Day of month"
              hint="1–31; the last day is used in shorter months."
            >
              <input
                id="dayOfMonth"
                name="dayOfMonth"
                type="number"
                min={1}
                max={31}
                step={1}
                required
                defaultValue={bill.dayOfMonth}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="startDate" label="Starts">
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={bill.startDate}
                className={inputClass}
              />
            </Field>

            <Field htmlFor="endDate" label="Ends" hint="Optional — leave empty for no end.">
              <input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={bill.endDate ?? ""}
                className={inputClass}
              />
            </Field>
          </div>

          <Field htmlFor="accountId" label="Account">
            <select
              id="accountId"
              name="accountId"
              required
              defaultValue={bill.accountId}
              className={inputClass}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="categoryId" label="Category" hint="Optional — the expense is grouped here.">
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={bill.categoryId ?? ""}
              className={inputClass}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                  {category.archived ? " · archived" : ""}
                </option>
              ))}
            </select>
          </Field>

          {message ? <ErrorNote message={message} /> : null}

          <button type="submit" className={`${primaryButtonClass} w-full`}>
            <Icon name="check" className="size-4" />
            Save changes
          </button>
        </FormPanel>
      </form>

      {/* This month's occurrence — the same one-click log the list offers. */}
      <div className="rounded-2xl border border-border bg-surface-raised px-5 py-4 shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">This month</p>
            <p className="text-xs text-ink-muted">
              {bill.lastMaterialized
                ? `Last logged for ${formatMonth(bill.lastMaterialized)}.`
                : "Not logged yet."}
            </p>
          </div>

          {canLog ? (
            <form action={postRecurringBill.bind(null, billId)}>
              <button type="submit" className={secondaryButtonClass}>
                <Icon name="check" className="size-4" />
                Log bill
              </button>
            </form>
          ) : (
            <InlineNote icon={bill.active ? "check" : "archive"}>
              {bill.active
                ? `Already logged for ${formatMonth(month)}.`
                : "This bill is paused — activate it to log it again."}
            </InlineNote>
          )}
        </div>
      </div>

      {/* Pause / resume, behind a native <details> so it is deliberate. */}
      <form action={toggleRecurringBill.bind(null, billId)}>
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-surface-sunken text-ink-subtle">
                <Icon name="repeat" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {bill.active ? "Pause this bill" : "Activate this bill"}
                </p>
                <p className="text-xs text-ink-muted">
                  {bill.active
                    ? "A paused bill keeps its settings and its history."
                    : "An active bill is offered for logging again."}
                </p>
              </div>
            </div>
            <Icon
              name="chevron-right"
              className="size-4 text-ink-subtle transition group-open:rotate-90"
            />
          </summary>

          <div className="border-t border-border px-5 py-4">
            <button type="submit" className={secondaryButtonClass}>
              <Icon name="repeat" className="size-4" />
              {bill.active ? "Yes, pause it" : "Yes, activate it"}
            </button>
          </div>
        </details>
      </form>

      {/*
        Deleting a bill is irreversible, but the expenses it already produced
        stay in the ledger: `transactions.recurring_id` is ON DELETE SET NULL.
        The <details> asks for a second, deliberate step. No JavaScript.
      */}
      <form action={deleteRecurringBill.bind(null, billId)}>
        <details className="group rounded-2xl border border-border bg-surface-raised shadow-sm ring-1 ring-black/[0.015] dark:ring-white/[0.02]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-expense/10 text-expense">
                <Icon name="archive" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Delete this bill</p>
                <p className="text-xs text-ink-muted">
                  Expenses it already logged stay in the ledger.
                </p>
              </div>
            </div>
            <Icon
              name="chevron-right"
              className="size-4 text-ink-subtle transition group-open:rotate-90"
            />
          </summary>

          <div className="border-t border-border px-5 py-4">
            <p className="text-sm leading-relaxed text-ink-muted">
              The bill is removed for good. The expenses it already generated keep their amount,
              date and category — they simply stop pointing back at this bill.
            </p>
            <button type="submit" className={`${dangerButtonClass} mt-3`}>
              <Icon name="archive" className="size-4" />
              Yes, delete it
            </button>
          </div>
        </details>
      </form>
    </div>
  )
}
