#!/usr/bin/env bash
# En-klicks lokal dev (CMO fixture + offline). Kör: npm run dev:local
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"


# ── Döda ALLA föräldralösa instanser av DENNA server (ej bara :3100-hållare) ──
# En gammal server som förlorat porten (t.ex. efter minne-vakt-omstart) blir kvar
# och ackumuleras. Döda alla node-server.js med samma arbetskatalog som detta repo.
REPO_CWD="$(pwd)"
STALE_PIDS=""
while read -r pid args; do
  [ -z "$pid" ] && continue
  [ "$pid" = "$$" ] && continue
  case "$args" in
    *node*server.js*) ;;
    *) continue ;;
  esac
  cwd="$(lsof -p "$pid" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" || true
  if [ -n "$cwd" ] && [ "$cwd" = "$REPO_CWD" ]; then
    STALE_PIDS="$STALE_PIDS $pid"
  fi
done < <(ps -e -o pid=,args= 2>/dev/null)

if [ -n "$STALE_PIDS" ]; then
  echo "⚠  Dödar gamla CCO-server-instanser:${STALE_PIDS}"
  # shellcheck disable=SC2086
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 1
fi

PORT=3100
PUBLIC_BASE_URL=http://localhost:3100

echo "▶ Stänger ev. gammal process på port ${PORT}..."
if PID="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"; then
  kill -9 $PID 2>/dev/null || true
  sleep 1
fi

export PORT
export PUBLIC_BASE_URL
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
export ARCANA_MARKETING_MAIL_ENABLED="${ARCANA_MARKETING_MAIL_ENABLED:-true}"

echo "▶ Startar Arcana på http://localhost:${PORT}/admin"
echo "   CMO → Connectors → Uppdatera status (förväntat: ok: 4, mail fixture)"
echo "   Avsluta med Ctrl+C"
echo ""

exec node server.js
