# Handoff — MoneMoni

State as of the end of **Wave A**. Read `ARCHITECTURE.md` first — it is the source of truth for the data model, money rules, auth model, and conventions.

## Status

| Wave | Scope | State |
| --- | --- | --- |
| A | Data layer, money utils, auth, migrations | **done** |
| B | App shell, PWA, setup/login pages, transactions + accounts + categories CRUD | not started |
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
tests/smoke.test.ts      2 passing tests (see known gaps below)
```

Nothing else yet — no `app/` directory, no UI.

## Verified working

- `npm run typecheck` — clean.
- `npm test` — 2 passing (money parse/format, seed + balance computation).
- `npm run db:generate` + `npm run db:migrate` — succeeded; `local.db` has all 10 tables plus `__drizzle_migrations`.
- `dialect: "turso"` works against a `file:` URL, so one dialect covers dev and production.

## Known gaps to fix in Wave B

1. **Tests write to the real `local.db`.** `tests/smoke.test.ts` inserts rows into the dev database. The tester must isolate tests — point `DATABASE_URL` at a temp file per run, or use an in-memory libSQL URL. Do not let test data pollute the dev DB.
2. `vitest.config.mts` (renamed from `.ts` to silence an ESM/CJS warning) — verify the `@` alias still resolves.
3. `local.db` currently contains two throwaway transactions from the smoke test. Delete the file and re-run `npm run db:migrate` to reset.
4. No `app/` directory exists yet — root layout, `globals.css`, `manifest.ts`, icons, service worker, and the `(app)` route group all still need to be written.
5. `lib/db/client.ts` throws if `typeof window !== "undefined"`. Keep it server-only; verify no client component imports it.
6. The parser **rejects** more than 2 decimal places rather than rounding. This is intentional and documented in the file — keep the behaviour consistent anywhere else amounts are parsed.

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

## Decisions locked with the user

Web app / PWA · Turso hosted SQLite · single-user passcode auth · Vercel deploy · Next.js + Drizzle · PHP only (schema keeps a `currency` column so USD is additive later) · simple UI that ships minimal JavaScript (Server Components, hand-rolled SVG charts, no chart library).
