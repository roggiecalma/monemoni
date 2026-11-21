import { redirect } from "next/navigation"
import { connection } from "next/server"

import { setupPasscode } from "@/lib/actions/auth"
import { authErrorMessage } from "@/lib/auth/errors"
import { hasUser } from "@/lib/auth/session"
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password"

import { AuthShell } from "@/components/auth/AuthShell"
import { Icon } from "@/components/ui/icons"
import { ErrorNote, Field } from "@/components/ui/primitives"
import { inputClass, primaryButtonClass } from "@/lib/ui"

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
    <AuthShell
      eyebrow="First run"
      title="Set up MoneMoni"
      description="Create the passcode that protects this install. It is the only one — there is no account to sign up for."
    >
      {/*
        The `maxLength` on the inputs is a loose upper bound in
        *characters*: the real limit is 72 **bytes** (bcrypt only reads
        that many, and the server enforces it). It is here to keep an
        absurdly long passcode out of the request.
      */}
      <form action={submit} className="space-y-4">
        <Field
          htmlFor="password"
          label="Passcode"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={72}
            autoComplete="new-password"
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field htmlFor="confirmPassword" label="Confirm passcode">
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={72}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>

        {message ? <ErrorNote message={message} /> : null}

        <button type="submit" className={`${primaryButtonClass} w-full`}>
          <Icon name="shield" className="size-4" />
          Create passcode
        </button>
      </form>
    </AuthShell>
  )
}
