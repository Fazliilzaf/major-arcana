#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3099}"
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
  echo "⚠️ Port ${PORT} upptagen — antar att server redan körs"
else
  echo "▶️ Startar offline Arcana på port ${PORT}..."
  PORT="$PORT" \
  ARCANA_AI_PROVIDER=fallback \
  ARCANA_GRAPH_READ_ENABLED=false \
  ARCANA_GRAPH_SEND_ENABLED=false \
  node server.js >/tmp/arcana-post-op-e2e.log 2>&1 &
  SERVER_PID="$!"

  for _ in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:${PORT}/readyz" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      echo "❌ Server start misslyckades"
      cat /tmp/arcana-post-op-e2e.log || true
      exit 1
    fi
    sleep 1
  done
fi

echo "▶️ Playwright post-op uppföljning..."
CCO_E2E_BASE_URL="http://127.0.0.1:${PORT}" \
  npx playwright test --config=tests/e2e/playwright.config.js tests/e2e/post-op-uppfoljning.spec.js --project=chromium

echo "✅ Playwright post-op PASS"
