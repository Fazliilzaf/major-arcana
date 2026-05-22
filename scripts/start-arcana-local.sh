#!/usr/bin/env bash
# Mac Studio / lokal admin-start. Kör: npm run start:local  eller  bash ~/start-arcana.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3100
ADMIN_URL="http://127.0.0.1:${PORT}/admin/cmo/connectors"

cd "${ROOT_DIR}"

if [[ ! -f "${ROOT_DIR}/package.json" ]]; then
  echo "❌ Hittar inte major-arcana i: ${ROOT_DIR}" >&2
  exit 1
fi

echo "▶ Repo: ${ROOT_DIR}"
echo "▶ Rensar port ${PORT}..."
if PID="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"; then
  kill -9 ${PID} 2>/dev/null || true
  sleep 1
fi

open_browser_when_ready() {
  for _ in $(seq 1 90); do
    if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/readyz" | grep -q '"ready":true'; then
      if command -v open >/dev/null 2>&1; then
        open "${ADMIN_URL}"
      fi
      echo "✅ Admin redo: ${ADMIN_URL}"
      echo "   (Inte http://127.0.0.1:${PORT}/ — det är patientchatten)"
      return 0
    fi
    sleep 2
  done
  echo "⚠️  Server svarade inte på /readyz inom 3 min — öppna manuellt: ${ADMIN_URL}" >&2
  return 1
}

open_browser_when_ready &
WATCHER_PID=$!

cleanup() {
  kill "${WATCHER_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▶ Startar npm run dev:local (lämna terminalen öppen, Ctrl+C avslutar)..."
exec npm run dev:local
