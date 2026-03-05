#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
SERVER_PID=""
DEFAULT_SMOKE_OWNER_EMAIL="fazli@hairtpclinic.com"
DEFAULT_SMOKE_OWNER_PASSWORD="ArcanaPilot!2026"
DEFAULT_SMOKE_TENANT_ID="hair-tp-clinic"

SMOKE_OWNER_EMAIL="${LOCAL_SMOKE_OWNER_EMAIL:-${ARCANA_OWNER_EMAIL:-$DEFAULT_SMOKE_OWNER_EMAIL}}"
SMOKE_OWNER_PASSWORD_CANDIDATE="${LOCAL_SMOKE_OWNER_PASSWORD:-${ARCANA_OWNER_PASSWORD:-$DEFAULT_SMOKE_OWNER_PASSWORD}}"
if [[ "${#SMOKE_OWNER_PASSWORD_CANDIDATE}" -lt 10 ]]; then
  echo "⚠️ Ogiltigt owner-lösenord för smoke (minst 10 tecken krävs). Använder säkert smoke-default."
  SMOKE_OWNER_PASSWORD="$DEFAULT_SMOKE_OWNER_PASSWORD"
else
  SMOKE_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD_CANDIDATE"
fi
SMOKE_OWNER_MFA_SECRET="${LOCAL_SMOKE_OWNER_MFA_SECRET:-${ARCANA_OWNER_MFA_SECRET:-}}"
SMOKE_OWNER_MFA_CODE="${LOCAL_SMOKE_OWNER_MFA_CODE:-${ARCANA_OWNER_MFA_CODE:-}}"
SMOKE_TENANT_ID="${LOCAL_SMOKE_TENANT_ID:-${ARCANA_DEFAULT_TENANT:-$DEFAULT_SMOKE_TENANT_ID}}"

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${EXISTING_PID}" ]]; then
  echo "⚠️ Stoppar befintlig process på port ${PORT} (pid ${EXISTING_PID})"
  kill "${EXISTING_PID}" >/dev/null 2>&1 || true
  sleep 1
fi

echo "▶️ Startar Arcana lokalt..."
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
node server.js >/tmp/arcana-dev.log 2>&1 &
SERVER_PID="$!"

READY=0
for _ in $(seq 1 40); do
  if curl -sf "http://localhost:${PORT}/readyz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [[ "${READY}" -ne 1 ]]; then
  echo "❌ Servern svarade inte på port ${PORT}."
  echo "--- /tmp/arcana-dev.log ---"
  cat /tmp/arcana-dev.log || true
  exit 1
fi

echo "✅ Server uppe. Kör smoke-test..."
BASE_URL="http://localhost:${PORT}" \
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_OWNER_MFA_SECRET="$SMOKE_OWNER_MFA_SECRET" \
ARCANA_OWNER_MFA_CODE="$SMOKE_OWNER_MFA_CODE" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
bash ./scripts/smoke-template.sh

echo "✅ Klart."
