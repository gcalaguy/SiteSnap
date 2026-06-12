#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply schema changes to the database (idempotent — drizzle push compares
# the current schema against the live DB and only applies the diff).
pnpm --filter @workspace/db run push
