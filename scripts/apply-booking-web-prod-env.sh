#!/usr/bin/env bash
# Push Plan A booking-engine env till Vercel (hairtpclinic-web).
set -euo pipefail

WEB_DIR="${WEB_DIR:-$HOME/Code/hairtpclinic-web}"
ARCANA_BASE_URL="${ARCANA_BASE_URL:-https://arcana.hairtpclinic.se}"
ARCANA_PROVIDER="${ARCANA_PROVIDER:-booking-engine}"
ARCANA_BRAND_HOST="${ARCANA_BRAND_HOST:-hairtpclinic.com}"

if [[ ! -d "$WEB_DIR" ]]; then
  echo "❌ WEB_DIR saknas: $WEB_DIR"
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "❌ vercel CLI saknas — npm i -g vercel"
  exit 1
fi

cd "$WEB_DIR"

echo "== Apply booking-web prod env (Vercel) =="
echo "WEB_DIR=$WEB_DIR"
echo "ARCANA_BASE_URL=$ARCANA_BASE_URL"
echo "ARCANA_PROVIDER=$ARCANA_PROVIDER"
echo "ARCANA_BRAND_HOST=$ARCANA_BRAND_HOST"

set_env() {
  local key="$1"
  local value="$2"
  printf '%s' "$value" | vercel env add "$key" production --force 2>/dev/null || \
    printf '%s' "$value" | vercel env add "$key" production
}

set_env ARCANA_BASE_URL "$ARCANA_BASE_URL"
set_env ARCANA_PROVIDER "$ARCANA_PROVIDER"
set_env ARCANA_BRAND_HOST "$ARCANA_BRAND_HOST"

echo "✅ Vercel env uppdaterad — trigga deploy:"
echo "   cd $WEB_DIR && vercel --prod"
