#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PUBLIC_URL="${BASE_URL:-${ARCANA_PUBLIC_BASE_URL:-${PUBLIC_BASE_URL:-https://arcana.hairtpclinic.se}}}"

if [[ $# -ge 1 ]]; then
  PUBLIC_URL="$1"
fi

if [[ ! "${PUBLIC_URL}" =~ ^https?:// ]]; then
  echo "❌ Ogiltig URL: ${PUBLIC_URL}"
  echo "Ange en full URL, t.ex. https://arcana.hairtpclinic.se"
  exit 1
fi

echo "== Predeploy Quick Check =="
echo "Public URL: ${PUBLIC_URL}"
echo

echo "[1/3] Lokal strict heal..."
npm run ops:suite:strict:local:heal
echo

echo "[2/3] Lokal smoke..."
npm run smoke:local
echo

echo "[3/3] Public preflight..."
BASE_URL="${PUBLIC_URL}" npm run preflight:pilot:report -- --public-url "${PUBLIC_URL}" --skip-local
echo

echo "✅ Predeploy quick check klar."
