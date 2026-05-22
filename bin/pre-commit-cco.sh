#!/usr/bin/env bash
# pre-commit-cco.sh
# Validerar CCO-preview-filer innan commit.
# Aktivera som git hook:
#   ln -s "../../bin/pre-commit-cco.sh" .git/hooks/pre-commit
# eller via husky/lint-staged.
#
# Exit 0 = OK, exit !=0 = blockera commit.

set -e

# Hitta repo-root (fungerar både när scriptet körs direkt och som git hook)
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/..")"
cd "$REPO_ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILED=0

echo "→ pre-commit checks..."

# 1. Syntax-check på alla JS-filer i preview
echo "  [1/3] JS syntax-check..."
JS_FILES=$(find public/major-arcana-preview -maxdepth 1 -type f -name "*.js" 2>/dev/null)
if [ -z "$JS_FILES" ]; then
  echo -e "${YELLOW}  ⚠ Inga JS-filer hittades (kontrollera CWD: $(pwd))${NC}"
  FAILED=1
else
  for f in $JS_FILES; do
    if ! node --check "$f" 2>/dev/null; then
      echo -e "${RED}  ✗ Syntax-fel i $f${NC}"
      node --check "$f" || true
      FAILED=1
    fi
  done
  [ $FAILED -eq 0 ] && echo -e "${GREEN}  ✓ Alla JS-filer syntaxkontrollerade${NC}"
fi

# 2. Cache-busters synkade
echo "  [2/3] Cache-busters..."
if bash bin/check-cache-busters.sh > /dev/null 2>&1; then
  echo -e "${GREEN}  ✓ Cache-busters synkade${NC}"
else
  echo -e "${YELLOW}  ⚠ Cache-busters EJ synkade — kör 'npm run sync-cache-busters'${NC}"
  bash bin/check-cache-busters.sh || FAILED=1
fi

# 3. Brackets balanserade i cco-polish.css (vanlig fel efter manuell edit)
echo "  [3/4] CSS bracket-balance..."
OPEN=$(grep -c '{' public/major-arcana-preview/cco-polish.css)
CLOSE=$(grep -c '}' public/major-arcana-preview/cco-polish.css)
if [ "$OPEN" -ne "$CLOSE" ]; then
  echo -e "${RED}  ✗ Obalanserade brackets i cco-polish.css: $OPEN vs $CLOSE${NC}"
  FAILED=1
else
  echo -e "${GREEN}  ✓ Brackets balanserade ($OPEN/$CLOSE)${NC}"
fi

# 4. Critical server.js mountings — booking-engine + post-op-review.
# Bakgrund: 2026-05-19 skrev en Cursor-commit (Fas 27E, d82d515) över
# server.js från en gammal snapshot och tog bort publicBookingEngine-
# mountingen. /api/public/booking-engine/* började returnera 404 i
# production → hairtpclinic.com booking-flow degradede silent till
# Cliento mock. Denna check fångar samma sak innan commit.
echo "  [4/4] server.js mounts (booking-engine + post-op-review)..."
SERVER_FAIL=0
require_pattern() {
  local file=$1
  local pattern=$2
  local label=$3
  local min_count=${4:-1}
  local found
  found=$(grep -cE "$pattern" "$file" || true)
  if [ "$found" -lt "$min_count" ]; then
    echo -e "${RED}  ✗ server.js saknar: $label (matchade $found gånger, behöver $min_count)${NC}"
    SERVER_FAIL=1
  fi
}
if [ -f server.js ]; then
  # require + app.use för booking-engine = 2 träffar minst
  require_pattern server.js "createPublicBookingEngineRouter" "publicBookingEngine require + mount" 2
  require_pattern server.js "createPostOpReviewRouter" "post-op-review require + mount" 2
fi
if [ $SERVER_FAIL -eq 0 ]; then
  echo -e "${GREEN}  ✓ server.js har kritiska mountings${NC}"
else
  echo -e "${YELLOW}  Hint: läs docs/strategy/web-to-arcana-bridge.md innan du rör server.js${NC}"
  FAILED=1
fi

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ pre-commit OK${NC}"
  exit 0
else
  echo -e "${RED}✗ pre-commit FAILED — fixa fel innan commit${NC}"
  exit 1
fi
