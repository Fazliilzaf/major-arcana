#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${DRIVE_MISSING_IMPORT_GO:-}" != "true" ]]; then
  echo "Sätt DRIVE_MISSING_IMPORT_GO=true" >&2
  exit 2
fi

DELAY_MS="${DELAY_MS:-30}"
FROM_YEAR="${FROM_YEAR:-2025}"
TO_YEAR="${TO_YEAR:-2019}"

for ((year = FROM_YEAR; year >= TO_YEAR; year--)); do
  for phase in documents images; do
    echo ""
    echo "========== ${year} · ${phase} =========="
    node scripts/run-drive-missing-import-by-year.js \
      --year "${year}" \
      --phase "${phase}" \
      --go \
      --skip-backup \
      --delay-ms "${DELAY_MS}"
  done
done

echo ""
echo "=== Klart: ${FROM_YEAR} → ${TO_YEAR} (documents + images) ==="
