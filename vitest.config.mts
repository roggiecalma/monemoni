import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL(".", import.meta.url))

/**
 * Absolute path of the throwaway SQLite database used by the test suite.
 *
 * The path is absolute on purpose: `file:./.tmp/test.db` would be resolved
 * against the cwd of whichever process happens to open the database (global
 * setup, a vitest worker, ...), and those are not guaranteed to be the same.
 */
const testDbPath = path.join(root, ".tmp", "test.db")

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    pool: "forks",

    /**
     * Every test file shares one SQLite file, so the files must not run at the
     * same time (two writers on one SQLite file → "database is locked").
     */
    fileParallelism: false,

    /**
     * `lib/db/client.ts` reads `process.env.DATABASE_URL` when the module is
     * first imported. Vitest applies `test.env` to the worker before the test
     * file (and therefore before `lib/db/client.ts`) is imported, so the whole
     * suite talks to the throwaway database and never to `local.db`.
     */
    env: {
      DATABASE_URL: `file:${testDbPath}`,
      DATABASE_AUTH_TOKEN: "",
    },

    /** Recreates `.tmp/test.db` from scratch and applies the migrations. */
    globalSetup: ["./tests/setup/global-setup.ts"],

    /** Fails fast if the suite is ever pointed at a non-test database. */
    setupFiles: ["./tests/setup/guard-db.ts"],
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
})
