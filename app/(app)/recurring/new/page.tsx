import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createRecurringBill } from "@/lib/actions/recurring"
import { todayKey } from "@/lib/dates"
import { getAccounts, getCategories } from "@/lib/db/queries"
import { RECURRING_FREQUENCIES } from "@/lib/db/schema"
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
import { inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * New recurring bill screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function NewRecurringBillPage({
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
    const result = await createRecurringBill(formData)
    if (result) {
      redirect(`/recurring/new?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = lookupMessage(RECURRING_ERROR_MESSAGES, error)

  const [accounts, categories] = await Promise.all([
    // A new bill has no archived reference to preserve, so only the active
    // records are offered.
    getAccounts({ includeArchived: false }),
    getCategories("expense", { includeArchived: false }),
  ])

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <a
        href="/recurring"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
      >
        <Icon name="arrow-left" className="size-3.5" />
        Back to recurring
      </a>

      <PageHeader
        eyebrow="Recurring"
        title="New bill"
        description="A bill you pay again and again. Logging it records an expense in the month you pay it."
      />

      {accounts.length === 0 ? (
        <FormPanel>
          <InlineNote icon="wallet">
            A bill needs an account to pay from, and every account is archived right now. Restore
            one from the accounts screen first.
          </InlineNote>
          <a href="/accounts" className={`${primaryButtonClass} w-full`}>
            <Icon name="arrow-left" className="size-4" />
            Go to accounts
          </a>
        </FormPanel>
      ) : (
        <form action={submit}>
          <FormPanel>
            <Field htmlFor="name" label="Name">
              <input
                id="name"
                name="name"
                type="text"
                required
                maxLength={RECURRING_NAME_MAX_LENGTH}
                autoFocus
                placeholder="Electricity"
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
                  placeholder="0.00"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="frequency" label="Repeats">
                <select
                  id="frequency"
                  name="frequency"
                  defaultValue="monthly"
                  className={inputClass}
                >
                  {RECURRING_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {RECURRING_FREQUENCY_LABELS[frequency]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field htmlFor="dayOfMonth" label="Day of month" hint="1–31; the last day is used in shorter months.">
                <input
                  id="dayOfMonth"
                  name="dayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  required
                  defaultValue={1}
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
                  defaultValue={todayKey()}
                  className={inputClass}
                />
              </Field>

              <Field htmlFor="endDate" label="Ends" hint="Optional — leave empty for no end.">
                <input id="endDate" name="endDate" type="date" className={inputClass} />
              </Field>
            </div>

            <Field htmlFor="accountId" label="Account">
              <select id="accountId" name="accountId" required className={inputClass}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field htmlFor="categoryId" label="Category" hint="Optional — the expense is grouped here.">
              <select id="categoryId" name="categoryId" className={inputClass}>
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </Field>

            {message ? <ErrorNote message={message} /> : null}

            <button type="submit" className={`${primaryButtonClass} w-full`}>
              <Icon name="plus" className="size-4" />
              Create bill
            </button>
          </FormPanel>
        </form>
      )}
    </div>
  )
}
