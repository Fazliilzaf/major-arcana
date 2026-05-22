#!/usr/bin/env bash
# En-klicks lokal dev (CMO fixture + offline). Kör: bash scripts/start-dev-local.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3100}"

echo "▶ Stänger ev. gammal process på port ${PORT}..."
if PID="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"; then
  kill "$PID" 2>/dev/null || true
  sleep 1
fi

export PORT
export ARCANA_AI_PROVIDER=fallback
export ARCANA_GRAPH_READ_ENABLED=false
export ARCANA_GRAPH_SEND_ENABLED=false
export ARCANA_OWNER_EMAIL="${ARCANA_OWNER_EMAIL:-fazli@hairtpclinic.com}"
export ARCANA_OWNER_PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
export ARCANA_DEFAULT_TENANT="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
export ARCANA_MARKETING_CONNECTORS_ENABLED=true
export ARCANA_MARKETING_CONNECTORS_MODE=fixture
export ARCANA_MARKETING_CONNECTORS_LIVE_FETCH=false
export ARCANA_MARKETING_GOOGLE_ADS_ENABLED=true
export ARCANA_MARKETING_META_ENABLED=true
export ARCANA_MARKETING_LINKEDIN_ENABLED=true

echo "▶ Startar Arcana på http://localhost:${PORT}/admin"
echo "   CMO → Connectors → Uppdatera status (förväntat: ok: 3)"
echo "   Avsluta med Ctrl+C"
echo ""

exec node server.js
