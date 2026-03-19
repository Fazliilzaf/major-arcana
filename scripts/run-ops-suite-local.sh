#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3310}"
STRICT="${OPS_SUITE_LOCAL_STRICT:-true}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
WARMUP_REQUESTS="${OPS_SUITE_LOCAL_WARMUP_REQUESTS:-40}"
BACKFILL_RELEASE_REVIEWS="${OPS_SUITE_LOCAL_BACKFILL_RELEASE_REVIEWS:-false}"
BACKFILL_REVIEW_RUNS="${OPS_SUITE_LOCAL_BACKFILL_REVIEW_RUNS:-2}"
SERVER_PID=""

to_positive_int() {
  local raw="${1:-}"
  local fallback="${2:-1}"
  if [[ "${raw}" =~ ^[0-9]+$ ]] && [[ "${raw}" -gt 0 ]]; then
    echo "${raw}"
    return 0
  fi
  echo "${fallback}"
}

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

echo "▶️ Startar Arcana lokalt på port ${PORT}..."
PORT="${PORT}" node server.js >/tmp/arcana-ops-suite-local.log 2>&1 &
SERVER_PID="$!"

READY=0
for _ in $(seq 1 80); do
  if curl -sf "http://localhost:${PORT}/readyz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [[ "${READY}" -ne 1 ]]; then
  echo "❌ Servern svarade inte på port ${PORT}."
  echo "--- /tmp/arcana-ops-suite-local.log ---"
  cat /tmp/arcana-ops-suite-local.log || true
  exit 1
fi

BASE_URL="http://localhost:${PORT}"
WARMUP_REQUESTS="$(to_positive_int "${WARMUP_REQUESTS}" "40")"
BACKFILL_REVIEW_RUNS="$(to_positive_int "${BACKFILL_REVIEW_RUNS}" "2")"

if [[ "${BACKFILL_RELEASE_REVIEWS}" == "true" ]]; then
  echo "🩹 Backfillar release reviews (${BACKFILL_REVIEW_RUNS} körningar)..."
  for i in $(seq 1 "${BACKFILL_REVIEW_RUNS}"); do
    BASE_URL="${BASE_URL}" npm run release:cycle:auto:reuse -- --no-launch --review-now --no-reality-audit-now --no-fail-on-gate >/tmp/arcana-release-backfill-local.log 2>&1 || true
  done
fi

if [[ "${WARMUP_REQUESTS}" -gt 0 ]]; then
  echo "🔥 Värmer metrics (${WARMUP_REQUESTS} requests)..."
  for _ in $(seq 1 "${WARMUP_REQUESTS}"); do
    curl -sf "${BASE_URL}/api/public/clinics/${TENANT_ID}" >/dev/null 2>&1 || true
  done
fi

if [[ "${STRICT}" == "true" ]]; then
  echo "✅ Server uppe. Kör strict ops-suite mot ${BASE_URL}..."
  BASE_URL="${BASE_URL}" npm run ops:suite:strict -- --base-url "${BASE_URL}" "$@"
else
  echo "✅ Server uppe. Kör ops-suite mot ${BASE_URL}..."
  BASE_URL="${BASE_URL}" npm run ops:suite -- --base-url "${BASE_URL}" "$@"
fi
