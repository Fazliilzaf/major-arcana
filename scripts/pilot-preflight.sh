#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${BASE_URL:-}"
RUN_LOCAL=1
RUN_PUBLIC=1
PREFLIGHT_REPORT_FILE="${ARCANA_PREFLIGHT_REPORT_FILE:-}"
PREFLIGHT_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PREFLIGHT_RUN_ID="preflight-$(date -u +"%Y%m%d-%H%M%S")-$$"
FINAL_EXIT_REASON="completed"
OPS_STRICT_SCRIPT_SELECTED=""
HEALABLE_GUARD_CHECKS_SELECTED=""
FORCE_OPS_ON_GUARD_FAIL_SELECTED=0
GUARD_CLASSIFICATION_OUTPUT=""
CORS_ENV_RECOMMENDATION=""
GUARD_REPORT_FILE=""
POST_GUARD_REPORT_FILE=""
OPS_ARTIFACT_FILE=""
TMP_FILES=()

STEP_LOCAL_VERIFY_STATUS="not_run"
STEP_LOCAL_VERIFY_EXIT=""
STEP_GIT_LARGE_STATUS="not_run"
STEP_GIT_LARGE_EXIT=""
STEP_PUBLIC_SMOKE_STATUS="not_run"
STEP_PUBLIC_SMOKE_EXIT=""
STEP_PUBLIC_GUARD_STATUS="not_run"
STEP_PUBLIC_GUARD_EXIT=""
STEP_PUBLIC_OPS_STRICT_STATUS="not_run"
STEP_PUBLIC_OPS_STRICT_EXIT=""
STEP_PUBLIC_GUARD_VERIFY_STATUS="not_run"
STEP_PUBLIC_GUARD_VERIFY_EXIT=""

set_step_result() {
  local name="$1"
  local status="$2"
  local exit_code="${3:-}"
  case "$name" in
    local_verify)
      STEP_LOCAL_VERIFY_STATUS="$status"
      STEP_LOCAL_VERIFY_EXIT="$exit_code"
      ;;
    git_large)
      STEP_GIT_LARGE_STATUS="$status"
      STEP_GIT_LARGE_EXIT="$exit_code"
      ;;
    public_smoke)
      STEP_PUBLIC_SMOKE_STATUS="$status"
      STEP_PUBLIC_SMOKE_EXIT="$exit_code"
      ;;
    public_guard)
      STEP_PUBLIC_GUARD_STATUS="$status"
      STEP_PUBLIC_GUARD_EXIT="$exit_code"
      ;;
    public_ops_strict)
      STEP_PUBLIC_OPS_STRICT_STATUS="$status"
      STEP_PUBLIC_OPS_STRICT_EXIT="$exit_code"
      ;;
    public_guard_verify)
      STEP_PUBLIC_GUARD_VERIFY_STATUS="$status"
      STEP_PUBLIC_GUARD_VERIFY_EXIT="$exit_code"
      ;;
  esac
}

exit_with_reason() {
  local exit_code="$1"
  local reason="$2"
  FINAL_EXIT_REASON="$reason"
  exit "$exit_code"
}

write_preflight_report() {
  local exit_code="$1"
  local finished_at="$2"
  local report_file="${PREFLIGHT_REPORT_FILE:-}"
  if [[ -z "$report_file" ]]; then
    return 0
  fi
  PREFLIGHT_REPORT_FILE="$report_file" \
  PREFLIGHT_EXIT_CODE="$exit_code" \
  PREFLIGHT_FINISHED_AT="$finished_at" \
  PREFLIGHT_STARTED_AT="$PREFLIGHT_STARTED_AT" \
  PREFLIGHT_RUN_ID="$PREFLIGHT_RUN_ID" \
  FINAL_EXIT_REASON="$FINAL_EXIT_REASON" \
  RUN_LOCAL="$RUN_LOCAL" \
  RUN_PUBLIC="$RUN_PUBLIC" \
  PUBLIC_URL="$PUBLIC_URL" \
  OPS_STRICT_SCRIPT_SELECTED="$OPS_STRICT_SCRIPT_SELECTED" \
  HEALABLE_GUARD_CHECKS_SELECTED="$HEALABLE_GUARD_CHECKS_SELECTED" \
  FORCE_OPS_ON_GUARD_FAIL_SELECTED="$FORCE_OPS_ON_GUARD_FAIL_SELECTED" \
  GUARD_CLASSIFICATION_OUTPUT="$GUARD_CLASSIFICATION_OUTPUT" \
  CORS_ENV_RECOMMENDATION="$CORS_ENV_RECOMMENDATION" \
  STEP_LOCAL_VERIFY_STATUS="$STEP_LOCAL_VERIFY_STATUS" \
  STEP_LOCAL_VERIFY_EXIT="$STEP_LOCAL_VERIFY_EXIT" \
  STEP_GIT_LARGE_STATUS="$STEP_GIT_LARGE_STATUS" \
  STEP_GIT_LARGE_EXIT="$STEP_GIT_LARGE_EXIT" \
  STEP_PUBLIC_SMOKE_STATUS="$STEP_PUBLIC_SMOKE_STATUS" \
  STEP_PUBLIC_SMOKE_EXIT="$STEP_PUBLIC_SMOKE_EXIT" \
  STEP_PUBLIC_GUARD_STATUS="$STEP_PUBLIC_GUARD_STATUS" \
  STEP_PUBLIC_GUARD_EXIT="$STEP_PUBLIC_GUARD_EXIT" \
  STEP_PUBLIC_OPS_STRICT_STATUS="$STEP_PUBLIC_OPS_STRICT_STATUS" \
  STEP_PUBLIC_OPS_STRICT_EXIT="$STEP_PUBLIC_OPS_STRICT_EXIT" \
  STEP_PUBLIC_GUARD_VERIFY_STATUS="$STEP_PUBLIC_GUARD_VERIFY_STATUS" \
  STEP_PUBLIC_GUARD_VERIFY_EXIT="$STEP_PUBLIC_GUARD_VERIFY_EXIT" \
  GUARD_REPORT_FILE="$GUARD_REPORT_FILE" \
  POST_GUARD_REPORT_FILE="$POST_GUARD_REPORT_FILE" \
  OPS_ARTIFACT_FILE="$OPS_ARTIFACT_FILE" \
  node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

function toBool(value, fallback = false) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function toIntOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readJsonFile(filePathRaw) {
  const filePath = String(filePathRaw || '').trim();
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  try {
    const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return { path: resolved, payload };
  } catch {
    return { path: resolved, payload: null };
  }
}

function summarizeGuardReport(raw) {
  const payload = raw?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      path: raw?.path || null,
      available: false,
    };
  }
  const failures = Array.isArray(payload?.failures) ? payload.failures : [];
  const failedCheckIds = Array.isArray(payload?.failedCheckIds) ? payload.failedCheckIds : [];
  return {
    path: raw?.path || null,
    available: true,
    generatedAt: payload?.generatedAt || null,
    outcome: payload?.outcome || null,
    score: Number(payload?.readiness?.score || 0),
    band: payload?.readiness?.band || null,
    goAllowed: payload?.readiness?.goAllowed === true,
    resolvedChecksCount: Array.isArray(payload?.checks?.resolved)
      ? payload.checks.resolved.length
      : 0,
    failureCount: failures.length,
    failedCheckIds,
    topFailures: failures.slice(0, 5).map((item) => ({
      checkId: item?.checkId || null,
      status: item?.status || null,
      categoryId: item?.categoryId || null,
      evidence: item?.evidence || null,
      target: item?.target || null,
    })),
    corsStrictEnv: payload?.recommendations?.corsStrictEnv || null,
    corsStrictOrigins: Array.isArray(payload?.recommendations?.corsStrictOrigins)
      ? payload.recommendations.corsStrictOrigins
      : [],
  };
}

function summarizeOpsArtifact(raw) {
  const payload = raw?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      path: raw?.path || null,
      available: false,
    };
  }
  const strict = payload?.strict && typeof payload.strict === 'object' ? payload.strict : {};
  const readiness = payload?.monitor?.readiness && typeof payload.monitor.readiness === 'object'
    ? payload.monitor.readiness
    : {};
  const blockers = Array.isArray(readiness?.blockerChecks) ? readiness.blockerChecks : [];
  return {
    path: raw?.path || null,
    available: true,
    generatedAt: payload?.generatedAt || null,
    strict: {
      failOnNoGo: strict?.failOnNoGo === true,
      exitCode: Number(strict?.exitCode || 0),
      failureCount: Number(strict?.failureCount || 0),
      failures: Array.isArray(strict?.failures) ? strict.failures : [],
      advisoryCount: Number(strict?.advisoryCount || 0),
      advisories: Array.isArray(strict?.advisories) ? strict.advisories : [],
    },
    readiness: {
      score: Number(readiness?.score || 0),
      band: readiness?.band || null,
      goAllowed: readiness?.goNoGo?.allowed === true,
      blockerChecksCount: blockers.length,
      blockerCheckIds: blockers.map((item) => item?.checkId).filter(Boolean).slice(0, 12),
      corsStrictRecommendation: readiness?.corsStrictRecommendation?.envLine || null,
    },
  };
}

const reportPath = path.resolve(String(process.env.PREFLIGHT_REPORT_FILE || '').trim());
if (!reportPath) process.exit(0);

const guardReportRaw = readJsonFile(process.env.GUARD_REPORT_FILE);
const postGuardReportRaw = readJsonFile(process.env.POST_GUARD_REPORT_FILE);
const opsArtifactRaw = readJsonFile(process.env.OPS_ARTIFACT_FILE);

const report = {
  generatedAt: new Date().toISOString(),
  runId: String(process.env.PREFLIGHT_RUN_ID || '').trim() || null,
  startedAt: String(process.env.PREFLIGHT_STARTED_AT || '').trim() || null,
  finishedAt: String(process.env.PREFLIGHT_FINISHED_AT || '').trim() || null,
  exit: {
    code: toIntOrNull(process.env.PREFLIGHT_EXIT_CODE),
    reason: String(process.env.FINAL_EXIT_REASON || '').trim() || null,
  },
  options: {
    runLocal: toBool(process.env.RUN_LOCAL, true),
    runPublic: toBool(process.env.RUN_PUBLIC, true),
    publicUrl: String(process.env.PUBLIC_URL || '').trim() || null,
    opsStrictScript: String(process.env.OPS_STRICT_SCRIPT_SELECTED || '').trim() || null,
    healableGuardChecks:
      String(process.env.HEALABLE_GUARD_CHECKS_SELECTED || '').trim() || null,
    forceOpsOnGuardFail: toBool(process.env.FORCE_OPS_ON_GUARD_FAIL_SELECTED, false),
  },
  steps: {
    localVerify: {
      status: String(process.env.STEP_LOCAL_VERIFY_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_LOCAL_VERIFY_EXIT),
    },
    gitLargeFileCheck: {
      status: String(process.env.STEP_GIT_LARGE_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_GIT_LARGE_EXIT),
    },
    publicSmoke: {
      status: String(process.env.STEP_PUBLIC_SMOKE_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_PUBLIC_SMOKE_EXIT),
    },
    publicReadinessGuard: {
      status: String(process.env.STEP_PUBLIC_GUARD_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_PUBLIC_GUARD_EXIT),
      classification: String(process.env.GUARD_CLASSIFICATION_OUTPUT || '').trim() || null,
      corsEnvRecommendation:
        String(process.env.CORS_ENV_RECOMMENDATION || '').trim() || null,
    },
    publicOpsStrict: {
      status: String(process.env.STEP_PUBLIC_OPS_STRICT_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_PUBLIC_OPS_STRICT_EXIT),
    },
    publicReadinessGuardVerify: {
      status: String(process.env.STEP_PUBLIC_GUARD_VERIFY_STATUS || 'not_run'),
      exitCode: toIntOrNull(process.env.STEP_PUBLIC_GUARD_VERIFY_EXIT),
    },
  },
  artifacts: {
    readinessGuardReportPath: guardReportRaw?.path || null,
    readinessGuardVerifyReportPath: postGuardReportRaw?.path || null,
    opsSuiteArtifactPath: opsArtifactRaw?.path || null,
  },
  diagnostics: {
    readinessGuard: summarizeGuardReport(guardReportRaw),
    readinessGuardVerify: summarizeGuardReport(postGuardReportRaw),
    opsSuite: summarizeOpsArtifact(opsArtifactRaw),
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
NODE
}

cleanup_and_report() {
  local exit_code=$?
  local finished_at
  finished_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  if [[ "$exit_code" -ne 0 && "$FINAL_EXIT_REASON" == "completed" ]]; then
    FINAL_EXIT_REASON="failed"
  fi
  write_preflight_report "$exit_code" "$finished_at" || true
  if [[ ${#TMP_FILES[@]} -gt 0 ]]; then
    rm -f "${TMP_FILES[@]}" 2>/dev/null || true
  fi
}

trap cleanup_and_report EXIT

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
    --report-file)
      PREFLIGHT_REPORT_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Okänd flagga: $1"
      echo "Använd: [--public-url https://arcana.hairtpclinic.se] [--skip-local] [--skip-public] [--report-file ./data/reports/preflight.json]"
      exit_with_reason 1 "invalid_arguments"
      ;;
  esac
done

echo "== Arcana Pilot Preflight =="
echo

if [[ "$RUN_LOCAL" -eq 1 ]]; then
  echo "1) Lokal verify"
  set +e
  npm run verify
  LOCAL_VERIFY_EXIT_CODE=$?
  set -e
  if [[ "$LOCAL_VERIFY_EXIT_CODE" -ne 0 ]]; then
    set_step_result local_verify "failed" "$LOCAL_VERIFY_EXIT_CODE"
    echo "❌ Lokal verify misslyckades (exit: $LOCAL_VERIFY_EXIT_CODE)."
    exit_with_reason "$LOCAL_VERIFY_EXIT_CODE" "local_verify_failed"
  fi
  set_step_result local_verify "ok" "0"
  echo

  echo "2) Git large-file check"
  set +e
  npm run git:check-large
  GIT_LARGE_EXIT_CODE=$?
  set -e
  if [[ "$GIT_LARGE_EXIT_CODE" -ne 0 ]]; then
    set_step_result git_large "failed" "$GIT_LARGE_EXIT_CODE"
    echo "❌ Git large-file check misslyckades (exit: $GIT_LARGE_EXIT_CODE)."
    exit_with_reason "$GIT_LARGE_EXIT_CODE" "git_large_check_failed"
  fi
  set_step_result git_large "ok" "0"
  echo
else
  set_step_result local_verify "skipped" ""
  set_step_result git_large "skipped" ""
  echo "1) Lokal verify SKIP"
  echo "2) Git large-file check SKIP"
  echo
fi

if [[ "$RUN_PUBLIC" -eq 1 ]]; then
  if [[ -z "$PUBLIC_URL" ]]; then
    echo "❌ Public smoke kräver BASE_URL eller --public-url."
    echo "Exempel: npm run preflight:pilot -- --public-url https://arcana.hairtpclinic.se"
    exit_with_reason 1 "missing_public_url"
  fi
  echo "3) Public smoke ($PUBLIC_URL)"
  set +e
  BASE_URL="$PUBLIC_URL" npm run smoke:public
  PUBLIC_SMOKE_EXIT_CODE=$?
  set -e
  if [[ "$PUBLIC_SMOKE_EXIT_CODE" -ne 0 ]]; then
    set_step_result public_smoke "failed" "$PUBLIC_SMOKE_EXIT_CODE"
    echo "❌ Public smoke misslyckades (exit: $PUBLIC_SMOKE_EXIT_CODE)."
    exit_with_reason "$PUBLIC_SMOKE_EXIT_CODE" "public_smoke_failed"
  fi
  set_step_result public_smoke "ok" "0"
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
    HEALABLE_GUARD_CHECKS_SELECTED="$HEALABLE_GUARD_CHECKS"
    FORCE_OPS_ON_GUARD_FAIL_SELECTED="$FORCE_OPS_ON_GUARD_FAIL"

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
    OPS_STRICT_SCRIPT_SELECTED="$OPS_STRICT_SCRIPT"

    GUARD_REPORT_FILE="$(mktemp)"
    POST_GUARD_REPORT_FILE="$(mktemp)"
    TMP_FILES+=("$GUARD_REPORT_FILE" "$POST_GUARD_REPORT_FILE")

    echo "4) Public readiness guard ($PUBLIC_URL)"
    set +e
    BASE_URL="$PUBLIC_URL" npm run preflight:readiness:guard -- --report-file "$GUARD_REPORT_FILE"
    GUARD_EXIT_CODE=$?
    set -e
    STEP_PUBLIC_GUARD_EXIT="$GUARD_EXIT_CODE"
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
          set_step_result public_guard "failed" "$GUARD_EXIT_CODE"
          echo "❌ Public readiness guard blocker innehåller ej-healbar check. Avbryter före ${OPS_STRICT_SCRIPT}."
          echo "   ${GUARD_CLASSIFICATION_OUTPUT}"
          CORS_ENV_RECOMMENDATION="$(extract_guard_cors_env_recommendation "$GUARD_REPORT_FILE" || true)"
          if [[ -n "$CORS_ENV_RECOMMENDATION" ]]; then
            echo "   Rekommenderad CORS runtime-env: ${CORS_ENV_RECOMMENDATION}"
          fi
          echo "   Sätt ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL=true för att tvinga fortsatt körning."
          exit_with_reason "$GUARD_EXIT_CODE" "public_guard_non_healable_blocker"
        fi
      else
        set_step_result public_guard "failed" "$GUARD_EXIT_CODE"
        echo "❌ Public readiness guard misslyckades (exit: $GUARD_EXIT_CODE)."
        exit_with_reason "$GUARD_EXIT_CODE" "public_guard_failed"
      fi
    fi
    if [[ "${STEP_PUBLIC_GUARD_STATUS}" != "failed" ]]; then
      if [[ "$GUARD_EXIT_CODE" -eq 0 ]]; then
        set_step_result public_guard "ok" "0"
      else
        set_step_result public_guard "warning" "$GUARD_EXIT_CODE"
      fi
    fi
    echo

    if [[ -n "$PREFLIGHT_REPORT_FILE" ]]; then
      REPORT_DIR="$(dirname "$PREFLIGHT_REPORT_FILE")"
      mkdir -p "$REPORT_DIR"
      OPS_ARTIFACT_FILE="${REPORT_DIR}/Ops_Suite_${PREFLIGHT_RUN_ID}.json"
    else
      OPS_ARTIFACT_FILE="$(mktemp)"
      TMP_FILES+=("$OPS_ARTIFACT_FILE")
    fi

    echo "5) Public ${OPS_STRICT_SCRIPT} ($PUBLIC_URL)"
    set +e
    BASE_URL="$PUBLIC_URL" ARCANA_SCHEDULER_SUITE_OUT="$OPS_ARTIFACT_FILE" npm run "$OPS_STRICT_SCRIPT"
    OPS_EXIT_CODE=$?
    set -e
    if [[ "$OPS_EXIT_CODE" -eq 0 ]]; then
      set_step_result public_ops_strict "ok" "0"
    else
      set_step_result public_ops_strict "failed" "$OPS_EXIT_CODE"
    fi
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
      if [[ "$POST_GUARD_EXIT_CODE" -eq 0 ]]; then
        set_step_result public_guard_verify "ok" "0"
      else
        set_step_result public_guard_verify "failed" "$POST_GUARD_EXIT_CODE"
      fi
      if [[ "$POST_GUARD_EXIT_CODE" -ne 0 ]]; then
        echo "⚠️ Public readiness guard verify misslyckades (exit: $POST_GUARD_EXIT_CODE)."
      fi
      echo
    else
      set_step_result public_guard_verify "skipped" ""
    fi

    if [[ "${OPS_EXIT_CODE:-0}" -ne 0 ]]; then
      exit_with_reason "$OPS_EXIT_CODE" "public_ops_strict_failed"
    fi
    if [[ "${POST_GUARD_EXIT_CODE:-0}" -ne 0 ]]; then
      exit_with_reason "$POST_GUARD_EXIT_CODE" "public_guard_verify_failed"
    fi
  else
    set_step_result public_guard "skipped" ""
    set_step_result public_ops_strict "skipped" ""
    set_step_result public_guard_verify "skipped" ""
    echo "4) Public readiness guard SKIP (saknar ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD)"
    echo
    echo "5) Public ops suite strict SKIP (saknar ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD)"
    echo
  fi
else
  set_step_result public_smoke "skipped" ""
  set_step_result public_guard "skipped" ""
  set_step_result public_ops_strict "skipped" ""
  set_step_result public_guard_verify "skipped" ""
  echo "3) Public smoke SKIP"
  echo "4) Public readiness guard SKIP"
  echo "5) Public ops suite strict SKIP"
  echo
fi

echo "🎯 Pilot preflight klart."
