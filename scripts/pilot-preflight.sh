#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${BASE_URL:-}"
RUN_LOCAL=1
RUN_PUBLIC=1

classify_guard_failures() {
  local report_file="$1"
  local healable_csv="$2"
  node - "$report_file" "$healable_csv" <<'NODE'
const fs = require('node:fs');
const reportFile = process.argv[2];
const healableCsv = String(process.argv[3] || 'owner_mfa_enforced');
const healableChecks = new Set(
  healableCsv
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean)
);
let failures = [];
try {
  const payload = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  failures = Array.isArray(payload?.failures) ? payload.failures : [];
} catch {
  console.log('guardBlockers=unknown ids=- nonHealable=-');
  process.exit(3);
}
const ids = Array.from(
  new Set(
    failures
      .map((item) => String(item?.checkId || '').trim())
      .filter(Boolean)
  )
);
if (ids.length === 0) {
  console.log('guardBlockers=unknown ids=- nonHealable=-');
  process.exit(3);
}
const nonHealable = ids.filter((id) => !healableChecks.has(id));
const state = nonHealable.length === 0 ? 'healable' : 'mixed';
console.log(
  `guardBlockers=${state} ids=${ids.join(',')} nonHealable=${nonHealable.join(',') || '-'}`
);
process.exit(nonHealable.length === 0 ? 0 : 2);
NODE
}

extract_guard_cors_env_recommendation() {
  local report_file="$1"
  node - "$report_file" <<'NODE'
const fs = require('node:fs');
const reportFile = process.argv[2];
let payload = {};
try {
  payload = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
} catch {
  process.exit(0);
}
const direct = String(payload?.recommendations?.corsStrictEnv || '').trim();
if (direct) {
  process.stdout.write(direct);
  process.exit(0);
}
const failures = Array.isArray(payload?.failures) ? payload.failures : [];
const corsFailure =
  failures.find((item) => String(item?.checkId || '').trim() === 'cors_strict') || null;
if (!corsFailure || typeof corsFailure.value !== 'object' || Array.isArray(corsFailure.value)) {
  process.exit(0);
}
const origins = [];
for (const origin of Array.isArray(corsFailure.value.effectiveOrigins)
  ? corsFailure.value.effectiveOrigins
  : []) {
  const normalized = String(origin || '').trim().replace(/\/+$/, '').toLowerCase();
  if (!normalized || origins.includes(normalized)) continue;
  origins.push(normalized);
}
if (origins.length === 0) process.exit(0);
process.stdout.write(
  `CORS_STRICT=true CORS_ALLOW_NO_ORIGIN=false CORS_ALLOWED_ORIGINS=${origins.join(',')}`
);
NODE
}

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
    HEALABLE_GUARD_CHECKS="${ARCANA_PREFLIGHT_HEALABLE_GUARD_CHECKS:-owner_mfa_enforced}"
    FORCE_OPS_ON_GUARD_FAIL=0
    case "${ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL:-false}" in
      1|true|TRUE|yes|YES|on|ON)
        FORCE_OPS_ON_GUARD_FAIL=1
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

    GUARD_REPORT_FILE="$(mktemp)"
    POST_GUARD_REPORT_FILE="$(mktemp)"
    cleanup_guard_reports() {
      rm -f "$GUARD_REPORT_FILE" "$POST_GUARD_REPORT_FILE"
    }
    trap cleanup_guard_reports EXIT

    echo "4) Public readiness guard ($PUBLIC_URL)"
    set +e
    BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard -- --report-file "$GUARD_REPORT_FILE"
    GUARD_EXIT_CODE=$?
    set -e
    if [[ "$GUARD_EXIT_CODE" -ne 0 ]]; then
      if [[ "$GUARD_EXIT_CODE" -eq 2 && "$ALLOW_GUARD_FAIL_IN_HEAL_MODE" -eq 1 ]]; then
        set +e
        GUARD_CLASSIFICATION_OUTPUT="$(classify_guard_failures "$GUARD_REPORT_FILE" "$HEALABLE_GUARD_CHECKS")"
        GUARD_CLASSIFICATION_EXIT=$?
        set -e
        if [[ "$FORCE_OPS_ON_GUARD_FAIL" -eq 1 ]]; then
          echo "⚠️ Readiness guard blocker kvarstår, fortsätter p.g.a. force-override (ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL=true)."
          echo "   ${GUARD_CLASSIFICATION_OUTPUT}"
        elif [[ "$GUARD_CLASSIFICATION_EXIT" -eq 0 ]]; then
          echo "⚠️ Readiness guard blocker kvarstår men är healbar, fortsätter p.g.a. heal-läge (${OPS_STRICT_SCRIPT})."
          echo "   ${GUARD_CLASSIFICATION_OUTPUT}"
        else
          echo "❌ Public readiness guard blocker innehåller ej-healbar check. Avbryter före ${OPS_STRICT_SCRIPT}."
          echo "   ${GUARD_CLASSIFICATION_OUTPUT}"
          CORS_ENV_RECOMMENDATION="$(extract_guard_cors_env_recommendation "$GUARD_REPORT_FILE" || true)"
          if [[ -n "$CORS_ENV_RECOMMENDATION" ]]; then
            echo "   Rekommenderad CORS runtime-env: ${CORS_ENV_RECOMMENDATION}"
          fi
          echo "   Sätt ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL=true för att tvinga fortsatt körning."
          exit "$GUARD_EXIT_CODE"
        fi
      else
        echo "❌ Public readiness guard misslyckades (exit: $GUARD_EXIT_CODE)."
        exit "$GUARD_EXIT_CODE"
      fi
    fi
    echo

    echo "5) Public ${OPS_STRICT_SCRIPT} ($PUBLIC_URL)"
    set +e
    BASE_URL="$PUBLIC_URL" npm run "$OPS_STRICT_SCRIPT"
    OPS_EXIT_CODE=$?
    set -e
    if [[ "$OPS_EXIT_CODE" -ne 0 ]]; then
      echo "⚠️ Public ${OPS_STRICT_SCRIPT} misslyckades (exit: $OPS_EXIT_CODE). Kör verifiering för diagnos."
    fi
    echo

    RUN_POST_GUARD_VERIFY=0
    POST_GUARD_EXIT_CODE=0
    POST_GUARD_ARGS=()
    POST_GUARD_LABEL="6) Public readiness guard verify"
    if [[ "$VERIFY_REQUIRED_CHECKS" -eq 1 ]]; then
      RUN_POST_GUARD_VERIFY=1
      POST_GUARD_ARGS+=(--use-required-checks)
      POST_GUARD_LABEL="6) Public readiness guard verify (required checks)"
    fi
    if [[ "$ALLOW_GUARD_FAIL_IN_HEAL_MODE" -eq 1 && "${GUARD_EXIT_CODE:-0}" -eq 2 ]]; then
      RUN_POST_GUARD_VERIFY=1
      if [[ "${#POST_GUARD_ARGS[@]}" -eq 0 ]]; then
        POST_GUARD_LABEL="6) Public readiness guard verify after heal"
      else
        POST_GUARD_LABEL="6) Public readiness guard verify after heal (required checks)"
      fi
    fi
    if [[ "${OPS_EXIT_CODE:-0}" -ne 0 ]]; then
      RUN_POST_GUARD_VERIFY=1
      if [[ "${#POST_GUARD_ARGS[@]}" -eq 0 ]]; then
        POST_GUARD_LABEL="6) Public readiness guard verify after ops failure"
      else
        POST_GUARD_LABEL="6) Public readiness guard verify after ops failure (required checks)"
      fi
    fi

    if [[ "$RUN_POST_GUARD_VERIFY" -eq 1 ]]; then
      echo "${POST_GUARD_LABEL} ($PUBLIC_URL)"
      set +e
      BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard -- --report-file "$POST_GUARD_REPORT_FILE" "${POST_GUARD_ARGS[@]}"
      POST_GUARD_EXIT_CODE=$?
      set -e
      if [[ "$POST_GUARD_EXIT_CODE" -ne 0 ]]; then
        echo "⚠️ Public readiness guard verify misslyckades (exit: $POST_GUARD_EXIT_CODE)."
      fi
      echo
    fi

    if [[ "${OPS_EXIT_CODE:-0}" -ne 0 ]]; then
      exit "$OPS_EXIT_CODE"
    fi
    if [[ "${POST_GUARD_EXIT_CODE:-0}" -ne 0 ]]; then
      exit "$POST_GUARD_EXIT_CODE"
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
