#!/usr/bin/env bash
# Full prod-svep: bootstrap fas 2, Graph/verify, booking, journal, rollout.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
FAIL=0

section() { echo ""; echo "=== $1 ==="; }
pass() { echo "✅ $1"; }
warn() { echo "⚠ $1"; }
fail() { echo "❌ $1"; FAIL=1; }

wait_readyz() {
  for attempt in $(seq 1 40); do
    if curl -fsS "${BASE}/readyz" 2>/dev/null | grep -q '"ready":true'; then
      pass "Prod readyz OK (försök $attempt)"
      return 0
    fi
    echo "  väntar readyz ($attempt)..."
    sleep 10
  done
  fail "Prod readyz timeout"
  return 1
}

section "0 — Vänta prod"
wait_readyz || true

section "1 — Bootstrap fas 2 (alla mailboxar)"
if [[ -f .env ]] && node -e "require('dotenv').config({quiet:true}); process.exit((process.env.ARCANA_GRAPH_CLIENT_SECRET||'').trim()?0:1)"; then
  ARCANA_BOOTSTRAP_PHASE1_ONLY=false SKIP_RESEND=true node ./scripts/apply-graph-resend-go-live-prod.js 2>&1 | tail -5 || warn "apply graph phase2 — se ovan"
  echo "Väntar deploy..."
  sleep 45
  wait_readyz || true
else
  warn "Saknar ARCANA_GRAPH_CLIENT_SECRET — hoppa bootstrap fas 2 apply"
fi

section "2 — Graph + mail-start"
npm run verify:graph-read-prod 2>&1 || warn "verify:graph-read-prod"
npm run verify:cco-mail-start-prod 2>&1 || warn "verify:cco-mail-start-prod"

section "3 — Booking Plan A + mail + webb E2E + operatör sign-off"
npm run verify:booking-plan-a-prod 2>&1 || warn "verify:booking-plan-a-prod"
BASE="${BASE}" node ./scripts/plan-a-verify-curl.mjs 2>&1 | tail -10 || warn "plan-a-verify-curl"
npm run verify:booking-mail-prod 2>&1 || warn "verify:booking-mail-prod"
npm run verify:booking-web-e2e-prod 2>&1 || warn "verify:booking-web-e2e-prod"
npm run verify:booking-operator-signoff-prod 2>&1 || warn "verify:booking-operator-signoff-prod"

section "4 — Mobil journal + pilot"
TOKEN="$(node scripts/get-prod-auth-token.js 2>/dev/null || true)"
if [[ -n "$TOKEN" ]]; then
  ARCANA_SMOKE_BEARER_TOKEN="$TOKEN" bash ./scripts/smoke-mobile-journal.sh 2>&1 | tail -12 || warn "smoke-mobile-journal"
  npm run verify:mobile-pilot-prod 2>&1 | tail -15 || warn "verify:mobile-pilot-prod"
else
  warn "Kunde inte hämta STAFF-token — hoppa journal smoke"
fi

section "5 — Staff UI + login"
npm run verify:staff-ui-prod 2>&1 | tail -8 || warn "verify:staff-ui-prod"
npm run verify:staff-ui-desktop-prod 2>&1 | tail -6 || warn "verify:staff-ui-desktop-prod"
npm run verify:staff-mobile-login-prod 2>&1 | tail -8 || warn "verify:staff-mobile-login-prod"

section "6 — Unit / CMO / migration"
node --test tests/ops/cmoPhaseV3Sweep.test.js 2>&1 | tail -5 || warn "cmo sweep tests"
npm run verify:cmo-connectors-prod 2>&1 || warn "verify:cmo-connectors-prod"
npm run migration:spot-check 2>&1 || warn "migration spot-check"

section "7 — Rollout sweep (övriga faser)"
npm run run:rollout-sweep 2>&1 | tail -20 || warn "run:rollout-sweep"

section "8 — Manuella spår (ej auto)"
warn "C1–C5 migration — Google/SharePoint/compliance"
warn "A5 IDB snapshot — nästa sprint"
warn "E3–E5 bridge — design/Cloudflare"
warn "B3b Resend — valfritt (Graph send täcker bokningsmail)"

section "Sammanfattning"
if [[ "$FAIL" -eq 0 ]]; then
  pass "Full prod-svep klart (manuella spår kan återstå)"
else
  fail "Full prod-svep — minst ett hårt fel"
  exit 1
fi
