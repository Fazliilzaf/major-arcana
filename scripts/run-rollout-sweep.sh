#!/usr/bin/env bash
# Kör verifiering för utrullningsplanen (Fas 1–6) — så långt automation tillåter.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
FAIL=0

section() { echo ""; echo "=== $1 ==="; }

warn() { echo "⚠ $1"; }
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAIL=1; }

section "Fas 1 — Mobil pilot (auto-del)"
if curl -fsS "${BASE}/readyz" 2>/dev/null | grep -q '"ready":true'; then
  pass "Prod readyz OK"
  npm run verify:mobile-pilot-prod 2>&1 | tail -8 || warn "verify:mobile-pilot-prod misslyckades"
  npm run verify:staff-ui-prod 2>&1 || warn "verify:staff-ui-prod (Playwright iPhone viewport)"
  npm run verify:staff-ui-desktop-prod 2>&1 || warn "verify:staff-ui-desktop-prod (1280px regression)"
  if [[ -f ./data/pilot-patients.json ]]; then
    bash ./scripts/verify-all-pilot-journey-prod.sh 2>&1 | tail -12 || warn "pilot journey verify misslyckades"
  else
    warn "data/pilot-patients.json saknas lokalt — hoppa journey"
  fi
else
  warn "Prod svarar inte (deploy?) — kör lokalt: npm run smoke:mobile-journal:local"
fi
warn "MANUELLT: Fas 5.5–5.6 enhetstest + 5 konsultationer (cco-mobile-staff-pilot-checklist.md)"

section "Fas 2 — Auth/MFA (check only)"
bash ./scripts/verify-auth-go-live-prod.sh || true

section "Fas 3 — Post-op Fas 1 (unit)"
node --test tests/capabilities/requestPostOpReview.test.js
pass "RequestPostOpReview unit tests"

section "Fas 4 — Compliance (unit)"
if [[ -f tests/capabilities/gdprCustomer.test.js ]]; then
  node --test tests/capabilities/gdprCustomer.test.js || warn "gdprCustomer tests"
else
  warn "gdprCustomer.test.js saknas"
fi

section "Fas 5 — Booking Plan A"
bash ./scripts/verify-booking-plan-a-prod.sh || warn "booking catalog verify"
BASE="${BASE}" node ./scripts/plan-a-verify-curl.mjs 2>&1 | tail -12 || warn "booking Plan A E2E (plan-a-verify-curl)"

section "Fas 6 — Infra"
bash ./scripts/verify-render-blueprint-link.sh || fail "blueprint link"

section "Sammanfattning"
if [[ "$FAIL" -eq 0 ]]; then
  pass "Rollout sweep: inga hårda fel (manuella steg kan återstå)"
else
  fail "Rollout sweep: minst ett hårt fel — se ovan"
  exit 1
fi
