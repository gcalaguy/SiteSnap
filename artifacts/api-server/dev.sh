#!/usr/bin/env bash
# Fail fast on errors and unset variables during the setup phase
set -euo pipefail

# Kill any stale process on the API port
fuser -k 8080/tcp 2>/dev/null || true

export NODE_ENV=development

echo "[dev] Building API server..."
node ./build.mjs   # exits immediately if build fails (set -e is active here)

# Disable errexit before the restart loop so non-zero wait() doesn't abort
set +e

SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  exit 0
}

trap cleanup SIGTERM SIGINT

echo "[dev] Starting API server (auto-restart on crash enabled)..."
while true; do
  node --enable-source-maps ./dist/index.mjs &
  SERVER_PID=$!

  # Capture exit code directly — no ! operator so $? is the real child exit code
  wait "$SERVER_PID"
  EXIT_CODE=$?
  SERVER_PID=""

  # Exit codes from signals (SIGINT=130, SIGTERM=143) mean intentional stop
  if [ "$EXIT_CODE" -eq 0 ] || [ "$EXIT_CODE" -eq 130 ] || [ "$EXIT_CODE" -eq 143 ]; then
    echo "[dev] Server stopped cleanly (exit $EXIT_CODE)."
    break
  fi

  echo "[dev] Server crashed (exit $EXIT_CODE). Restarting in 2s..."
  sleep 2
done
