import { redirect } from "next/navigation"
import { connection } from "next/server"

import { login } from "@/lib/actions/auth"
import { authErrorMessage } from "@/lib/auth/errors"
import { hasUser } from "@/lib/auth/session"

import { AuthShell } from "@/components/auth/AuthShell"
import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

/**
 * Sign-in screen. Server Component — the form posts to a Server Action, so
 * the page ships no client JavaScript.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // The page depends on the database and on the query string, so it must be
  // rendered per request — never prerendered at build time.
  await connection()

  // Nothing to sign in to until the first passcode has been created.
  if (!(await hasUser())) {
    redirect("/setup")
  }

  /**
   * Submits the sign-in form. The action returns an error result instead of
   * throwing, so it is turned into a redirect that carries the code back to
   * this page — a Server Component cannot read an action's return value
   * without shipping client JavaScript.
   */
  async function submit(formData: FormData): Promise<void> {
    "use server"
    const result = await login(formData)
    if (result) {
      redirect(`/login?error=${encodeURIComponent(result.code)}`)
    }
  }

  const { error } = await searchParams
  const message = authErrorMessage(error)

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in"
      description="Enter your passcode to open MoneMoni."
    >
      <form action={submit} className="space-y-4">
        <Field htmlFor="password" label="Passcode">
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            autoFocus
            className={inputClass}
          />
        </Field>

        {message ? <ErrorNote message={message} /> : null}

        <button type="submit" className={`${primaryButtonClass} w-full`}>
          <Icon name="lock" className="size-4" />
          Sign in
        </button>
      </form>
    </AuthShell>
  )
}
