# Handoff — MoneMoni

State as of the end of **Wave B1 + A″**. Read `ARCHITECTURE.md` first — it is the source of truth for the data model, money rules, auth model, and conventions.

## Status

| Wave | Scope | State |
| --- | --- | --- |
| A | Data layer, money utils, auth, migrations | **done** — `5da5f28` |
| A′ | Tester suites + DB isolation | **done** — 78 tests |
| A″ | Security hardening round 1 | **done** — `22dce8d` |
| B1 | App shell, PWA, setup/login, dashboard | **done** — `22dce8d` |
| A‴ | Security hardening round 2 (service worker, auth throttling, guards) | **in flight** |
| Q | Query-layer fixes (clamping, `isLiability`, category-kind coupling, date helpers) | **landed** |
| Q′ | Follow-up: restore type-driven category totals; `offset` implies a limit | **landed** |
| B2a | Accounts + categories CRUD, nav, error boundaries | **in flight** |
| B2b | Transactions CRUD (list, filters, income/expense/transfer forms) | not started |
| C | Recurring bills, budgets, savings goals, reports, SVG charts, CSV export | not started |
| D | Turso + Vercel deploy, README | not started |

`origin/main` is in sync with `main` at `22dce8d`.

## Workflow (from `CLAUDE.md`)

Act as orchestrator and delegate in order: **coder → tester → reviewer → security**. If reviewer or security report problems, send them back to the coder and repeat the checks.

The role definitions live in `.claude/agents/`:

- **coder** — implements exactly what is asked; keeps changes focused; no unrelated refactors; reports files changed + summary.
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
lib/dates.ts             monthKey, dateKey, lastDayOfMonth, todayKey (pure)
lib/money/parse.ts       parsePesoToCentavos, centavosToPesoString (BigInt, no floats)
lib/money/format.ts      formatPeso, formatPesoCompact, formatPercent,
                         formatMonth, formatDate
lib/auth/password.ts     bcryptjs hash/verify, validatePassword
lib/auth/session.ts      createSession, getSession, destroySession,
                         getCurrentUser, requireSession, hasUser
lib/auth/errors.ts       error-code → message map
lib/actions/auth.ts      setupPasscode, login, logout
lib/nav.ts               NAV_ITEMS (extended by later waves)
app/                     root layout, entry router, 404, login, setup,
                         (app)/layout, (app)/loading, (app)/dashboard
components/pwa/          ServiceWorkerRegistrar (the only "use client")
public/                  sw.js, icons
scripts/generate-icons.mjs
tests/                   139 tests across money, auth, actions, seed,
                         queries, db-client guard + the setup/ harness
```

## Test harness

- `vitest.config.mts` sets `test.env.DATABASE_URL` to an **absolute** `file:<repo>/.tmp/test.db` (absolute because a relative `file:` URL resolves against whichever process opens it — global setup vs. worker — and those are not guaranteed to match).
- `tests/setup/global-setup.ts` deletes `.tmp/test.db` and applies migrations with `migrate()` from `drizzle-orm/libsql/migrator`, so future migrations are picked up for free.
- `tests/setup/guard-db.ts` **aborts the run** if `DATABASE_URL` is not the test DB — the dev `local.db` cannot be touched by accident.
- `fileParallelism: false` is **required** — one shared SQLite file; with parallelism on, the suite dies with `SQLITE_BUSY`.
- `tests/setup/architecture.ts` parses the seed section of `ARCHITECTURE.md` so the seed cannot drift from the spec.
- `tests/actions-auth.test.ts` mocks the **request scope** (a cookie jar + a throwing `redirect()`), not the logic under test — the real `createSession`/`destroySession`/`requireSession` code runs against it.
- `tests/db-client-guard.test.ts` re-imports the module with `vi.resetModules()` so the import-time guard genuinely re-runs. `createClient()` opens a `file:` database eagerly, so every `file:` case there targets `.tmp/client-guard/probe.db`, never the repo's `local.db`.
- `.tmp/` and `local.db` are gitignored. `local.db` was verified byte-identical (sha256 `947279b702719eabaef8a9736ae4a18d369087609d1fa7bd563b47856ccdd1a0`) before and after a test run.

## Verified working

- `npm run typecheck` — clean.
- `npm test` — **139 tests, all green** (7 files). Run 4× consecutively with identical results.
- `npm run build` — succeeds. Routes: `/`, `/dashboard`, `/login`, `/setup` are dynamic (`ƒ`); only `/_not-found`, `/icon.svg`, `/manifest.webmanifest` are static.
- Security headers are **actually served** (verified with `curl`): nosniff, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and a CSP. Dynamic pages send `Cache-Control: no-store`.
- Full auth flow exercised in dev **and** in a production build: setup → dashboard → logout, with the `mm_session` cookie carrying `HttpOnly`, `SameSite=lax`, `Max-Age=2592000`.
- Client JS on the production dashboard: 6 chunks, 570 KB raw / **174 KB gzip** — all React + App Router baseline, no third-party client code. Exactly one `"use client"` file in the tree.

## Verification round findings and their status

Round 1 (security + review + tester) after Wave B1:

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Service worker cached authenticated HTML into Cache Storage; the `"/"` offline fallback was dead code | high | **Wave A‴** |
| 2 | `authErrorMessage()` resolved `constructor` / `__proto__` through the prototype chain → React crash on `/login?error=constructor` | high | **Wave A‴** |
| 3 | No rate limiting on `login()` | medium | **Wave A‴** — durable lockout in the `settings` table |
| 4 | `setupPasscode()` check-then-insert race could create two users | medium | **Wave A‴** |
| 5 | `ensureSeedData()` opened a write transaction on every authenticated render | medium | **Wave A‴** |
| 6 | A too-long passcode was reported with the `too-short` message | medium | **Wave A‴** |
| 7 | The production DB guard only rejected URLs starting with `file:`; a bare relative path slipped through | medium | **Wave A‴** |
| 8 | `getTransactions()` `limit`/`offset` unvalidated — `LIMIT -1` returned every row, `LIMIT 2.5` threw | medium | **Wave Q** |
| 9 | `getMonthlyTotals()` `months` unbounded — a huge value looped for a billion iterations | medium | **Wave Q** |
| 10 | `getCategoryTotals()` compared a category *kind* against a transaction *type* | medium | **Wave Q** |
| 11 | `AccountBalance` had no `isLiability`, so the dashboard re-queried the account to render "owed" | medium | **Wave Q** |
| 12 | The same date helpers were implemented twice (`queries.ts` and the dashboard) | low | **Wave Q** — extracted to `lib/dates.ts` |
| 13 | Spec said "every action calls `requireSession()`" and "revalidatePath()", but setup/login are pre-auth and no action revalidates | low | **Spec amended** |
| 14 | `formatPeso` divides centavos by 100 (float math) | low | **Accepted** — the money rules prescribe exactly this, and it only diverges above ~2⁴⁷ centavos |
| 15 | No `import "server-only"` on the DB client | low | **Accepted** — would add a dependency; the `typeof window` guard already fails loudly |
| 16 | CSP allows `'unsafe-inline'` | low | **Accepted** — nonces need `proxy.ts` and force dynamic rendering; documented in the spec |
| 17 | `getDb()` / `Db` exported but unused | low | **Accepted** — `getDb` is a legitimate accessor and `tests/db-client-guard.test.ts` pins its export |
| 18 | The `users` table is not a singleton at the schema level (random-UUID PK), so two concurrent setups create two users; `getCurrentUser()`'s unordered `limit(1)` then returns an arbitrary one | medium | **Wave A‴ follow-up** — deterministic PK |
| 19 | The production guard was case-sensitive: `FILE:/path/x.db` bypassed it, because libsql lowercases the scheme internally | medium | **Wave A‴** — closed by the scheme allowlist; verify the comparison is case-insensitive |
| 20 | No `app/error.tsx` / `app/global-error.tsx` — a production misconfiguration surfaces as a bare `Internal Server Error` with no app chrome | low | **Wave B2** |

## Decisions taken by the orchestrator

- **Liability sign convention** — balances are signed; a liability is negative when money is owed; net worth = the sum of every account balance; the UI shows a liability as a magnitude with an "owed" label. Written into `ARCHITECTURE.md`.
- **Thousands separators must be well formed** — groups of exactly three digits, first group one to three. A malformed grouping (`1,23`, `1234,567`) is rejected, never silently reinterpreted. Written into `ARCHITECTURE.md`.
- **Seeding is independent per table** — accounts gate on `accounts`, categories on `categories`. Written into `ARCHITECTURE.md`.
- **Category totals are type-driven** — a transaction belongs to a breakdown by its own `type`; the category only decides how it is *grouped*. A `NULL` category is grouped under **Uncategorized** so uncategorised spending is never lost from a breakdown. The kind→direction mapping is an exhaustive `Record`, so a new `CategoryKind` is a compile error rather than a silently empty breakdown. Written into `ARCHITECTURE.md`.
- **Paging semantics** — supplying `offset` implies pagination; a default page size of **50** is assumed when the caller paginates without naming a limit. Omitting both returns every row, as before. SQLite rejects `OFFSET` without `LIMIT`, so the old behaviour was a 500.
- **Service worker policy** — never cache navigations; cache only `/_next/static/`, `/icons/`, `/icon.svg`, `/manifest.webmanifest`; honour `Cache-Control: no-store`; fall back to a static `public/offline.html`; purge every cache on activate.
- **Production database guard** — production requires `libsql://`, `https://` or `wss://`; `file:` and bare relative paths are rejected; the whole guard is skipped during `next build` (`NEXT_PHASE === "phase-production-build"`). `MONE_MONI_ALLOW_LOCAL_DB=1` is an explicit opt-in that allows a local file, for local production-mode verification only.

## Environment

| Variable | Dev | Production |
| --- | --- | --- |
| `DATABASE_URL` | `file:./local.db` (default when unset) | `libsql://<db>.turso.io` |
| `DATABASE_AUTH_TOKEN` | empty | Turso auth token |
| `MONE_MONI_ALLOW_LOCAL_DB` | unset | unset — only for local `next start` |

```bash
npm run dev
npm run typecheck
npm test
npm run db:generate && npm run db:migrate
```

## Next.js 16 notes (this version is not the Next.js you know)

Read the guides in `node_modules/next/dist/docs/` before writing Next code — `AGENTS.md` at the repo root is generated by `next dev` and says the same thing.

- `params`, `searchParams`, `cookies()`, `headers()` are **async** — always `await` them.
- `revalidateTag` now requires a second `cacheLife` argument; the single-argument form is deprecated and is a type error. `updateTag` is the Server-Action replacement but only affects **tagged cached data** — this app has none, so `revalidatePath(path, type?)` is the right tool and its signature is unchanged.
- `middleware.ts` was renamed `proxy.ts` (Node.js runtime only).
- Turbopack is the default builder; dev output goes to `.next/dev`, so dev and build can run concurrently.
- `next lint` was removed and the build no longer lints. **`npm run typecheck` is the gate.**
- `cacheComponents` / `partialPrefetching` are **opt-in and we do not enable them**, so direct DB reads in Server Components stay dynamic — correct for live financial data.
- `await connection()` is the current way to force per-request rendering; `export const dynamic = "force-dynamic"` is the older form.
- **Error boundary props are `{ error, retry }`** — *not* `reset`. `retry()` re-fetches and re-renders the boundary's children; `reset()` clears the error state without re-fetching. The docs recommend `retry()`.
- `error.tsx` does **not** wrap the `layout.tsx` of its own segment — an error thrown by the root layout is caught by `global-error.tsx`, which must render its own `<html>` and `<body>` and gets no global styles.
- Server Actions take extra arguments through `.bind(null, id)` (documented in the forms guide) — use it to pass a record id from the URL instead of trusting a hidden form field.

## Decisions locked with the user

Web app / PWA · Turso hosted SQLite · single-user passcode auth · Vercel deploy · Next.js + Drizzle · PHP only (schema keeps a `currency` column so USD is additive later) · simple UI that ships minimal JavaScript (Server Components, hand-rolled SVG charts, no chart library).

Also: TypeScript is pinned to **5.9.3, not 7.0.2** — TS 7 is too new for the drizzle-kit and lint toolchain.
