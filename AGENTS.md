# MoneMoni — Agent Quick-Start Guide

**What it is:** MoneMoni (Money Monitoring) — a personal finance tracking web app for Philippine pesos, deployed as a PWA. Single-user, single-passcode authentication. No bank connections — all data entered manually.

**Tech stack:** Next.js 16.4.6 (App Router) + React 19 + TypeScript 5.9.3 strict · Turso/libSQL SQLite via Drizzle ORM · Tailwind CSS v4 · Zod validation · bcryptjs auth · Vitest tests · Zero third-party client JS.

---

## Read These First (in order)

| File | When to read |
| --- | --- |
| `ARCHITECTURE.md` | **Always first.** Authoritative spec: data model, money rules, conventions. |
| This file | Project layout, patterns, commands, shortcuts, gotchas. |
| `HANDOFF.md` | Current wave status, security findings log, workflow details. |

## Orchestration Policy

When working on the main orchestrator model: do NOT write code or run tests yourself. Always delegate implementation to the `coder` subagent and testing to the `tester` subagent, looping up to 3 times until tester reports `PASS`.

## Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run typecheck    # Type-check gate (next lint was removed in Next.js 16)
npm test             # Run Vitest suite (currently ~139 tests)
npm run build        # Production build
npm run db:generate  # drizzle-kit generate (creates SQL files)
npm run db:migrate   # Apply migrations to local.db
```

## Database Workflow

- Local DB: `local.db` (gitignored). Default `DATABASE_URL= file:./local.db`.
- Production DB: Turso (`libsql://`). Set `DATABASE_URL=libsql://...` with `DATABASE_AUTH_TOKEN`.
- Schema source: `lib/db/schema.ts` — all 10 tables defined with Drizzle.
- Migration output: `drizzle/` directory. SQL files ready for pasting into Turso web console.
- Seed data: `lib/db/seed.ts` — `ensureSeedData()` inserts default accounts & categories idempotently.

### Tables (10 total)

| Table | PK | Notes |
| --- | --- | --- |
| `users` | text = `"user"` (fixed string, singleton) | password_hash only |
| `sessions` | text = sha256(token), 30-day TTL | user_id FK, expires_at index |
| `accounts` | UUID | cash/bank/ewallet/card types, liability flag |
| `categories` | UUID | income/expense kinds, icon + color |
| `transactions` | UUID | date/time/type/amount/category/account/note/recurring_id |
| `budgets` | UUID | category_id + month unique constraint |
| `recurring_bills` | UUID | name/amount/frequency/day_of_month/start/end/active |
| `savings_goals` | UUID | name/target_amount/target_date/color |
| `goal_contributions` | UUID | goal_id FK cascade-delete, date/amount/account |
| `settings` | text key (PK) | key-value store (throttle state etc.) |

## Architecture Principles

- **Server Components by default** — exactly one `"use client"` file in the entire tree: `components/pwa/ServiceWorkerRegistrar.tsx`.
- **All writes via Server Actions** in `lib/actions/*.ts` — pattern: `requireSession()` → Zod parse → DB write → redirect.
- **No `revalidatePath()` needed** — pages use post/redirect/get, read live from DB.
- **Money stored as INTEGER centavos** — never floats, never decimal strings. All parsing uses BigInt arithmetic.
- **Dates stored as TEXT** `YYYY-MM-DD` or `YYYY-MM` — not timestamps; timestamps only for audit columns.
- **Transactions are immutable** (append-only), can be deleted. **Accounts/categories archived, not deleted.**
- **Error codes → messages mapped via own-property lookups** (`Object.hasOwn`) — prototype chain attacks blocked.

## Project Layout

```
app/                          # Next.js App Router routes
  (app)/                      # Authenticated route group
    dashboard/page.tsx        # Net worth, monthly summary, balances, recent txns
    accounts/                 # List, new, edit (per account)
    categories/               # List, new, edit (per category)
    transactions/             # Ledger, new, edit (per transaction)
  setup/page.tsx              # First-run passcode creation
  login/page.tsx              # Passcode sign-in
  error.tsx / global-error.tsx  # Error boundaries
  loading.tsx                 # Skeleton placeholders
components/
  auth/AuthShell.tsx          # Login/setup frame with brand panel
  transactions/               # TransactionForm + TransactionTypeFields
  ui/icons.tsx                # 22 hand-picked inline SVG icons (no library)
  ui/primitives.tsx           # PageHeader, Field, ErrorNote, FormPanel, InlineNote
lib/
  db/schema.ts                # All 10 Drizzle table definitions + enum constants
  db/client.ts                # libSQL client + Drizzle instance (server-only guard)
  db/queries.ts               # getTransactions, getAccountBalances, getSummary, etc.
  db/seed.ts                  # ensureSeedData() + DEFAULT_ACCOUNTS / DEFAULT_CATEGORIES
  auth/session.ts             # createSession, getSession, destroySession, requireSession
  auth/password.ts            # bcrypt hash/verify, validatePassword (min 8, max 72 bytes)
  auth/errors.ts              # AUTH_ERROR_CODES map (own-property safety)
  auth/throttle.ts            # Exponential backoff lockout in settings table
  actions/auth.ts             # setupPasscode, login, logout Server Actions
  actions/accounts.ts         # createAccount, updateAccount, archive/restore
  actions/categories.ts       # createCategory, updateCategory, archive/restore
  actions/transactions.ts     # createTransaction, updateTransaction, deleteTransaction
  validation/                 # Pure validators + error helpers for forms
  money/parse.ts              # parsePesoToCentavos (BigInt-based, thousands-sep validated)
  money/format.ts             # formatPeso, formatPesoCompact, formatPercent, etc.
  dates.ts                    # monthKey, dateKey, lastDayOfMonth, todayKey (pure)
  ui.ts                       # Reusable Tailwind class constants
  nav.ts                      # NAV_ITEMS for sidebar navigation
tests/                        # Vitest suites (~139 tests)
scripts/                      # Icon generation, migration helpers, README
public/                       # sw.js, offline.html, PWA icons
drizzle/                      # Generated migration SQL files
```

## Routing Map

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Entry router — redirects to `/setup`, `/login`, or `/dashboard` |
| `/setup` | `app/setup/page.tsx` | First-run passcode creation |
| `/login` | `app/login/page.tsx` | Passcode sign-in |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Net worth, monthly summary, account balances, recent transactions |
| `/accounts` | `app/(app)/accounts/page.tsx` | Account list with balances |
| `/accounts/new` | `app/(app)/accounts/new/page.tsx` | Create new account |
| `/accounts/[id]/edit` | `app/(app)/accounts/[id]/edit/page.tsx` | Edit account (name, type, liability, balance) |
| `/categories` | `app/(app)/categories/page.tsx` | Income/expense category list |
| `/categories/new` | `app/(app)/categories/new/page.tsx` | Create new category |
| `/categories/[id]/edit` | `app/(app)/categories/[id]/edit/page.tsx` | Edit category (name, kind, icon, color) |
| `/transactions` | `app/(app)/transactions/page.tsx` | Transaction ledger with month/type filters |
| `/transactions/new` | `app/(app)/transactions/new/page.tsx` | New income/expense/transfer |
| `/transactions/[id]/edit` | `app/(app)/transactions/[id]/edit/page.tsx` | Edit/delete transaction |

## Patterns to Follow

### Server Action Pattern
```typescript
export async function action(id: string, formData: FormData) {
  const { user } = await requireSession();  // 1. Auth check
  const parsed = schema.parse(Object.fromEntries(formData));  // 2. Validate
  // 3. DB write
  await db.insert(...);
  return redirect('/target');  // 4. Redirect after success
}
```

### Money Handling
```typescript
// ALWAYS — store as centavos (integers)
const amountInCentavos = parsePesoToCentavos("1,234.50");  // Returns bigint-ish int
const display = formatPeso(amountInCentavos);  // "₱1,234.50"
```

### Queries
- Use helpers in `lib/db/queries.ts` rather than raw SQL when available.
- Pagination: omitting both `limit` and `offset` returns all rows. Supplying `offset` implies pagination with a default page size of 50.
- Transactions are filtered by `date`, `account_id`, `category_id`, and `type`.

### Validation
- Validators live in `lib/validation/*.ts` as pure functions returning `{ ok: boolean, errors? }`.
- Error codes map to human-readable messages via `lookupMessage()` in `lib/validation/errors.ts`.
- All lookups use `Object.hasOwn()` — never `obj[key]` alone.

### UI Primitives
Use components from `components/ui/primitives.tsx`: `PageHeader`, `Field` (labeled control), `ErrorNote`, `FormPanel`, `InlineNote`. Class constants from `lib/ui.ts` for consistent styling.

## Test Harness

```
tests/
  setup/
    global-setup.ts     # Creates fresh .tmp/test.db, applies migrations
    guard-db.ts         # Aborts if DATABASE_URL != test DB (prevents dev DB leaks)
    architecture.ts     # Parses ARCHITECTURE.md seed section vs actual seed data
  money.test.ts         # Peso parsing/formatting, round-trips
  auth.test.ts          # Session CRUD
  auth-errors.test.ts   # Error code → message mapping, prototype-chain safety
  actions-auth.test.ts  # setupPasscode, login, logout Server Actions
  actions-transactions.test.ts  # Transaction CRUD actions
  seed.test.ts          # Idempotent seeding verification
  queries.test.ts       # DB query helpers (limits, offsets, date ranges)
  db-client-guard.test.ts  # Runtime typeof window guard on client import
  validation-transactions.test.ts  # Form validation logic
```

Key notes:
- Tests use an isolated `.tmp/test.db` — your `local.db` is never touched.
- `fileParallelism: false` is required (shared SQLite). Do not change this.
- Run tests repeatedly — they must produce identical results every time.

## Security Notes

- CSP with `'unsafe-inline'` — documented trade-off (nonces would require `proxy.ts` middleware).
- Rate limiting: exponential backoff (2, 4, 8, 16, 30 min locks) persisted in `settings` table.
- Session cookie: `httpOnly`, `sameSite: lax`, `secure` in production, 30-day TTL.
- Password: bcrypt cost 10, max 72 bytes enforced.
- Production guard: rejects `file:` URLs unless `MONE_MONI_ALLOW_LOCAL_DB=1` is set.
- Prototype-safe lookups everywhere error codes are resolved.

## Next.js 16 Gotchas

- `params`, `searchParams`, `cookies()`, `headers()` are **async** — always `await` them.
- `revalidateTag` requires a second `cacheLife` argument. `updateTag` is the Server Action replacement.
- `middleware.ts` renamed to `proxy.ts` (Node.js runtime only).
- Turbopack is default builder; dev output goes to `.next/dev`.
- `next lint` removed — `npm run typecheck` is the gate.
- Error boundary props are `{ error, retry }` — NOT `reset`. Use `retry()` to re-fetch.
- Server Actions take extra args via `.bind(null, id)` — use to pass record IDs securely.
- `await connection()` forces per-request rendering; `export const dynamic = "force-dynamic"` is older.

## Dependencies (no bloat)

**Runtime:** next 16.4.6, react 19.3.1, @libsql/client 0.18.0, drizzle-orm 0.45.4, zod 4.6.7, bcryptjs 3.0.3
**Dev:** tailwindcss/tailwindcss-postcss 4.3.3, typescript 5.9.3, vitest 5.0.5, drizzle-kit 0.31.11

Zero icon libraries, zero chart libraries, zero form libraries.

## Current Status

See `HANDOFF.md` for wave progress tracker. Wave B2a completed (all CRUD + security hardening). Next: Wave C (recurring bills, budgets, savings goals, reports, charts, CSV export).
