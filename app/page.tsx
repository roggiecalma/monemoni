import { redirect } from "next/navigation"
import { connection } from "next/server"

import { getSession, hasUser } from "@/lib/auth/session"

/**
 * Entry point. Sends the visitor to the right screen:
 * setup (no user yet), login (no session) or the dashboard.
 */
export default async function HomePage() {
  // The page depends on the cookie and the database, so it must be rendered
  // per request — never prerendered at build time.
  await connection()

  // No user yet — this install still needs its passcode.
  if (!(await hasUser())) {
    redirect("/setup")
  }

  // Signed in? Go straight to the dashboard.
  if (!(await getSession())) {
    redirect("/login")
  }

  redirect("/dashboard")
}
