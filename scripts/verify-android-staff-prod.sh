#!/usr/bin/env bash
# BL.3 — Android Playwright verify @ prod (Pixel 5 default).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^# ]] && continue
    [[ "$line" =~ ^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|SMOKE_PATIENT_ID|DEFAULT_TENANT|PROD_URL|ANDROID_DEVICE)= ]] || continue
    export "$line"
  done < <(grep -E '^ARCANA_(STAFF_EMAIL|STAFF_PASSWORD|SMOKE_PATIENT_ID|DEFAULT_TENANT|PROD_URL|ANDROID_DEVICE)=' .env 2>/dev/null || true)
fi

export ARCANA_ANDROID_DEVICE="${ARCANA_ANDROID_DEVICE:-pixel-5}"
export ARCANA_MOBILE_DEVICE="${ARCANA_MOBILE_DEVICE:-pixel-5}"

echo "== BL.3 Android staff verify @ prod (${ARCANA_ANDROID_DEVICE}) =="
node "$ROOT_DIR/scripts/verify-android-staff-prod.js"
