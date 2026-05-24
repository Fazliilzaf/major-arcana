#!/usr/bin/env bash
# Slutregression: CCO mobil pilot + E2E klick-audit @ prod (2× E2E + fältpilot-sim).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Slutregression mobil staff @ prod =="
echo ""

node "$ROOT_DIR/scripts/lib/wait-for-prod-ready.js"

echo ""
echo "--- 1/4 verify:cco-mobile-pilot-prod ---"
npm run verify:cco-mobile-pilot-prod

echo ""
echo "--- 2/4 verify:field-pilot-consultations-prod ---"
npm run verify:field-pilot-consultations-prod

echo ""
echo "--- 3/4 verify:e2e-mobile-staff-click-audit-prod (kör 1) ---"
npm run verify:e2e-mobile-staff-click-audit-prod

echo ""
echo "--- 4/4 verify:e2e-mobile-staff-click-audit-prod (kör 2 — stabilitet) ---"
npm run verify:e2e-mobile-staff-click-audit-prod

echo ""
echo "✅ Slutregression mobil staff klar (pilot + fältpilot-sim + E2E×2)"
