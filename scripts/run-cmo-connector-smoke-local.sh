#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${CMO_SMOKE_PORT:-3110}"
SERVER_PID=""
REMOTE_URL="${ARCANA_STAGING_URL:-https://arcana.hairtpclinic.com}"
REMOTE_URL="${REMOTE_URL%/}"

SMOKE_OWNER_EMAIL="${ARCANA_OWNER_EMAIL:-fazli@hairtpclinic.com}"
SMOKE_OWNER_PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
SMOKE_TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

fetch_bearer_token() {
  local base_url="$1"
  BASE_URL="${base_url%/}" \
  ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
  ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
  ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
  ARCANA_OWNER_MFA_SECRET="${ARCANA_OWNER_MFA_SECRET:-}" \
  ARCANA_OWNER_MFA_RECOVERY_CODE="${ARCANA_OWNER_MFA_RECOVERY_CODE:-}" \
  bash "$ROOT_DIR/scripts/extract-owner-token.sh"
}

wait_for_readyz() {
  local base_url="$1"
  local label="$2"
  local attempts="${3:-90}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf "${base_url}/readyz" 2>/dev/null | rg -q '"ready":true'; then
      echo "✅ ${label} readyz OK"
      return 0
    fi
    sleep 1
  done
  echo "⚠️ ${label} not ready at ${base_url}/readyz"
  return 1
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "▶️ Fas O — local HTTP connector smoke (port ${PORT})"
EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${EXISTING_PID}" ]]; then
  kill "${EXISTING_PID}" >/dev/null 2>&1 || true
  sleep 1
fi

PORT="$PORT" \
ARCANA_AI_PROVIDER=fallback \
ARCANA_GRAPH_READ_ENABLED=false \
ARCANA_GRAPH_SEND_ENABLED=false \
ARCANA_MARKETING_CONNECTORS_ENABLED=true \
ARCANA_MARKETING_CONNECTORS_MODE=fixture \
ARCANA_MARKETING_GOOGLE_ADS_ENABLED=true \
ARCANA_MARKETING_META_ENABLED=true \
ARCANA_MARKETING_LINKEDIN_ENABLED=true \
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
node server.js >/tmp/arcana-cmo-smoke.log 2>&1 &
SERVER_PID="$!"

LOCAL_BASE="http://localhost:${PORT}"
if ! wait_for_readyz "$LOCAL_BASE" "local server" 90; then
  echo "❌ Server not ready on ${PORT}"
  cat /tmp/arcana-cmo-smoke.log || true
  exit 1
fi
if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
  echo "❌ Server exited during startup"
  cat /tmp/arcana-cmo-smoke.log || true
  exit 1
fi

TOKEN="$(fetch_bearer_token "$LOCAL_BASE")"
echo "✅ Local auth token acquired"

ARCANA_SMOKE_BASE_URL="$LOCAL_BASE" \
ARCANA_SMOKE_TOKEN="$TOKEN" \
npm run smoke:cmo-connectors

echo ""
echo "▶️ Fas O — remote prod probe (${REMOTE_URL})"
if wait_for_readyz "$REMOTE_URL" "remote" 30; then
  route_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${REMOTE_URL}/api/v1/marketing/connectors/status" || true)"
  if [[ "$route_code" == "404" ]]; then
    echo "⚠️ marketing/connectors/status returns 404 — deploy latest main (5679cdc+) and rerun"
  elif [[ "$route_code" == "401" || "$route_code" == "403" ]]; then
    echo "✅ marketing route mounted (HTTP ${route_code} without auth)"
  else
    echo "ℹ️ marketing/connectors/status HTTP ${route_code}"
  fi

  if REMOTE_TOKEN="$(fetch_bearer_token "$REMOTE_URL" 2>/dev/null || true)" && [[ -n "$REMOTE_TOKEN" ]]; then
    echo "✅ remote auth OK — running HTTP connector smoke"
    ARCANA_SMOKE_BASE_URL="$REMOTE_URL" \
    ARCANA_SMOKE_TOKEN="$REMOTE_TOKEN" \
    npm run smoke:cmo-connectors
  else
    echo "⚠️ remote auth skipped — prod credentials/MFA differ from local (use GitHub secrets or ARCANA_OWNER_MFA_SECRET)"
  fi
fi

echo "✅ Fas O HTTP smoke complete"
