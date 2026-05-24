#!/usr/bin/env bash
# En-kommando prod-verify för CCO mobil pilot (Fas 5.5 + UX sweep).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

node "$ROOT_DIR/scripts/lib/wait-for-prod-ready.js" || exit 1

if [[ -f .env ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|OWNER_EMAIL|OWNER_PASSWORD|SMOKE_PATIENT_ID|DEFAULT_TENANT|PROD_URL)= ]] || continue
    export "$line"
  done < <(grep -E '^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|OWNER_EMAIL|OWNER_PASSWORD|SMOKE_PATIENT_ID|DEFAULT_TENANT|PROD_URL)=' .env 2>/dev/null || true)
fi

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
FAIL=0

section() { echo ""; echo "=== $1 ==="; }
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAIL=1; }

section "Unit — mobile UX sweep assets"
node --test tests/ops/ccoMobileUxSweep.test.js >/dev/null && pass "ccoMobileUxSweep.test.js" || fail "ccoMobileUxSweep.test.js"

section "Prod — mobil login + UI"
npm run verify:staff-mobile-login-prod && pass "verify:staff-mobile-login-prod" || fail "verify:staff-mobile-login-prod"
if npm run verify:staff-ui-prod; then
  pass "verify:staff-ui-prod"
else
  echo "↻ retry verify:staff-ui-prod …"
  if npm run verify:staff-ui-prod; then
    pass "verify:staff-ui-prod (retry)"
  else
    fail "verify:staff-ui-prod"
  fi
fi
npm run verify:staff-ui-desktop-prod && pass "verify:staff-ui-desktop-prod" || fail "verify:staff-ui-desktop-prod"

section "Prod — journal + pilotkunder"
BASE_URL="$BASE" ARCANA_SMOKE_PATIENT_ID="${ARCANA_SMOKE_PATIENT_ID:-2e8d3535-cd89-418e-8b68-ca239f8836a4}" \
  bash ./scripts/smoke-mobile-journal.sh && pass "smoke-mobile-journal" || fail "smoke-mobile-journal"
npm run verify:mobile-pilot-prod >/dev/null && pass "verify:mobile-pilot-prod" || fail "verify:mobile-pilot-prod"

section "Sammanfattning"
if [[ "$FAIL" -eq 0 ]]; then
  pass "CCO mobil pilot prod-verify klar"
  echo ""
  echo "Nästa manuellt: 2 personal × 5 konsultationer (cco-mobile-staff-pilot-checklist.md Fas 5.6)"
else
  fail "CCO mobil pilot prod-verify — minst ett fel ovan"
  exit 1
fi
