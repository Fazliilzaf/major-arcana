#!/usr/bin/env bash
# sync-cache-busters.sh
# Synkar alla ?v=... i public/major-arcana-preview/index.html till samma värde.
# Värdet är git short-hash av senaste commit på HEAD, prefixed med "build-".
#
# Kör manuellt innan push, eller från npm-script:
#   npm run sync-cache-busters

set -e

cd "$(dirname "$0")/.."

INDEX="public/major-arcana-preview/index.html"

if [ ! -f "$INDEX" ]; then
  echo "❌ $INDEX hittades inte"
  exit 1
fi

# Generera build-tag från git short-hash. Om git inte är tillgängligt eller HEAD
# saknas, använd timestamp som fallback.
if BUILD_HASH=$(git rev-parse --short HEAD 2>/dev/null); then
  BUILD_TAG="build-${BUILD_HASH}"
else
  BUILD_TAG="build-$(date +%Y%m%d-%H%M%S)"
fi

# Räkna före
BEFORE=$(grep -oE '\?v=[^"]+' "$INDEX" | sort -u | wc -l | tr -d ' ')
TOTAL=$(grep -oE '\?v=[^"]+' "$INDEX" | wc -l | tr -d ' ')

# Ersätt alla ?v=... oavsett värde med ?v=$BUILD_TAG
perl -i -pe 's/\?v=[A-Za-z0-9._-]+/?v='"$BUILD_TAG"'/g' "$INDEX"

# Räkna efter
AFTER=$(grep -oE '\?v=[^"]+' "$INDEX" | sort -u | wc -l | tr -d ' ')

echo "✓ Synkade $TOTAL cache-busters i $INDEX"
echo "  Före:  $BEFORE unika versioner"
echo "  Efter: $AFTER unik version → ?v=$BUILD_TAG"
