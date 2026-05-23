#!/usr/bin/env bash
# Rensa dubbletter av hälsodeklaration för alla pilotkunder på prod.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
[[ -f "$PILOT_JSON" ]] || { echo "Saknar $PILOT_JSON"; exit 1; }

while IFS= read -r patientId; do
  [[ -n "$patientId" ]] || continue
  bash "$ROOT_DIR/scripts/cleanup-duplicate-health-decl-prod.sh" "$patientId"
done < <(node -e "const p=require('$PILOT_JSON'); for (const id of p.patientIds||[]) console.log(id);")

echo ""
echo "✓ Pilot journal cleanup klar"
