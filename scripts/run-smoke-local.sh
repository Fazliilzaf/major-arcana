#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"
SERVER_PID=""

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
bash ./scripts/smoke-template.sh

echo "✅ Klart."
