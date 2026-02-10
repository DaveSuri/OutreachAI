#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cleanup() {
  if [[ -n "${DEV_PID:-}" ]]; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${INNGEST_PID:-}" ]]; then
    kill "$INNGEST_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

npm run dev &
DEV_PID=$!

npm run inngest:dev &
INNGEST_PID=$!

wait -n "$DEV_PID" "$INNGEST_PID"
