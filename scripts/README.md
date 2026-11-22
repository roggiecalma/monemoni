# Apply Migrations to Turso

This script applies the Drizzle migrations to your Turso database.

## Prerequisites

1. **Turso database URL** - Get this from [Turso Dashboard](https://app.turso.io/):
   - Go to your database
   - Copy the **Connection URL** (looks like `libsql://your-db.turso.io:8080`)

2. **Turso Auth Token** - Get this from [Turso Dashboard](https://app.turso.io/):
   - Go to your database
   - Copy the **Auth Token** (long string starting with `eyJ...`)

## Usage

### Option 1: Using the shell script (recommended)

```bash
DATABASE_URL="libsql://your-db.turso.io:8080" \
DATABASE_AUTH_TOKEN="your-turso-token" \
./scripts/run-migrations.sh
```

### Option 2: Using Node.js script

```bash
DATABASE_URL="libsql://your-db.turso.io:8080" \
DATABASE_AUTH_TOKEN="your-turso-token" \
node scripts/migrate-turso.mjs
```

### Option 3: Using drizzle-kit directly

```bash
export DATABASE_URL="libsql://your-db.turso.io:8080"
export DATABASE_AUTH_TOKEN="your-turso-token"
npx drizzle-kit push
```

## After applying migrations

1. **Redeploy to Vercel** (even without code changes):
   - Go to Vercel Dashboard → Your project → **Deployments**
   - Click **Redeploy** (or push to main again)

2. **Visit your site**:
   - First visit: You'll see the setup page (`/setup`) to create a passcode
   - Subsequent visits: You'll see the login page (`/login`)

## Troubleshooting

### "DATABASE_URL is not set"
- Make sure you set `DATABASE_URL` before running the script
- Check Vercel environment variables if deploying there

### "SQLITE_UNKNOWN: no such table: users"
- Migrations haven't been applied yet
- Run the migration script above

### "Connection refused" or timeout
- Check your Turso URL is correct
- Check your auth token is correct
- Check Turso database is not paused (some providers pause idle databases)

### Vercel still showing errors after migration
- Wait 1-2 minutes after migration for Vercel to pick up changes
- Redeploy from Vercel dashboard
- Check Vercel logs: Project → Deployments → Latest deployment → Logs
