# MoneMoni — Architecture & Conventions

Personal finance app for Philippine pesos. Next.js App Router + Turso (hosted SQLite) via Drizzle ORM.

**Performance goal:** the UI must stay simple and fast. Prefer Server Components over client components, and hand-rolled server-rendered SVG charts over any client-side charting library. Pages should ship as close to zero JavaScript as possible.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.4.2 (App Router, React 19.3.1, Server Components) |
| Language | TypeScript 5.9.3, `strict: true` |
| Database | Turso / libSQL (`@libsql/client` 0.18.0) — hosted SQLite, local file in dev |
| ORM | Drizzle ORM 0.45.4 + drizzle-kit 0.31.11 (`dialect: "turso"`) |
| Styling | Tailwind CSS v4.3.3 (CSS only, no runtime) |
| Validation | Zod 4.6.7 |
| Password hashing | bcryptjs 3.0.3 (pure JS — no native build on Vercel) |
| Tests | Vitest 5.0.5 |

Do **not** add dependencies without a strong reason. Do not upgrade pinned versions.

---

## Money rules (critical)

- **All money is stored as an `INTEGER` number of centavos** (1/100 of a PHP peso). Never floats, never decimal strings, never pesos as a float.
- Amounts in the `transactions` table are always **positive**. Direction is expressed by `type`, not by sign.
- Formatting: `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })` → `₱1,234.56`.
- Parsing user input must be **string arithmetic, never float math** (`lib/money/parse.ts`).
- User input may contain thousands separators, but they must be **well formed**: groups of exactly three digits, with a first group of one to three digits (`1,234`, `1,234,567`). A malformed grouping (`1,23`, `1,2,3`, `1234,567`) is **rejected**, never silently reinterpreted as a different amount.
- The schema keeps a `currency` column defaulting to `"PHP"` so USD can be added later without a migration.

## Date rules

- Transaction and bill dates are stored as `TEXT` in `YYYY-MM-DD` form (a local calendar date, never a timestamp).
- Months are `TEXT` in `YYYY-MM` form.
- Timestamps that are not calendar dates (`created_at`, `updated_at`, `expires_at`) are `INTEGER` epoch milliseconds.

---

## Data model

All tables use `text` primary keys holding `crypto.randomUUID()`. Boolean columns are `integer({ mode: "boolean" })`.

**Exception — `users`.** The `users` table holds exactly one row for the whole install, so its primary key is the fixed string `"user"` instead of a UUID. A random UUID would let two concurrent setup submissions both insert, leaving the install with two users and no way to tell which passcode is the real one. A deterministic key turns the second insert into a primary-key violation, which the setup action recognises and reports as "already set up". `sessions.user_id` references it as usual.

| Table | Columns |
| --- | --- |
| `users` | `id`, `password_hash`, `created_at` |
| `sessions` | `id` (sha256 hex of the raw token), `user_id` → users, `created_at`, `expires_at` |
| `accounts` | `id`, `name`, `type` (`cash`\|`bank`\|`ewallet`\|`card`), `opening_balance`, `is_liability`, `archived`, `sort_order`, `created_at` |
| `categories` | `id`, `name`, `kind` (`income`\|`expense`), `icon`, `color`, `archived`, `sort_order`, `created_at` |
| `transactions` | `id`, `date`, `type` (`income`\|`expense`\|`transfer`), `amount`, `category_id`?, `account_id`, `to_account_id`?, `note`?, `recurring_id`?, `created_at`, `updated_at` |
| `budgets` | `id`, `category_id`, `month` (`YYYY-MM`), `amount` — unique on (`category_id`, `month`) |
| `recurring_bills` | `id`, `name`, `amount`, `category_id`, `account_id`, `frequency` (`weekly`\|`monthly`\|`yearly`), `day_of_month`, `start_date`, `end_date`?, `active`, `last_materialized` (`YYYY-MM`), `created_at` |
| `savings_goals` | `id`, `name`, `target_amount`, `target_date`?, `color`, `archived`, `created_at` |
| `goal_contributions` | `id`, `goal_id`, `date`, `amount`, `account_id`, `note`?, `created_at` |
| `settings` | `key` (PK), `value` |

Indexes: `transactions(date)`, `transactions(account_id)`, `transactions(category_id)`, `budgets(category_id, month)`.

### Semantics that must hold

- **Transfers are a single row**, not two. `type = "transfer"`, `account_id` is the source, `to_account_id` is the destination. Income/expense totals **exclude** transfers.
- **Account balance** = `opening_balance` + income − expense + transfers in − transfers out − goal contributions.
- **Goal contributions are separate from spending.** Money moved into a savings goal is set aside, not spent, so it must not appear in expense totals or category breakdowns.
- **`recurring_id`** links a generated transaction back to the bill that produced it.
- **Category totals are driven by the transaction's direction, not the category's kind.** A transaction belongs to the income or the expense breakdown according to its own `type`; the category only decides how it is *grouped*. A transaction with no category is grouped under **Uncategorized** within its own direction, so uncategorised spending is never lost from a breakdown. The mapping from a category kind to a transaction direction is exhaustive and type-checked, so adding a new kind is a compile error rather than a silently empty breakdown. A transaction whose category kind disagrees with its type is a data-integrity error — writes must reject it.
- **Archiving is a management concept, not a ledger concept.** Accounts and categories carry an `archived` flag. An archived record is hidden from the *pickers* (the dropdowns in the transaction form) and is listed separately on its management screen with a Restore button — but it stays in the ledger: it still holds a balance, still appears in totals, and a historic transaction still shows its name and colour. Archiving is the only removal operation for an account or a category; they are never hard-deleted, because transactions reference them.

### Liability sign convention

- A balance is a **signed** number of centavos, and the balance formula above is the only definition of it.
- A **liability** account (`is_liability = true`, e.g. a credit card) holds a **negative balance when money is owed**. Spending on the card makes the balance more negative; paying the card (a transfer *into* it) moves it back towards zero.
- The `opening_balance` of a liability is therefore **negative** (owing ₱5,000 → `-500000`). The *form* never asks the user to type a negative number: for a liability the field is labelled **"Amount owed"**, takes a positive amount, and the server negates it before storing. The stored value is always negative.
- **Net worth = the sum of every account balance**, liabilities included. Because a liability balance is negative, a liability reduces net worth.
- The UI shows a liability's balance as a magnitude with an **"owed"** label (e.g. `₱5,000.00 owed`), never as a bare negative amount; every calculation uses the signed value.

---

## Default seed data

Applied automatically on first run (`lib/db/seed.ts`). Accounts and categories are seeded **independently and idempotently**: each is inserted only while its own table is empty, so emptying one table can never duplicate the rows of the other.

**Accounts:** Cash Wallet (`cash`), BPI Bank (`bank`), GCash (`ewallet`), Maya (`ewallet`), Credit Card (`card`, `is_liability = true`).

**Expense categories** (name / icon / color): Food & Dining 🍔 `#f97316`, Groceries 🛒 `#84cc16`, Transportation 🚗 `#0ea5e9`, Bills & Utilities 💡 `#eab308`, Load & Data 📱 `#8b5cf6`, Healthcare 💊 `#ef4444`, Entertainment 🎬 `#ec4899`, Shopping 🛍️ `#14b8a6`, Family 👨‍👩‍👧 `#a855f7`, Education 📚 `#3b82f6`, Travel ✈️ `#06b6d4`, Gifts & Donations 🎁 `#f43f5e`, Others 📦 `#64748b`

**Income categories:** Salary 💼 `#22c55e`, 13th Month Pay 🎉 `#16a34a`, Commission 📈 `#0d9488`, Freelance 💻 `#2563eb`, Business Income 🏢 `#7c3aed`, Refunds ↩️ `#65a30d`, Others ➕ `#94a3b8`

---

## Authentication model

Single user. No signup, no email, no OAuth.

- If there is **no** row in `users`, the app is in **setup mode** and `/setup` renders a form to create the first passcode.
- Otherwise `/login` renders a passcode form.
- Password: minimum 8 characters, hashed with bcrypt (cost 10) via `bcryptjs`.
- Session: 32 random bytes (`crypto.randomBytes`) as base64url. Only the **sha256 hex** of the token is stored in `sessions`. Cookie `mm_session` is `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` in production, 30-day max age.
- `requireSession()` in `lib/auth/session.ts` redirects to `/login` when there is no valid session. **Every** Server Action must call it before touching data.

---

## Code conventions

- **Server Components by default.** Add `"use client"` only when genuinely needed — for example a form that must show an action's result without a page reload. Prefer plain HTML `<form>` elements with Server Actions over client-side fetch. Native HTML controls (`<input type="date">`, `<input type="color">`, `<select>`, `<details>`/`<summary>`) are server-renderable and need **no** client component.
- All writes go through **Server Actions** in `lib/actions/*.ts`. Each action: `requireSession()` → `zod` parse → DB write → `redirect()`.
  - `requireSession()` is required for **every** action that touches user data. The only exemptions are the two **pre-auth** actions — `setupPasscode` and `login` — which by definition run before a session can exist. They must never touch existing user data.
  - Actions finish with `redirect()` (post/redirect/get). Every page reads live from the database and the navigation uses plain `<a>` links rather than the client router, so there is no router cache to invalidate and `revalidatePath()` is not required. Call it if client-side navigation is ever introduced.
- Reads happen in Server Components, querying the DB directly.
- No `any`. No `@ts-ignore`. No non-null assertions on possibly-undefined values.
- Parse every user-entered amount with `parsePesoToCentavosSafe()` and branch on `result.ok`. **Never** test a parsed amount for truthiness — ₱0.00 is a valid amount and `0` is falsy.
- Tailwind utility classes only; no custom CSS beyond `app/globals.css` design tokens.
- Keep components small and server-rendered. Charts are plain SVG components in `components/charts/`.

### Accepted trade-offs

Decisions that are deliberate, so nobody re-litigates them later:

- **The Content-Security-Policy allows `'unsafe-inline'`** for scripts and styles, because Next.js injects inline bootstrap scripts. A nonce-based policy needs `proxy.ts` and forces every page to be dynamically rendered — too much for this app. The app renders no raw HTML and no user-controlled markup, so `'unsafe-inline'` is the smaller risk. Revisit if user-generated content is ever rendered.
- **`lib/db/client.ts` guards client imports with a runtime `typeof window` check**, not `import "server-only"`. The `server-only` package is not a dependency, the project does not add dependencies without a strong reason, and the runtime check already fails loudly on an accidental client import.
- **`formatPeso` divides centavos by 100** and lets `Intl.NumberFormat` do the formatting, which is what the money rules above prescribe. The result can differ by one centavo only above roughly 2⁴⁷ centavos (about ₱90 trillion), which no personal balance reaches.
- **A failed form loses what the user typed.** Server Actions return a value to the *client*, so a Server Component cannot read one without shipping JavaScript. Every form therefore uses post/redirect/get: a failure redirects to the form's own URL with `?error=<code>` and the page re-derives the message from a code → message map. The trade-off is that the submitted values are not preserved — the form comes back showing the last *saved* values. This is accepted because it keeps every page a pure Server Component, and because the error message names the field that needs fixing.

## Environment

| Variable | Dev | Production |
| --- | --- | --- |
| `DATABASE_URL` | `file:./local.db` (default when unset) | `libsql://<db>.turso.io` |
| `DATABASE_AUTH_TOKEN` | empty | Turso auth token |
| `MONE_MONI_ALLOW_LOCAL_DB` | unset | unset — `1` permits a local file in production, for local `next start` only |

`lib/db/client.ts` reads these once and exposes a Drizzle instance. The same code path works locally and in production.

**The production database guard.** Under `NODE_ENV=production` the URL must be present and must use a hosted scheme — `libsql://`, `https://` or `wss://`. A `file:` URL, a bare relative path or an absolute local path is rejected, because silently pointing production at a throwaway local file is how a user loses their data without noticing. The whole guard is skipped while `NEXT_PHASE === "phase-production-build"`, so `next build` succeeds without a database. `MONE_MONI_ALLOW_LOCAL_DB=1` is an explicit opt-in that relaxes the local-file rule for local production-mode verification; it must never be set on a real deployment, and it does **not** make a missing `DATABASE_URL` acceptable.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run db:generate  # generate migrations from schema
npm run db:migrate   # apply migrations
npm run db:push      # push schema directly (dev only)
npm run icons        # regenerate PWA PNG icons
```
