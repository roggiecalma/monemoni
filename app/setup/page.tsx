import { redirect } from "next/navigation"
import { connection } from "next/server"

import { setupPasscode } from "@/lib/actions/auth"
import { authErrorMessage } from "@/lib/auth/errors"
import { hasUser } from "@/lib/auth/session"
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password"

/**
 * First-run setup screen. Server Component — the form posts to a Server
 * Action, so the page ships no client JavaScript.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  // A passcode already exists — this install is past setup.
  if (await hasUser()) {
    redirect("/login")
  }

  /**
   * Submits the setup form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await setupPasscode(formData)
    if (result) {
      redirect(`/setup?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = authErrorMessage(error)

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            M
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Set up MoneMoni</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create the passcode that protects this install. It is the only one — there is
            no account to sign up for.
          </p>
        </div>

        <form
          action={submit}
          className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              Passcode
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              autoFocus
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
            <p className="text-xs text-ink-muted">At least {PASSWORD_MIN_LENGTH} characters.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm font-medium">
              Confirm passcode
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
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
            Create passcode
          </button>
        </form>
      </div>
    </main>
  )
}
