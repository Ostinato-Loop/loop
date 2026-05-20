#!/usr/bin/env bash
# ============================================================
# Loop — Set Cloudflare Worker secrets from environment
# Run from repo root: bash scripts/setup-wrangler-secrets.sh
# ============================================================
set -euo pipefail

WORKER_DIR="artifacts/cloudflare-worker"

required_secrets=(
  SUPABASE_SERVICE_ROLE_KEY
  TERMII_API_KEY
  TERMII_SENDER_ID
  LOOP_JWT_SECRET
)

optional_secrets=(
  OPENROUTER_API_KEY
)

echo "🔐 Setting Loop Worker secrets..."

for secret in "${required_secrets[@]}"; do
  if [[ -z "${!secret:-}" ]]; then
    echo "❌  $secret is not set in environment. Aborting."
    exit 1
  fi
  echo "${!secret}" | (cd "$WORKER_DIR" && pnpm exec wrangler secret put "$secret")
  echo "✅  $secret set"
done

for secret in "${optional_secrets[@]}"; do
  if [[ -n "${!secret:-}" ]]; then
    echo "${!secret}" | (cd "$WORKER_DIR" && pnpm exec wrangler secret put "$secret")
    echo "✅  $secret set (optional)"
  else
    echo "⚠️   $secret skipped (not set)"
  fi
done

echo ""
echo "✅  All secrets pushed to Cloudflare Worker."
