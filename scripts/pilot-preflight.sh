#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${BASE_URL:-}"
RUN_LOCAL=1
RUN_PUBLIC=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-url)
      PUBLIC_URL="${2:-}"
      shift 2
      ;;
    --skip-local)
      RUN_LOCAL=0
      shift
      ;;
    --skip-public)
      RUN_PUBLIC=0
      shift
      ;;
    *)
      echo "Okänd flagga: $1"
      echo "Använd: [--public-url https://arcana.hairtpclinic.se] [--skip-local] [--skip-public]"
      exit 1
      ;;
  esac
done

echo "== Arcana Pilot Preflight =="
echo

if [[ "$RUN_LOCAL" -eq 1 ]]; then
  echo "1) Lokal verify"
  npm run verify
  echo

  echo "2) Git large-file check"
  npm run git:check-large
  echo
else
  echo "1) Lokal verify SKIP"
  echo "2) Git large-file check SKIP"
  echo
fi

if [[ "$RUN_PUBLIC" -eq 1 ]]; then
  if [[ -z "$PUBLIC_URL" ]]; then
    echo "❌ Public smoke kräver BASE_URL eller --public-url."
    echo "Exempel: npm run preflight:pilot -- --public-url https://arcana.hairtpclinic.se"
    exit 1
  fi
  echo "3) Public smoke ($PUBLIC_URL)"
  BASE_URL="$PUBLIC_URL" npm run smoke:public
  echo
else
  echo "3) Public smoke SKIP"
  echo
fi

echo "🎯 Pilot preflight klart."
