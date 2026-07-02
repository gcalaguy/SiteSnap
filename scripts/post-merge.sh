#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Apply schema changes to the database (idempotent — drizzle push compares
# the current schema against the live DB and only applies the diff).
pnpm --filter @workspace/db run push

# Rebuild the API server so the running process picks up source changes.
pnpm --filter api-server run build
