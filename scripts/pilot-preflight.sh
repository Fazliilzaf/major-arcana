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
    VERIFY_REQUIRED_CHECKS=1
    case "${ARCANA_PREFLIGHT_VERIFY_REQUIRED_CHECKS:-true}" in
      0|false|FALSE|no|NO|off|OFF)
        VERIFY_REQUIRED_CHECKS=0
        ;;
    esac

    OPS_STRICT_SCRIPT="ops:suite:strict"
    ALLOW_GUARD_FAIL_IN_HEAL_MODE=0
    case "${ARCANA_PREFLIGHT_USE_HEAL_ALL:-false}" in
      1|true|TRUE|yes|YES|on|ON)
        OPS_STRICT_SCRIPT="ops:suite:strict:heal:all"
        ALLOW_GUARD_FAIL_IN_HEAL_MODE=1
        ;;
    esac
    case "${ARCANA_PREFLIGHT_USE_HEAL:-false}" in
      1|true|TRUE|yes|YES|on|ON)
        if [[ "$OPS_STRICT_SCRIPT" == "ops:suite:strict" ]]; then
          OPS_STRICT_SCRIPT="ops:suite:strict:heal"
          ALLOW_GUARD_FAIL_IN_HEAL_MODE=1
        fi
        ;;
    esac

    echo "4) Public readiness guard ($PUBLIC_URL)"
    set +e
    BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard
    GUARD_EXIT_CODE=$?
    set -e
    if [[ "$GUARD_EXIT_CODE" -ne 0 ]]; then
      if [[ "$GUARD_EXIT_CODE" -eq 2 && "$ALLOW_GUARD_FAIL_IN_HEAL_MODE" -eq 1 ]]; then
        echo "⚠️ Readiness guard blocker kvarstår, fortsätter p.g.a. heal-läge (${OPS_STRICT_SCRIPT})."
      else
        echo "❌ Public readiness guard misslyckades (exit: $GUARD_EXIT_CODE)."
        exit "$GUARD_EXIT_CODE"
      fi
    fi
    echo

    echo "5) Public ${OPS_STRICT_SCRIPT} ($PUBLIC_URL)"
    BASE_URL="$PUBLIC_URL" npm run "$OPS_STRICT_SCRIPT"
    echo

    RUN_POST_GUARD_VERIFY=0
    POST_GUARD_ARGS=""
    POST_GUARD_LABEL="6) Public readiness guard verify"
    if [[ "$VERIFY_REQUIRED_CHECKS" -eq 1 ]]; then
      RUN_POST_GUARD_VERIFY=1
      POST_GUARD_ARGS="--use-required-checks"
      POST_GUARD_LABEL="6) Public readiness guard verify (required checks)"
    fi
    if [[ "$ALLOW_GUARD_FAIL_IN_HEAL_MODE" -eq 1 && "${GUARD_EXIT_CODE:-0}" -eq 2 ]]; then
      RUN_POST_GUARD_VERIFY=1
      if [[ -z "$POST_GUARD_ARGS" ]]; then
        POST_GUARD_LABEL="6) Public readiness guard verify after heal"
      else
        POST_GUARD_LABEL="6) Public readiness guard verify after heal (required checks)"
      fi
    fi

    if [[ "$RUN_POST_GUARD_VERIFY" -eq 1 ]]; then
      echo "${POST_GUARD_LABEL} ($PUBLIC_URL)"
      if [[ -n "$POST_GUARD_ARGS" ]]; then
        BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard -- $POST_GUARD_ARGS
      else
        BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard
      fi
      echo
    fi
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
