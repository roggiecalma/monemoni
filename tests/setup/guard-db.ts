/**
 * Safety net that runs before every test file.
 *
 * `lib/db/client.ts` reads `process.env.DATABASE_URL` when it is imported, so
 * this file makes sure the environment really points at the throwaway test
 * database. If `test.env` in `vitest.config.mts` ever stops working, the suite
 * fails loudly here instead of silently writing to the development database.
 */

const url = process.env.DATABASE_URL ?? ""

const looksLikeTestDb = /[/\\]\.tmp[/\\]test\.db$/.test(url)

if (!looksLikeTestDb) {
  throw new Error(
    `Refusing to run the test suite: DATABASE_URL is "${url}" but the tests must use the ` +
      `throwaway database at .tmp/test.db. The development database (local.db) must never be ` +
      `written to by tests.`,
  )
}

if (process.env.DATABASE_AUTH_TOKEN) {
  throw new Error(
    "Refusing to run the test suite: DATABASE_AUTH_TOKEN is set. Tests must run against a " +
      "local SQLite file.",
  )
}
