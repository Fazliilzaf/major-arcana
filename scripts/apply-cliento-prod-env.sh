#!/usr/bin/env bash
# Cliento env på Render prod (merge PUT) — krävs när .com kör ARCANA_PROVIDER=cliento.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"

fail() { echo "❌ $1" >&2; exit 1; }
pass() { echo "✅ $1"; }

[[ -f .env ]] || fail "Saknar .env med CLIENTO_* keys"

node ./scripts/apply-cliento-prod-env.js

echo "Väntar på prod readyz..."
for attempt in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/readyz" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    pass "Prod readyz OK (försök $attempt)"
    break
  fi
  echo "  försök $attempt (readyz=$code)"
  sleep 10
  [[ "$attempt" -eq 60 ]] && fail "Prod readyz timeout"
done

ref_code="$(curl -sS -o /tmp/cliento-ref.json -w '%{http_code}' "${BASE}/api/public/cliento/ref-data?host=hairtpclinic.com")"
if [[ "$ref_code" != "200" ]]; then
  fail "Cliento ref-data HTTP $ref_code"
fi
if grep -q cliento_partner_id_missing /tmp/cliento-ref.json 2>/dev/null; then
  fail "Cliento ref-data saknar partner id — kontrollera Render env"
fi
pass "Cliento ref-data OK på prod"
