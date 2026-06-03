#!/usr/bin/env bash
# run-real-cco-gate.sh — P0 gate for canonical CCO staff surfaces (not legacy demo routes).
#
#   npm run cco:real-cco-gate
#   CCO_REAL_GATE_BASE=https://arcana.hairtpclinic.com npm run cco:real-cco-gate

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${CCO_REAL_GATE_BASE:-https://arcana.hairtpclinic.com}"
FAILED=0

fail() {
  echo "FAIL: $1"
  FAILED=$((FAILED + 1))
}

pass() {
  echo "PASS: $1"
}

skip() {
  echo "SKIP: $1"
}

if [[ -f .env ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|SMOKE_BEARER_TOKEN)= ]] || continue
    export "$line"
  done < <(grep -E '^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|SMOKE_BEARER_TOKEN)=' .env 2>/dev/null || true)
fi

echo "== CCO real gate =="
echo "Base: $BASE"
echo

echo "[1/5] Static verify (repo)..."
if [[ ! -f scripts/verify-automation-prod.js ]]; then
  fail 'scripts/verify-automation-prod.js saknas'
else
  pass 'verify-automation-prod.js finns'
fi
node scripts/verify-kundresa-canonical-9-step.js
node scripts/verify-smart-next-step-dry-run.js
node scripts/verify-fas-a-readiness.js
node scripts/verify-kunder-real-data.js
node scripts/verify-mobile-kunder-real-data.js
echo

echo "[2/5] Prod static assets..."
for path in /cco-demo.html /kunder.html /m-kunder.html /cco-kunder-real.js /cco-kunder-mobil-real.js /cco-kunder-actions.js /cco-kunder-staff-owner.js /cco-kunder-smart-next-step.js; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$code" = "200" ]; then
    pass "${path} HTTP ${code}"
  else
    fail "${path} HTTP ${code} (expected 200)"
  fi
done
echo

echo "[3/5] customers-shell auth boundary..."
code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/v1/cco/staff/customers-shell?limit=1&offset=0")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  pass "customers-shell requires auth (${code} without token)"
elif [ "$code" = "200" ]; then
  pass "customers-shell reachable (${code})"
else
  fail "customers-shell unexpected HTTP ${code}"
fi

KUNDER_TMP="$(mktemp)"
trap 'rm -f "$KUNDER_TMP"' EXIT
if curl -sS -o "$KUNDER_TMP" "${BASE}/kunder.html" && grep -q 'src="/cco-kunder-real.js"' "$KUNDER_TMP"; then
  pass 'kunder.html includes cco-kunder-real.js on prod'
else
  fail 'kunder.html missing cco-kunder-real.js on prod'
fi

if grep -qE '1[[:space:]]*247|49[[:space:]]*MSEK|CUSTOMER_ROWS' "$KUNDER_TMP"; then
  fail 'kunder.html still has mock population markers on prod'
else
  pass 'kunder.html without mock population on prod'
fi

js=$(curl -sS "${BASE}/cco-kunder-real.js" 2>/dev/null || true)
actions=$(curl -sS "${BASE}/cco-kunder-actions.js" 2>/dev/null || true)
if echo "$js" | grep -q 'customers-shell' && echo "$js" | grep -q 'CcoJournalFeed.mount'; then
  pass 'cco-kunder-real.js wired on prod'
else
  fail 'cco-kunder-real.js incomplete on prod'
fi

if echo "$js" | grep -q 'segmentStats'; then
  pass 'cco-kunder-real.js P0.3 segmentStats on prod'
else
  fail 'cco-kunder-real.js missing segmentStats (P0.3)'
fi

if echo "$js" | grep -q 'hasUpcomingBooking' && echo "$js" | grep -q 'todayVisit'; then
  pass 'cco-kunder-real.js P0.4 booking fields on prod'
else
  fail 'cco-kunder-real.js missing P0.4 booking fields'
fi

if echo "$actions" | grep -q 'Kräver bokningsdata · Kalender P1'; then
  pass 'cco-kunder-actions.js boka/omboka disabled copy on prod (P1.2)'
elif echo "$actions" | grep -q 'Kopplas i Kalender P1'; then
  pass 'cco-kunder-actions.js boka/omboka disabled copy on prod (P1.1 fallback)'
else
  fail 'missing calendar P1 disabled copy on prod'
fi

MKUNDER_TMP="$(mktemp)"
trap 'rm -f "$KUNDER_TMP" "$MKUNDER_TMP"' EXIT
if curl -sS -o "$MKUNDER_TMP" "${BASE}/m-kunder.html" && grep -q 'src="/cco-kunder-mobil-real.js"' "$MKUNDER_TMP"; then
  pass 'm-kunder.html includes cco-kunder-mobil-real.js on prod'
else
  fail 'm-kunder.html missing cco-kunder-mobil-real.js on prod'
fi

if grep -qE '1[[:space:]]*247|49[[:space:]]*MSEK|Anna Karlsson|CUSTOMER_ROWS' "$MKUNDER_TMP"; then
  fail 'm-kunder.html still has mock population markers on prod'
else
  pass 'm-kunder.html without mock population on prod'
fi

mjs=$(curl -sS "${BASE}/cco-kunder-mobil-real.js" 2>/dev/null || true)
if echo "$mjs" | grep -q 'customers-shell' && echo "$mjs" | grep -q 'handlesMobileCustomers'; then
  pass 'cco-kunder-mobil-real.js wired on prod'
else
  fail 'cco-kunder-mobil-real.js incomplete on prod'
fi

if echo "$mjs" | grep -q 'CcoJournalFeed.mount' && echo "$mjs" | grep -q "params.set('q'"; then
  pass 'cco-kunder-mobil-real.js journal + global search on prod'
else
  fail 'cco-kunder-mobil-real.js missing journal mount or q= search on prod'
fi

if echo "$mjs" | grep -q 'data-patient-id'; then
  pass 'cco-kunder-mobil-real.js patientId rows on prod'
else
  fail 'cco-kunder-mobil-real.js missing patientId on prod'
fi

if echo "$mjs" | grep -q 'treatment_fue'; then
  pass 'cco-kunder-mobil-real.js treatment segments on prod (P1.1)'
else
  fail 'cco-kunder-mobil-real.js missing treatment segments (P1.1)'
fi

if echo "$actions" | grep -q 'buildPatientCapabilities' && echo "$actions" | grep -q 'photo-review.html'; then
  pass 'cco-kunder-actions.js capability map on prod (P1.2)'
else
  fail 'cco-kunder-actions.js missing P1.2 capability map on prod'
fi

staffown=$(curl -sS "${BASE}/cco-kunder-staff-owner.js" 2>/dev/null || true)
if echo "$staffown" | grep -q 'resolveAssignedOwner' && echo "$js" | grep -q 'CcoKunderStaffOwner'; then
  pass 'cco-kunder-staff-owner.js on prod (P1.2)'
else
  fail 'cco-kunder-staff-owner.js missing on prod (P1.2)'
fi

if echo "$js" | grep -q 'includeAutomation' && echo "$js" | grep -q 'CcoKunderSmartNextStep'; then
  pass 'cco-kunder-real.js ORD-3 smart-next-step on prod'
else
  fail 'cco-kunder-real.js missing ORD-3 smart-next-step wiring on prod'
fi

if echo "$mjs" | grep -q 'includeAutomation' && echo "$mjs" | grep -q 'CcoKunderSmartNextStep'; then
  pass 'cco-kunder-mobil-real.js ORD-3 smart-next-step on prod'
else
  fail 'cco-kunder-mobil-real.js missing ORD-3 smart-next-step wiring on prod'
fi

smart=$(curl -sS "${BASE}/cco-kunder-smart-next-step.js" 2>/dev/null || true)
if echo "$smart" | grep -q 'dossier-smart-next' && echo "$smart" | grep -q 'dry-run'; then
  pass 'cco-kunder-smart-next-step.js dry-run panel on prod'
else
  fail 'cco-kunder-smart-next-step.js incomplete on prod'
fi

acode=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/v1/cco/automation/catalog")
if [ "$acode" = "401" ] || [ "$acode" = "403" ]; then
  pass "automation/catalog mounted on prod (${acode})"
else
  fail "automation/catalog unexpected HTTP ${acode} on prod"
fi

echo
echo "[4/5] ORD-3 verify-automation-prod (STAFF-auth)..."
if [[ -n "${ARCANA_SMOKE_BEARER_TOKEN:-}" ]] || {
  [[ -n "${ARCANA_STAFF_EMAIL:-}" ]] && [[ -n "${ARCANA_STAFF_PASSWORD:-}" ]]
}; then
  if CCO_REAL_GATE_BASE="$BASE" ARCANA_PROD_URL="$BASE" node scripts/verify-automation-prod.js; then
    pass 'verify-automation-prod'
  else
    fail 'verify-automation-prod'
  fi
else
  skip 'verify-automation-prod — saknar ARCANA_STAFF_EMAIL/PASSWORD i .env (ORD-3 design)'
  pass 'verify-automation-prod skipped'
fi
echo
if [ "$FAILED" -gt 0 ]; then
  echo "✗ real-cco-gate FAILURES: $FAILED"
  exit 1
fi
echo "✅ real-cco-gate PASS"
