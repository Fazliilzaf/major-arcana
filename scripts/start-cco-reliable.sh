#!/usr/bin/env bash
# Beständig lokal CCO-preview.
# Kör servern i en RESTART-LOOP så den aldrig försvinner tyst (om den dör
# startar den om). Kör i DIN terminal (inte som bakgrundsjobb):
#   bash scripts/start-cco-reliable.sh
# Stoppa med Ctrl+C.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Node 20 via nvm om tillgängligt
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  nvm use 20 >/dev/null 2>&1 || true
fi

# Döda gamla/port-blockerande instanser (start-guarden i server.js gör det,
# men frigör porten först så vi aldrig hamnar i EADDRINUSE).
if ! command -v lsof >/dev/null 2>&1; then
  echo "⚠ lsof saknas — installera (brew install lsof) eller döda :3100 manuellt."
fi
lsof -tiTCP:3100 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

export PORT=3100
export ARCANA_AI_PROVIDER=fallback
export ARCANA_GRAPH_READ_ENABLED=false
export ARCANA_GRAPH_SEND_ENABLED=false

# Rensa vid Ctrl+C och sluta loopen.
trap 'echo; echo "▶ Stoppad."; exit 0' INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CCO Local Preview — RESTART-LOOP (pålitlig)"
echo "  URL:  http://localhost:3100/major-arcana-preview/"
echo "  Stop: Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

while true; do
  node server.js
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "⚠ Servern avslutades (kod $code) — startar om om 2 s. Ctrl+C för att stoppa."
  fi
  sleep 2
done
