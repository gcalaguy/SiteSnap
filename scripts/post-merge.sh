#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply any pending migration SQL files directly (idempotent, no interactive prompts).
# Each file uses IF NOT EXISTS / IF EXISTS guards so re-running is safe.
MIGRATIONS_DIR="lib/db/migrations"
if [ -d "$MIGRATIONS_DIR" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$f" ] || continue
    echo "Applying migration: $f"
    # drizzle uses --> statement-breakpoint as a delimiter; strip it so psql sees plain SQL
    sed 's/--> statement-breakpoint/;/g' "$f" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
  done
fi
