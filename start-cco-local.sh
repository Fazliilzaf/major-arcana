#!/usr/bin/env bash
# start-cco-local.sh
# Startar lokal CCO-preview på http://localhost:3100/major-arcana-preview/
# Refresh tar 0.2s istället för 90s (Render-bygge).

set -e

cd "$(dirname "$0")"


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

# Färgkoder för terminal-output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  CCO Local Preview${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Kolla om port 3100 är ledig, annars döda gamla process
if lsof -ti:3100 >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠  Port 3100 upptagen — dödar gammal process...${NC}"
  lsof -ti:3100 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# Kolla att node_modules finns
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 node_modules saknas — kör npm install...${NC}"
  npm install
fi

echo -e "${GREEN}✓ Startar Express-server (offline-läge, ingen AI-kostnad)${NC}"
echo ""
echo -e "  URL:        ${CYAN}http://localhost:3100/major-arcana-preview/${NC}"
echo -e "  Refresh:    ${GREEN}Cmd+Shift+R${NC}  (force-reload utan cache)"
echo -e "  Stop:       ${YELLOW}Ctrl+C${NC}"
echo ""
echo -e "${YELLOW}Tips:${NC}"
echo -e "  • CSS/JS-ändringar syns direkt vid Cmd+Shift+R"
echo -e "  • DevTools → Network → Disable cache (när tab är öppen)"
echo -e "  • Ingen Render-deploy behövs förrän du vill pusha"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Starta servern i offline-läge (ingen AI, ingen Graph-API)
PORT=3100 \
ARCANA_AI_PROVIDER=fallback \
ARCANA_GRAPH_READ_ENABLED=false \
ARCANA_GRAPH_SEND_ENABLED=false \
node server.js
