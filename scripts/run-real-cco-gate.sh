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

echo "== CCO real gate =="
echo "Base: $BASE"
echo

echo "[1/3] Static verify (repo)..."
node scripts/verify-kunder-real-data.js
echo

echo "[2/3] Prod static assets..."
for path in /cco-demo.html /kunder.html /cco-kunder-real.js; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$code" = "200" ]; then
    pass "${path} HTTP ${code}"
  else
    fail "${path} HTTP ${code} (expected 200)"
  fi
done
echo

echo "[3/3] customers-shell auth boundary..."
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
if echo "$js" | grep -q 'customers-shell' && echo "$js" | grep -q 'CcoJournalFeed.mount'; then
  pass 'cco-kunder-real.js wired on prod'
else
  fail 'cco-kunder-real.js incomplete on prod'
fi

echo
if [ "$FAILED" -gt 0 ]; then
  echo "✗ real-cco-gate FAILURES: $FAILED"
  exit 1
fi
echo "✅ real-cco-gate PASS"
