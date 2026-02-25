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

  if [[ -n "${ARCANA_OWNER_EMAIL:-}" && -n "${ARCANA_OWNER_PASSWORD:-}" ]]; then
    OPS_STRICT_SCRIPT="ops:suite:strict"
    case "${ARCANA_PREFLIGHT_USE_HEAL:-false}" in
      1|true|TRUE|yes|YES|on|ON)
        OPS_STRICT_SCRIPT="ops:suite:strict:heal"
        ;;
    esac

    echo "4) Public readiness guard ($PUBLIC_URL)"
    BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard
    echo

    echo "5) Public ${OPS_STRICT_SCRIPT} ($PUBLIC_URL)"
    BASE_URL="$PUBLIC_URL" npm run "$OPS_STRICT_SCRIPT"
    echo
  else
    echo "4) Public readiness guard SKIP (saknar ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD)"
    echo
    echo "5) Public ops suite strict SKIP (saknar ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD)"
    echo
  fi
else
  echo "3) Public smoke SKIP"
  echo "4) Public readiness guard SKIP"
  echo "5) Public ops suite strict SKIP"
  echo
fi

echo "🎯 Pilot preflight klart."
