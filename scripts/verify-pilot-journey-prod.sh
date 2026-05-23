#!/usr/bin/env bash
# Snabb prod-verifiering av pilot + gate + journal-API
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
PATIENT_ID="${1:-f8233fca-779c-488b-a980-0e41bc01c0c0}"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

AUTH_TOKEN="$(node "$ROOT_DIR/scripts/get-prod-auth-token.js" 2>/dev/null || true)"
CURL_AUTH=()
if [[ -n "$AUTH_TOKEN" ]]; then
  CURL_AUTH=(-H "Authorization: Bearer ${AUTH_TOKEN}")
fi

curl_api() {
  curl -fsS "${CURL_AUTH[@]}" "$@"
}

echo "=== Prod journey check ($BASE) ==="
echo "Patient: $PATIENT_ID"
[[ -n "$AUTH_TOKEN" ]] && pass "autentiserad API"

VERSION="$(curl_api "$BASE/api/v1/_diag/version")"
echo "$VERSION" | grep -q '"ok":true' || fail "version endpoint"
pass "version $(echo "$VERSION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).commit.slice(0,7)));")"

STATS="$(curl_api "$BASE/api/v1/cco-patient-master/stats")"
echo "$STATS" | grep -q '"totalPatients":5' || fail "förväntar 5 pilotkunder"
pass "pilotkunder i patient-master"

PATIENT="$(curl_api "$BASE/api/v1/cco-patient-master/patient?patientId=$PATIENT_ID")"
echo "$PATIENT" | grep -q '"displayName"' || fail "patient lookup"
pass "patient lookup"

AGREEMENT="$(curl_api "$BASE/api/v1/cco-treatment-agreement/patient-agreement?patientId=$PATIENT_ID")"
echo "$AGREEMENT" | grep -q '"agreement"' || fail "agreement API"
pass "avtal-API"

GATE="$(curl_api "$BASE/api/v1/cco-treatment-agreement/booking-gate?patientId=$PATIENT_ID&serviceId=fue")"
echo "$GATE" | grep -q '"gate"' || fail "booking-gate API"
pass "booking-gate API ($(echo "$GATE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const g=JSON.parse(d).gate;console.log(g.allowed?'open':'blocked');});"))"

JOURNAL="$(curl_api "$BASE/api/v1/cco-journal/entries?patientId=$PATIENT_ID")"
COUNT="$(echo "$JOURNAL" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log((JSON.parse(d).entries||[]).length));")"
pass "journal entries: $COUNT"

echo ""
echo "Klart. Testa UI: $BASE/staff?view=customers&patientId=$PATIENT_ID"
