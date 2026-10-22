/**
 * MoneMoni — the production guard of `lib/db/client.ts`.
 *
 * The module resolves `DATABASE_URL` **when it is imported**, so the guard
 * cannot be reached through an exported helper: `resolveDatabaseUrl()` is
 * module-private. It is therefore exercised the only way it can be — by
 * re-importing the module with a different environment and watching what the
 * import does.
 *
 * `vi.resetModules()` throws away the module registry of the worker, so the
 * next `import()` evaluates `lib/db/client.ts` again, and it reads the
 * environment as it is at that moment.
 *
 * The development database (`local.db`) is never touched: every case either
 * throws before a connection is opened, points at a throwaway file inside
 * `.tmp/`, or runs with the working directory moved into `.tmp/`.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const REPO_ROOT = path.resolve(import.meta.dirname, "..")
const TMP_DIR = path.join(REPO_ROOT, ".tmp", "client-guard")
const PROBE_DB = path.join(TMP_DIR, "probe.db")
const PROBE_CWD = path.join(TMP_DIR, "cwd")

/** The environment variables the module reads. */
const ENV_KEYS = ["NODE_ENV", "DATABASE_URL", "DATABASE_AUTH_TOKEN", "NEXT_PHASE"] as const

type EnvKey = (typeof ENV_KEYS)[number]
type Env = Record<EnvKey, string | undefined>

/** The environment the module is imported with. */
const BASE_ENV: Env = {
  NODE_ENV: "development",
  DATABASE_URL: `file:${PROBE_DB}`,
  DATABASE_AUTH_TOKEN: "",
  NEXT_PHASE: undefined,
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true })
  rmSync(PROBE_DB, { force: true })
  rmSync(PROBE_CWD, { recursive: true, force: true })
  mkdirSync(PROBE_CWD, { recursive: true })
})

afterEach(() => {
  // `vi.stubEnv` restores every variable it touched. It is also the only way
  // to write `NODE_ENV` here: Next.js declares `process.env.NODE_ENV`
  // read-only, so a direct assignment does not even typecheck.
  vi.unstubAllEnvs()
  vi.resetModules()
})

/**
 * Applies the given environment and re-imports the module.
 *
 * Returns the module when the import succeeded and the error it threw
 * otherwise.
 */
async function importClient(
  env: Partial<Env>,
): Promise<{ module: typeof import("@/lib/db/client") | null; error: Error | null }> {
  vi.resetModules()

  const applied: Env = { ...BASE_ENV, ...env }
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, applied[key])
  }

  try {
    const module = await import("@/lib/db/client")
    return { module, error: null }
  } catch (error) {
    return { module: null, error: error as Error }
  }
}

/** Closes the client a successful import opened. */
async function closeClient(module: typeof import("@/lib/db/client")): Promise<void> {
  await module.client.close()
}

describe("lib/db/client.ts — the production guard", () => {
  it("refuses to start without a DATABASE_URL in production", async () => {
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: undefined,
      NEXT_PHASE: undefined,
    })

    expect(module).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toBe(
      "DATABASE_URL is not set. Production requires a hosted libSQL/Turso URL (e.g. libsql://<db>.turso.io).",
    )
  })

  it("refuses to start with a local SQLite file in production", async () => {
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: `file:${PROBE_DB}`,
      NEXT_PHASE: undefined,
    })

    expect(module).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toBe(
      `DATABASE_URL points at a local SQLite file ("file:${PROBE_DB}"). A local file cannot be used in production — set DATABASE_URL to the hosted libSQL/Turso URL.`,
    )
  })

  it("refuses to start with a relative local SQLite file in production", async () => {
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: "file:./local.db",
      NEXT_PHASE: undefined,
    })

    expect(module).toBeNull()
    expect(error?.message).toContain("points at a local SQLite file")
  })

  it("accepts a hosted libSQL/Turso URL in production", async () => {
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: "libsql://db.turso.io",
      NEXT_PHASE: undefined,
    })

    expect(error).toBeNull()
    expect(module).not.toBeNull()
    await closeClient(module!)
  })

  it("skips the guard during `next build` (NEXT_PHASE === phase-production-build)", async () => {
    // The very same URL that is refused above is accepted while the build
    // runs: `next build` has no database to talk to.
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: `file:${PROBE_DB}`,
      NEXT_PHASE: "phase-production-build",
    })

    expect(error).toBeNull()
    expect(module).not.toBeNull()
    await closeClient(module!)
  })

  it("still applies the guard outside the build phase", async () => {
    // The escape hatch is narrow: it only applies to the build phase, not to
    // any other value of NEXT_PHASE.
    const { module, error } = await importClient({
      NODE_ENV: "production",
      DATABASE_URL: `file:${PROBE_DB}`,
      NEXT_PHASE: "phase-production-server",
    })

    expect(module).toBeNull()
    expect(error?.message).toContain("points at a local SQLite file")
  })

  it("falls back to ./local.db outside production", async () => {
    // The fallback is relative to the working directory, so the working
    // directory is moved into `.tmp/` for this test: the repository's
    // `local.db` must never be opened by the test suite.
    const originalCwd = process.cwd()

    let result: { module: typeof import("@/lib/db/client") | null; error: Error | null } | null =
      null
    try {
      process.chdir(PROBE_CWD)
      result = await importClient({
        NODE_ENV: "development",
        DATABASE_URL: undefined,
        NEXT_PHASE: undefined,
      })
    } finally {
      process.chdir(originalCwd)
    }

    expect(result?.error).toBeNull()
    expect(result?.module).not.toBeNull()
    await closeClient(result!.module!)

    // The client was opened on "./local.db" relative to the working
    // directory — inside `.tmp/`, not in the repository.
    expect(existsSync(path.join(PROBE_CWD, "local.db"))).toBe(true)
    expect(existsSync(path.join(REPO_ROOT, "local.db-wal"))).toBe(false)
    expect(existsSync(path.join(REPO_ROOT, "local.db-shm"))).toBe(false)
  })

  it("exports the client, the drizzle instance and the accessor", async () => {
    const { module, error } = await importClient({
      NODE_ENV: "development",
      DATABASE_URL: `file:${PROBE_DB}`,
      NEXT_PHASE: undefined,
    })

    expect(error).toBeNull()
    expect(module).not.toBeNull()
    expect(module!.client).toBeDefined()
    expect(module!.db).toBeDefined()
    expect(module!.getDb()).toBe(module!.db)

    await closeClient(module!)
  })
})
