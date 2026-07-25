#!/bin/bash
set -e

# Allow new packages added by merged tasks to be installed.
# --frozen-lockfile fails when a task adds new dependencies that aren't yet
# in the local node_modules — use --no-frozen-lockfile so they resolve.
pnpm install --no-frozen-lockfile

# Apply schema changes to the database (idempotent — drizzle push compares
# the current schema against the live DB and only applies the diff).
pnpm --filter @workspace/db run push
