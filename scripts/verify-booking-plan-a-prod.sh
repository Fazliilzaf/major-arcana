#!/usr/bin/env bash
# Fas 5: snabb verify att publik booking-engine svarar (Plan A endpoints).
set -euo pipefail

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"

echo "== Booking Plan A prod verify =="
echo "BASE: $BASE"

CODE="$(curl -sS -o /tmp/booking_catalog.json -w '%{http_code}' \
  "${BASE}/api/public/booking-engine/catalog?tenantId=hair-tp-clinic" 2>/dev/null || echo 000)"

if [[ "$CODE" != "200" ]]; then
  echo "❌ catalog HTTP $CODE"
  exit 1
fi

COUNT="$(node -e "const j=require('/tmp/booking_catalog.json');console.log((j.services||j.catalog?.services||[]).length||0)")"
echo "✅ catalog HTTP 200 — services: $COUNT"

if [[ "$COUNT" -lt 1 ]]; then
  echo "⚠ Inga tjänster i catalog — seed Plan A i prod"
  exit 2
fi

echo "ℹ Full E2E: cco-booking-prod-readiness-checklist.md + webb → reservation"
