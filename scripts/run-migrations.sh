#!/bin/bash
# Apply Drizzle migrations to Turso database.
#
# Usage:
#   ./scripts/run-migrations.sh
#
# Sets DATABASE_URL and DATABASE_AUTH_TOKEN from environment, then runs drizzle-kit push.

set -e

# Check for required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set."
  echo "Usage: DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' ./scripts/run-migrations.sh"
  exit 1
fi

if [ -z "$DATABASE_AUTH_TOKEN" ]; then
  echo "Error: DATABASE_AUTH_TOKEN environment variable is not set."
  echo "Usage: DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' ./scripts/run-migrations.sh"
  exit 1
fi

echo "Applying migrations to Turso..."
echo "Database: $DATABASE_URL"

npx drizzle-kit push

echo "✓ Migrations applied successfully!"
