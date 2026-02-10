#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "${line// }" ]] && continue
      [[ "$line" =~ ^[[:space:]]*# ]] && continue

      if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
        local key="${BASH_REMATCH[1]}"
        local value="${BASH_REMATCH[2]}"

        if [[ -n "${!key:-}" ]]; then
          continue
        fi

        if [[ "$value" =~ ^\"(.*)\"$ ]]; then
          value="${BASH_REMATCH[1]}"
        elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
          value="${BASH_REMATCH[1]}"
        fi

        export "$key=$value"
      fi
    done < "$file"
  fi
}

load_env_file ".env"
load_env_file ".env.production"
load_env_file ".env.local"
load_env_file ".env.production.local"

echo "[1/6] Running production environment checklist"
node scripts/check-env.mjs --mode production

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "Missing VERCEL_TOKEN"
  exit 1
fi

if [[ ! -f ".vercel/project.json" ]]; then
  if [[ -z "${VERCEL_ORG_ID:-}" || -z "${VERCEL_PROJECT_ID:-}" ]]; then
    echo "Missing .vercel/project.json and VERCEL_ORG_ID/VERCEL_PROJECT_ID are not set"
    exit 1
  fi

  mkdir -p .vercel
  cat > .vercel/project.json <<EOF
{"orgId":"${VERCEL_ORG_ID}","projectId":"${VERCEL_PROJECT_ID}"}
EOF
  echo "Created .vercel/project.json from VERCEL_ORG_ID/VERCEL_PROJECT_ID"
fi

echo "[2/6] Deploying to Vercel production"
DEPLOY_OUTPUT="$(npx --yes vercel deploy --prod --yes --token "${VERCEL_TOKEN}" 2>&1)"
echo "${DEPLOY_OUTPUT}"

DEPLOY_URL="$(printf '%s\n' "${DEPLOY_OUTPUT}" | rg -o 'https://[^[:space:]]+' | tail -n 1)"
if [[ -z "${DEPLOY_URL}" ]]; then
  echo "Failed to parse deployment URL from Vercel output"
  exit 1
fi

echo "[3/6] Smoke testing production endpoint"
curl -fsS "${DEPLOY_URL}/api/inngest" >/dev/null
curl -fsS -u "${BASIC_AUTH_USERNAME}:${BASIC_AUTH_PASSWORD}" "${DEPLOY_URL}/api/stats" >/dev/null

EXPECTED_APP_URL="${APP_URL%/}"
if [[ "${EXPECTED_APP_URL}" != "${DEPLOY_URL}" ]]; then
  echo "Warning: APP_URL (${EXPECTED_APP_URL}) differs from Vercel URL (${DEPLOY_URL})"
  echo "Proceeding with APP_URL for webhook and Inngest checks."
fi

echo "[4/6] Configuring Resend webhook"
node scripts/configure-resend-webhook.mjs

echo "[5/6] Validating Inngest cloud endpoint"
node scripts/check-inngest-cloud.mjs

echo "[6/6] Deployment complete"
echo "Live URL: ${DEPLOY_URL}"
