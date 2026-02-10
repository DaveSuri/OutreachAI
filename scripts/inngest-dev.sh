#!/usr/bin/env bash
set -euo pipefail

if lsof -tiTCP:8288 -sTCP:LISTEN >/dev/null 2>&1 || lsof -tiTCP:50053 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Inngest dev already running on port 8288/50053. Reusing existing instance."
  exit 0
fi

INNGEST_DEV_URL="${INNGEST_DEV_URL:-http://localhost:3000/api/inngest}"
exec npx --yes inngest-cli@latest dev -u "$INNGEST_DEV_URL"
