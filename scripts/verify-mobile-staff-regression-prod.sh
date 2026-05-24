#!/usr/bin/env bash
# Slutregression: CCO mobil pilot + E2E klick-audit @ prod.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== Slutregression mobil staff @ prod =="
echo ""

node "$ROOT_DIR/scripts/lib/wait-for-prod-ready.js"

echo ""
echo "--- 1/2 verify:cco-mobile-pilot-prod ---"
npm run verify:cco-mobile-pilot-prod

echo ""
echo "--- 2/2 verify:e2e-mobile-staff-click-audit-prod ---"
npm run verify:e2e-mobile-staff-click-audit-prod

echo ""
echo "✅ Slutregression mobil staff klar (pilot + E2E klick-audit)"
