#!/usr/bin/env bash
# Fail fast on errors and unset variables during setup
set -euo pipefail

# Kill any stale process on the API port
fuser -k 8080/tcp 2>/dev/null || true

export NODE_ENV=development

# Hand off to the Node.js watcher — it builds, watches src/, and restarts the
# server automatically on every successful rebuild. No manual restart needed.
exec node ./dev.mjs
