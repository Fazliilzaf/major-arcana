#!/usr/bin/env bash
# verify-cco.sh
# Regression-test: startar lokal server och verifierar att CCO-preview funkar.
# Anropar curl mot kritiska endpoints och checkar att de svarar med rätt content.
#
# Användning:
#   bash bin/verify-cco.sh
#   npm run verify-cco
#
# Exit 0 = OK, exit 1 = regression upptäckt.

set -e

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/..")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PORT=3199 # avoid conflict with running dev server
URL="http://localhost:$PORT/major-arcana-preview/"
FAILED=0

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill -9 "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "→ verify-cco — regression-test"
echo ""

# Starta server i bakgrund
echo "  [1/8] Startar lokal server på port $PORT..."
PORT=$PORT \
ARCANA_AI_PROVIDER=fallback \
ARCANA_GRAPH_READ_ENABLED=false \
ARCANA_GRAPH_SEND_ENABLED=false \
node server.js > /tmp/verify-cco.log 2>&1 &
SERVER_PID=$!
sleep 3

if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo -e "${RED}  ✗ Server kraschade vid uppstart${NC}"
  cat /tmp/verify-cco.log | tail -20
  exit 1
fi
echo -e "${GREEN}  ✓ Server körs (PID $SERVER_PID)${NC}"

# Test 1: index.html svarar 200
echo "  [2/8] HTTP-status..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
if [ "$HTTP" = "200" ]; then
  echo -e "${GREEN}  ✓ index.html: HTTP $HTTP${NC}"
else
  echo -e "${RED}  ✗ index.html: HTTP $HTTP (förväntade 200)${NC}"
  FAILED=1
fi

# Test 2: Kritiska resurser laddas
echo "  [3/8] Kritiska resurser..."
for path in "design-tokens.css" "legacy-styles-loader.css" "cco-polish.css" "app.js"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}${path}")
  if [ "$STATUS" = "200" ]; then
    echo -e "${GREEN}  ✓ ${path}: HTTP $STATUS${NC}"
  else
    echo -e "${RED}  ✗ ${path}: HTTP $STATUS${NC}"
    FAILED=1
  fi
done

# Test 3: index.html innehåller data-build
echo "  [4/8] data-build attribut..."
if curl -s "$URL" | grep -q 'data-build="build-'; then
  BUILD=$(curl -s "$URL" | grep -oE 'data-build="[^"]+"' | head -1)
  echo -e "${GREEN}  ✓ ${BUILD}${NC}"
else
  echo -e "${RED}  ✗ data-build saknas på <html>${NC}"
  FAILED=1
fi

# Test 4: Cache-busters synkade
echo "  [5/8] Cache-busters..."
UNIQUE_VERSIONS=$(curl -s "$URL" | grep -oE '\?v=[^"]+' | sort -u | wc -l | tr -d ' ')
if [ "$UNIQUE_VERSIONS" = "1" ]; then
  VERSION=$(curl -s "$URL" | grep -oE '\?v=[^"]+' | head -1)
  echo -e "${GREEN}  ✓ Synkade till en version: ${VERSION}${NC}"
else
  echo -e "${RED}  ✗ ${UNIQUE_VERSIONS} unika versioner — kör 'npm run sync-cache-busters'${NC}"
  FAILED=1
fi

# Test 5: cco-polish.css innehåller @layer components
echo "  [6/8] @layer-arkitektur..."
if curl -s "${URL}cco-polish.css" | grep -q "@layer components"; then
  echo -e "${GREEN}  ✓ cco-polish.css i @layer components${NC}"
else
  echo -e "${RED}  ✗ cco-polish.css saknar @layer components${NC}"
  FAILED=1
fi
if curl -s "${URL}legacy-styles-loader.css" | grep -q "layer(legacy)"; then
  echo -e "${GREEN}  ✓ styles.css importerad i @layer legacy${NC}"
else
  echo -e "${RED}  ✗ legacy-styles-loader saknar layer(legacy)${NC}"
  FAILED=1
fi

# Test 6: !important borttagna från cco-polish.css
echo "  [7/8] Inga !important i cco-polish.css..."
COUNT=$(curl -s "${URL}cco-polish.css" | grep -c "!important" || true)
if [ "$COUNT" = "0" ]; then
  echo -e "${GREEN}  ✓ 0 !important${NC}"
else
  echo -e "${YELLOW}  ⚠ ${COUNT} !important kvar (regression?)${NC}"
fi

# Test 7: Proxy-state aktiv i app.js
echo "  [8/8] State-Proxy aktiv..."
if curl -s "${URL}app.js" | grep -q "__stateMutationStats"; then
  echo -e "${GREEN}  ✓ State-Proxy aktiv${NC}"
else
  echo -e "${RED}  ✗ State-Proxy saknas i app.js${NC}"
  FAILED=1
fi

echo ""
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ verify-cco PASSED — alla checks OK${NC}"
  exit 0
else
  echo -e "${RED}✗ verify-cco FAILED — ${FAILED} regression(er) upptäckta${NC}"
  echo ""
  echo "Server-loggar (sista 20 rader):"
  tail -20 /tmp/verify-cco.log
  exit 1
fi
