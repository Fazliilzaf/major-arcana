#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3100}"
SERVER_PID=""
SMOKE_STARTUP_TIMEOUT_SEC="${LOCAL_SMOKE_STARTUP_TIMEOUT_SEC:-${ARCANA_LOCAL_SMOKE_STARTUP_TIMEOUT_SEC:-90}}"
SMOKE_READY_TIMEOUT_SEC="${LOCAL_SMOKE_READY_TIMEOUT_SEC:-${ARCANA_LOCAL_SMOKE_READY_TIMEOUT_SEC:-120}}"
SMOKE_POLL_INTERVAL_SEC="${LOCAL_SMOKE_POLL_INTERVAL_SEC:-1}"
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
PORT="$PORT" \
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
node server.js >/tmp/arcana-dev.log 2>&1 &
SERVER_PID="$!"

HTTP_UP=0
STARTUP_POLLS=$(( SMOKE_STARTUP_TIMEOUT_SEC / SMOKE_POLL_INTERVAL_SEC ))
if [[ "${STARTUP_POLLS}" -lt 1 ]]; then
  STARTUP_POLLS=1
fi
for _ in $(seq 1 "${STARTUP_POLLS}"); do
  if curl -sf "http://localhost:${PORT}/healthz" >/dev/null 2>&1; then
    HTTP_UP=1
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    break
  fi
  sleep "${SMOKE_POLL_INTERVAL_SEC}"
done

if [[ "${HTTP_UP}" -ne 1 ]]; then
  echo "❌ Servern band inte port ${PORT} inom ${SMOKE_STARTUP_TIMEOUT_SEC}s."
  echo "--- /tmp/arcana-dev.log ---"
  cat /tmp/arcana-dev.log || true
  exit 1
fi

echo "✅ Servern svarar på port ${PORT}. Väntar på readyz..."

READY=0
READY_POLLS=$(( SMOKE_READY_TIMEOUT_SEC / SMOKE_POLL_INTERVAL_SEC ))
if [[ "${READY_POLLS}" -lt 1 ]]; then
  READY_POLLS=1
fi
for _ in $(seq 1 "${READY_POLLS}"); do
  if curl -sf "http://localhost:${PORT}/readyz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    break
  fi
  sleep "${SMOKE_POLL_INTERVAL_SEC}"
done

if [[ "${READY}" -ne 1 ]]; then
  echo "❌ Servern blev inte ready inom ${SMOKE_READY_TIMEOUT_SEC}s."
  echo "--- /readyz ---"
  curl -s "http://localhost:${PORT}/readyz" || true
  echo
  echo "--- /tmp/arcana-dev.log ---"
  cat /tmp/arcana-dev.log || true
  exit 1
fi

echo "✅ Server ready. Kör smoke-test..."
BASE_URL="http://localhost:${PORT}" \
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_OWNER_MFA_SECRET="$SMOKE_OWNER_MFA_SECRET" \
ARCANA_OWNER_MFA_CODE="$SMOKE_OWNER_MFA_CODE" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
bash ./scripts/smoke-template.sh

echo "✅ Klart."
