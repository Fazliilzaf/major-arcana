#!/usr/bin/env bash
# Cycle 45 prod-UAT — ORD-3 B-sprint (automation dry-run + Smart nästa steg UI)
#
#   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com bash scripts/run-cycle-45-prod-uat-ord3.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${CCO_PERSONAL_DEMO_BASE:-https://arcana.hairtpclinic.com}"
FAILED=0
REPORT="${ROOT}/data/reports/cycle-45-prod-uat-ord3-$(date -u +%Y%m%dT%H%M%SZ).md"
mkdir -p "$(dirname "$REPORT")"

fail() {
  echo "FAIL: $1"
  FAILED=$((FAILED + 1))
}

pass() {
  echo "PASS: $1"
}

echo "== Cycle 45 prod-UAT (ORD-3) =="
echo "Base: $BASE"
echo

{
  echo "# Cycle 45 prod-UAT — ORD-3"
  echo ""
  echo "**Base:** $BASE"
  echo "**UTC:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
} >"$REPORT"

echo "[1/6] readyz..."
code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/readyz")
if [ "$code" = "200" ]; then
  pass "readyz HTTP 200"
  echo "- readyz: **PASS** (200)" >>"$REPORT"
else
  fail "readyz HTTP $code"
  echo "- readyz: **FAIL** ($code)" >>"$REPORT"
fi
echo

echo "[2/6] Static repo gates..."
node scripts/verify-kundresa-canonical-9-step.js
node scripts/verify-smart-next-step-dry-run.js
node scripts/verify-kunder-real-data.js
node scripts/verify-mobile-kunder-real-data.js
pass "static ORD-3 verify scripts"
echo "- static verify scripts: **PASS**" >>"$REPORT"
echo

echo "[3/6] Prod real-cco-gate..."
CCO_REAL_GATE_BASE="$BASE" bash scripts/run-real-cco-gate.sh
pass "real-cco-gate prod"
echo "- real-cco-gate: **PASS**" >>"$REPORT"
echo

echo "[4/6] ORD-3 prod asset checks..."
for path in /cco-kunder-smart-next-step.js; do
  c=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$c" = "200" ]; then
    pass "${path} HTTP 200"
    echo "- ${path}: **PASS**" >>"$REPORT"
  else
    fail "${path} HTTP $c"
    echo "- ${path}: **FAIL** ($c)" >>"$REPORT"
  fi
done

js=$(curl -sS "${BASE}/cco-kunder-real.js" 2>/dev/null || true)
mjs=$(curl -sS "${BASE}/cco-kunder-mobil-real.js" 2>/dev/null || true)

if echo "$js" | grep -q 'includeAutomation'; then
  pass 'cco-kunder-real.js includeAutomation on prod'
  echo "- includeAutomation desktop: **PASS**" >>"$REPORT"
else
  fail 'cco-kunder-real.js missing includeAutomation on prod'
  echo "- includeAutomation desktop: **FAIL**" >>"$REPORT"
fi

if echo "$mjs" | grep -q 'includeAutomation'; then
  pass 'cco-kunder-mobil-real.js includeAutomation on prod'
  echo "- includeAutomation mobil: **PASS**" >>"$REPORT"
else
  fail 'mobil missing includeAutomation on prod'
  echo "- includeAutomation mobil: **FAIL**" >>"$REPORT"
fi

KUNDER_TMP="$(mktemp)"
MKUNDER_TMP="$(mktemp)"
trap 'rm -f "$KUNDER_TMP" "$MKUNDER_TMP"' EXIT
curl -sS -o "$KUNDER_TMP" "${BASE}/kunder.html"
curl -sS -o "$MKUNDER_TMP" "${BASE}/m-kunder.html"

if grep -qE 'src="/cco-kunder-smart-next-step\.js"' "$KUNDER_TMP"; then
  pass 'kunder.html loads smart-next-step on prod'
  echo "- kunder.html script: **PASS**" >>"$REPORT"
else
  fail 'kunder.html missing smart-next-step script'
  echo "- kunder.html script: **FAIL**" >>"$REPORT"
fi

if grep -qE 'src="/cco-kunder-smart-next-step\.js"' "$MKUNDER_TMP"; then
  pass 'm-kunder.html loads smart-next-step on prod'
  echo "- m-kunder.html script: **PASS**" >>"$REPORT"
else
  fail 'm-kunder.html missing smart-next-step script'
  echo "- m-kunder.html script: **FAIL**" >>"$REPORT"
fi

smart=$(curl -sS "${BASE}/cco-kunder-smart-next-step.js" 2>/dev/null || true)
if echo "$smart" | grep -q 'CcoKunderSmartNextStep' && echo "$smart" | grep -q 'Inga öppna signaler'; then
  pass 'smart-next-step bundle has panel + empty state copy'
  echo "- smart-next-step copy: **PASS**" >>"$REPORT"
else
  fail 'smart-next-step bundle incomplete'
  echo "- smart-next-step copy: **FAIL**" >>"$REPORT"
fi
echo

echo "[5/6] Automation API boundary..."
acode=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/v1/cco/automation/catalog")
if [ "$acode" = "401" ] || [ "$acode" = "403" ]; then
  pass "automation/catalog requires auth ($acode)"
  echo "- automation/catalog auth: **PASS** ($acode)" >>"$REPORT"
else
  fail "automation/catalog unexpected HTTP $acode"
  echo "- automation/catalog auth: **FAIL** ($acode)" >>"$REPORT"
fi

shell_code=$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/api/v1/cco/staff/customers-shell?limit=1&includeAutomation=1")
if [ "$shell_code" = "401" ] || [ "$shell_code" = "403" ]; then
  pass "customers-shell+includeAutomation requires auth ($shell_code)"
  echo "- customers-shell includeAutomation: **PASS** ($shell_code)" >>"$REPORT"
else
  fail "customers-shell unexpected HTTP $shell_code"
  echo "- customers-shell includeAutomation: **FAIL** ($shell_code)" >>"$REPORT"
fi
echo

echo "[6/6] ORD-3 presentation subset (journal + kunder, ej full demo-länkpreflight)..."
node scripts/verify-journal-pilot-routes.js
node scripts/verify-kunder-real-data.js
pass "ORD-3 presentation subset"
echo "- presentation subset (journal+kunder): **PASS**" >>"$REPORT"
echo

if [ "$FAILED" -gt 0 ]; then
  echo "✗ Cycle 45 FAILURES: $FAILED"
  echo "" >>"$REPORT"
  echo "**Resultat:** FAIL ($FAILED checks)" >>"$REPORT"
  echo "Report: $REPORT"
  exit 1
fi

echo "✅ Cycle 45 prod-UAT PASS"
echo "" >>"$REPORT"
echo "**Resultat:** PASS (ORD-3 dry-run live på prod)" >>"$REPORT"
echo "Report: $REPORT"
