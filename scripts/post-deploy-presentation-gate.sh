#!/usr/bin/env bash
# post-deploy-presentation-gate.sh
# Kör efter varje deploy. Blockerar vid P0 presentation/journal-fel.
#
#   bash scripts/post-deploy-presentation-gate.sh
#   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com bash scripts/post-deploy-presentation-gate.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${CCO_PERSONAL_DEMO_BASE:-https://arcana.hairtpclinic.com}"

echo "== Post-deploy presentation gate =="
echo "Base: $BASE"
echo

echo "[1/4] Journal route regression (server.js)..."
node scripts/verify-journal-pilot-routes.js
echo

echo "[2/4] Kunder real-data (no mock population)..."
node scripts/verify-kunder-real-data.js
echo

echo "[3/4] Demo link preflight..."
CCO_PERSONAL_DEMO_BASE="$BASE" node scripts/verify-personal-demo-links.js
echo

echo "[4/4] Personal demo readiness (routes + E2E)..."
CCO_PERSONAL_DEMO_BASE="$BASE" node scripts/run-personal-demo-readiness.js
echo

echo "✅ Presentation gate PASS — safe to continue."
