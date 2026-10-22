# Handoff — MoneMoni

State as of the end of **Wave A** plus the Wave B1 build. Read `ARCHITECTURE.md` first — it is the source of truth for the data model, money rules, auth model, and conventions.

## Status

| Wave | Scope | State |
| --- | --- | --- |
| A | Data layer, money utils, auth, migrations | **done** — committed `5da5f28`, pushed to `origin/main` |
| A′ | Tester suites + DB isolation | **done** — 78 tests, 77 pass / 1 deliberate failure (a real bug) |
| A″ | Fix wave for the tester's findings | **in flight** |
| B1 | App shell, PWA, setup/login, dashboard | **in flight** |
| B2 | Transactions + accounts + categories CRUD | not started |
| C | Recurring bills, budgets, savings goals, reports, SVG charts, CSV export | not started |
| D | Turso + Vercel deploy, README | not started |

## Workflow (from `CLAUDE.md`)

Act as orchestrator and delegate in order: **coder → tester → reviewer → security**. If reviewer or security report problems, send them back to the coder and repeat the checks.

The definitions in `.claude/agents/` define the roles:

- **coder** — implements exactly what the task asks; keeps changes focused; no unrelated refactors; reports files changed + summary.
- **tester** — writes and runs tests (normal, edge, error cases). **Never modifies implementation code.** Reports failures honestly.
- **reviewer** — read-only. Short list ordered by importance, each with file + suggested fix.
- **security** — read-only. Rates each finding high/medium/low with file + fix. If nothing found, states what was checked.

This harness has no agents registered under those names. Use the `general` subagent and paste the relevant role definition into the prompt.

## What exists

```
ARCHITECTURE.md          spec — read this first
drizzle.config.ts        dialect: "turso" (works against file: and libsql://)
lib/db/schema.ts         all 10 tables
lib/db/client.ts         libSQL client + Drizzle instance (server-only)
lib/db/seed.ts           ensureSeedData() + DEFAULT_ACCOUNTS / DEFAULT_CATEGORIES
lib/db/queries.ts        getTransactions, getAccountBalances, getSummary,
                         getCategoryTotals, getMonthlyTotals
lib/money/parse.ts       parsePesoToCentavos, centavosToPesoString (BigInt, no floats)
lib/money/format.ts      formatPeso, formatPesoCompact, formatPercent,
                         formatMonth, formatDate
lib/auth/password.ts     bcryptjs hash/verify, validatePassword
lib/auth/session.ts      createSession, getSession, destroySession,
                         getCurrentUser, requireSession, hasUser
drizzle/0000_*.sql       migration
tests/                   money, auth, queries, seed, known-issues + setup/ harness
```

## Test harness (Wave A′)

- `vitest.config.mts` sets `test.env.DATABASE_URL` to an **absolute** `file:<repo>/.tmp/test.db` (absolute because a relative `file:` URL resolves against whichever process opens it — global setup vs. worker — and those are not guaranteed to match).
- `tests/setup/global-setup.ts` deletes `.tmp/test.db` and applies migrations with `migrate()` from `drizzle-orm/libsql/migrator`, so future migrations are picked up for free.
- `tests/setup/guard-db.ts` **aborts the run** if `DATABASE_URL` is not the test DB — the dev `local.db` cannot be touched by accident.
- `fileParallelism: false` is **required** — one shared SQLite file; with parallelism on, the suite dies with `SQLITE_BUSY`.
- `tests/setup/architecture.ts` parses the seed section of `ARCHITECTURE.md` so the seed cannot drift from the spec.
- `.tmp/` and `local.db` are gitignored. `local.db` was verified byte-identical before and after a test run.

## Verified working

- `npm run typecheck` — clean.
- `npm test` — 78 tests, 77 pass. The 1 failure is the deliberate known-issue test for the seed bug below.
- `npm run db:generate` + `npm run db:migrate` — succeeded; `local.db` has all 10 tables plus `__drizzle_migrations`.
- `dialect: "turso"` works against a `file:` URL, so one dialect covers dev and production.

## Defects found by the tester (Wave A′)

1. **HIGH — `lib/db/seed.ts` duplicates default accounts.** `ensureSeedData()` gated on the `categories` table only but inserted the default **accounts** too, so emptying categories produced 10 accounts instead of 5. Fixed in the fix wave: accounts and categories are now seeded **independently and idempotently**. `ARCHITECTURE.md` was updated to match. `tests/known-issues.test.ts` is deleted once the fix lands.
2. **MEDIUM — `lib/money/parse.ts` did not validate thousands separators.** `"1,23"` silently became ₱123.00. Fixed in the fix wave: malformed groupings are now rejected.
3. **LOW — `lib/money/format.ts` `formatDate` accepted impossible dates.** `"2026-02-31"` rendered `"Feb 31, 2026"`, and the regex was not anchored at the end. Fixed in the fix wave.
4. **LOW — `lib/db/queries.ts:273` `getCategoryTotals` compared a category *kind* against a transaction *type*.** It works only because both vocabularies happen to be `income`/`expense`. Still open — fold into the next coder wave that owns `lib/db/queries.ts`.
5. **SPEC GAP — liabilities had no sign convention.** Decided and written into `ARCHITECTURE.md` ("Liability sign convention"): balances are signed, a liability is negative when money is owed, net worth = sum of all account balances, and the UI shows a liability as a magnitude with an "owed" label.

## Known gaps to fix

1. **`AccountBalance` has no `isLiability` field.** `getAccountBalances()` does not select it, so the UI cannot yet render the "owed" label that the new sign convention requires. Add `isLiability` to the interface and to the select in `lib/db/queries.ts`.
2. **`lib/db/client.ts` throws if `typeof window !== "undefined"`.** Keep it server-only; verify no client component imports it.
3. The parser **rejects** more than 2 decimal places rather than rounding. This is intentional and documented — keep the behaviour consistent anywhere else amounts are parsed.
4. `app/_probe.ts` is scratch left over from the B1 build — delete it before committing.

## Environment

| Variable | Dev | Production |
| --- | --- | --- |
| `DATABASE_URL` | `file:./local.db` (default when unset) | `libsql://<db>.turso.io` |
| `DATABASE_AUTH_TOKEN` | empty | Turso auth token |

```bash
npm run dev
npm run typecheck
npm test
npm run db:generate && npm run db:migrate
```

## Next.js 16 notes (this version is not the Next.js you know)

Read the guides in `node_modules/next/dist/docs/` before writing Next code — `AGENTS.md` at the repo root is generated by `next dev` and says the same thing.

- `params`, `searchParams`, `cookies()`, `headers()` are **async** — always `await` them.
- `revalidateTag` now requires a second `cacheLife` argument; the single-argument form is deprecated and is a type error.
- `updateTag` is new, Server-Action-only, and has read-your-writes semantics — prefer it over `revalidatePath` for finance forms so the user sees their change immediately.
- `refresh()` refreshes the client router from inside a Server Action.
- `middleware.ts` was renamed `proxy.ts` (Node.js runtime only).
- Turbopack is the default builder; dev output goes to `.next/dev`, so dev and build can run concurrently.
- `next lint` was removed and the build no longer lints. **`npm run typecheck` is the gate.**
- `cacheComponents` / `partialPrefetching` are **opt-in and we do not enable them**, so direct DB reads in Server Components stay dynamic — correct for live financial data.

## Decisions locked with the user

Web app / PWA · Turso hosted SQLite · single-user passcode auth · Vercel deploy · Next.js + Drizzle · PHP only (schema keeps a `currency` column so USD is additive later) · simple UI that ships minimal JavaScript (Server Components, hand-rolled SVG charts, no chart library).

Decided during Wave A′: the **liability sign convention** (see above). TypeScript is pinned to **5.9.3, not 7.0.2** — TS 7 is too new for the drizzle-kit and lint toolchain.
