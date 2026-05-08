#!/usr/bin/env bash
# check-cache-busters.sh
# Verifierar att alla ?v=... i public/major-arcana-preview/index.html har samma värde.
# Exit 0 om synkade, exit 1 annars.
#
# Användning i CI:
#   npm run check-cache-busters

set -e

cd "$(dirname "$0")/.."

INDEX="public/major-arcana-preview/index.html"

if [ ! -f "$INDEX" ]; then
  echo "❌ $INDEX hittades inte"
  exit 1
fi

UNIQUE=$(grep -oE '\?v=[^"]+' "$INDEX" | sort -u)
COUNT=$(echo "$UNIQUE" | wc -l | tr -d ' ')
TOTAL=$(grep -oE '\?v=[^"]+' "$INDEX" | wc -l | tr -d ' ')

if [ "$COUNT" -eq "1" ]; then
  echo "✓ Alla $TOTAL cache-busters synkade till: $UNIQUE"
  exit 0
else
  echo "❌ Cache-busters EJ synkade — $COUNT unika versioner:"
  echo "$UNIQUE" | sed 's/^/    /'
  echo ""
  echo "Kör 'npm run sync-cache-busters' för att fixa."
  exit 1
fi
