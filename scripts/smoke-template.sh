#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${ARCANA_OWNER_EMAIL:-owner@hairtpclinic.se}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

json_get() {
  local path="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(input); } catch (e) {
  console.error('❌ Kunde inte läsa JSON-svar');
  console.error(input);
  process.exit(1);
}
const path = process.argv[1].split('.');
let ref = data;
for (const key of path) {
  if (!key) continue;
  ref = ref?.[key];
}
if (ref === undefined || ref === null) process.exit(2);
if (typeof ref === 'object') {
  process.stdout.write(JSON.stringify(ref));
} else {
  process.stdout.write(String(ref));
}
" "$path"
}

read_mfa_secret_from_store() {
  local email="$1"
  local auth_store_path="${AUTH_STORE_PATH:-./data/auth.json}"
  node -e "
const fs = require('fs');
const path = process.argv[1];
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) process.exit(0);
let raw = null;
try {
  raw = JSON.parse(fs.readFileSync(path, 'utf8'));
} catch {
  process.exit(0);
}
const users = raw && raw.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
const user = users.find((item) => String(item?.email || '').trim().toLowerCase() === email) || null;
const secret = String(user?.mfaSecret || '').trim();
if (secret) process.stdout.write(secret);
" "$auth_store_path" "$email"
}

generate_totp_code() {
  local secret="$1"
  node -e "
const crypto = require('crypto');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const secret = String(process.argv[1] || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
if (!secret) process.exit(1);
let bits = 0;
let value = 0;
const bytes = [];
for (const ch of secret) {
  const idx = alphabet.indexOf(ch);
  if (idx < 0) continue;
  value = (value << 5) | idx;
  bits += 5;
  if (bits >= 8) {
    bytes.push((value >>> (bits - 8)) & 255);
    bits -= 8;
  }
}
const key = Buffer.from(bytes);
const counter = Math.floor(Date.now() / 1000 / 30);
const counterBuffer = Buffer.alloc(8);
counterBuffer.writeBigUInt64BE(BigInt(counter));
const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
const offset = hmac[hmac.length - 1] & 0x0f;
const binary =
  ((hmac[offset] & 0x7f) << 24) |
  ((hmac[offset + 1] & 0xff) << 16) |
  ((hmac[offset + 2] & 0xff) << 8) |
  (hmac[offset + 3] & 0xff);
const otp = String(binary % 1000000).padStart(6, '0');
process.stdout.write(otp);
" "$secret"
}

complete_login_with_optional_mfa() {
  local login_response="$1"
  local requested_tenant_id="$2"
  local email="$3"

  local token=""
  token="$(printf '%s' "$login_response" | json_get token 2>/dev/null || true)"
  if [[ -n "$token" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local requires_mfa=""
  requires_mfa="$(printf '%s' "$login_response" | json_get requiresMfa 2>/dev/null || true)"
  if [[ "$requires_mfa" != "true" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_ticket=""
  mfa_ticket="$(printf '%s' "$login_response" | json_get mfaTicket 2>/dev/null || true)"
  if [[ -z "$mfa_ticket" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_secret=""
  mfa_secret="$(printf '%s' "$login_response" | json_get mfa.secret 2>/dev/null || true)"
  if [[ -z "$mfa_secret" ]]; then
    mfa_secret="$(read_mfa_secret_from_store "$email" 2>/dev/null || true)"
  fi
  if [[ -z "$mfa_secret" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_code=""
  mfa_code="$(generate_totp_code "$mfa_secret" 2>/dev/null || true)"
  if [[ -z "$mfa_code" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_verify_response=""
  mfa_verify_response="$(curl -s -X POST "$BASE_URL/api/v1/auth/mfa/verify" \
    -H "Content-Type: application/json" \
    -d "{\"mfaTicket\":\"$mfa_ticket\",\"code\":\"$mfa_code\",\"tenantId\":\"$requested_tenant_id\"}")"

  local mfa_token=""
  mfa_token="$(printf '%s' "$mfa_verify_response" | json_get token 2>/dev/null || true)"
  if [[ -n "$mfa_token" ]]; then
    printf '%s' "$mfa_verify_response"
    return 0
  fi

  local requires_tenant_selection=""
  requires_tenant_selection="$(printf '%s' "$mfa_verify_response" | json_get requiresTenantSelection 2>/dev/null || true)"
  if [[ "$requires_tenant_selection" == "true" ]]; then
    local login_ticket=""
    login_ticket="$(printf '%s' "$mfa_verify_response" | json_get loginTicket 2>/dev/null || true)"
    local selected_tenant_id="$requested_tenant_id"
    if [[ -z "$selected_tenant_id" ]]; then
      selected_tenant_id="$(printf '%s' "$mfa_verify_response" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const t=(Array.isArray(d?.tenants)?d.tenants:[])[0]; process.stdout.write(String(t?.tenantId||''));" 2>/dev/null || true)"
    fi
    if [[ -n "$login_ticket" && -n "$selected_tenant_id" ]]; then
      local tenant_select_response=""
      tenant_select_response="$(curl -s -X POST "$BASE_URL/api/v1/auth/select-tenant" \
        -H "Content-Type: application/json" \
        -d "{\"loginTicket\":\"$login_ticket\",\"tenantId\":\"$selected_tenant_id\"}")"
      printf '%s' "$tenant_select_response"
      return 0
    fi
  fi

  printf '%s' "$mfa_verify_response"
  return 0
}

echo "== Arcana Template Smoke Test =="
echo "BASE_URL:  $BASE_URL"
echo "EMAIL:     $EMAIL"
echo "TENANT_ID: $TENANT_ID"
echo

HEALTH_RESPONSE="$(curl -s "$BASE_URL/healthz")"
HEALTH_OK="$(printf '%s' "$HEALTH_RESPONSE" | json_get ok)"
echo "✅ healthz OK (ok: ${HEALTH_OK})"

READY_RESPONSE="$(curl -s "$BASE_URL/readyz")"
READY_OK="$(printf '%s' "$READY_RESPONSE" | json_get ok)"
echo "✅ readyz OK (ok: ${READY_OK})"

CORRELATION_HEADER="$(curl -s -D - -o /dev/null "$BASE_URL/healthz" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-correlation-id"{print $2}' | tail -n 1)"
if [[ -z "$CORRELATION_HEADER" ]]; then
  echo "❌ x-correlation-id saknas i svarshuvud"
  exit 1
fi
echo "✅ correlation-id header OK (${CORRELATION_HEADER})"

LOGIN_RESPONSE_RAW="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"
LOGIN_RESPONSE="$(complete_login_with_optional_mfa "$LOGIN_RESPONSE_RAW" "$TENANT_ID" "$EMAIL")"

TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Inloggning misslyckades."
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi
echo "✅ Login OK (token längd: ${#TOKEN})"

ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")"
CURRENT_TENANT="$(printf '%s' "$ME_RESPONSE" | json_get membership.tenantId)"
CURRENT_ROLE="$(printf '%s' "$ME_RESPONSE" | json_get membership.role)"
CURRENT_SESSION_ID="$(printf '%s' "$ME_RESPONSE" | json_get session.id)"
MEMBERSHIP_COUNT="$(printf '%s' "$ME_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const list=Array.isArray(d.memberships)?d.memberships:(d.membership?[d.membership]:[]); process.stdout.write(String(list.length));")"
echo "✅ auth/me OK (tenant: ${CURRENT_TENANT}, role: ${CURRENT_ROLE}, memberships: ${MEMBERSHIP_COUNT})"

SESSIONS_ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/sessions?scope=me&includeRevoked=0&limit=20" \
  -H "Authorization: Bearer $TOKEN")"
SESSIONS_ME_COUNT="$(printf '%s' "$SESSIONS_ME_RESPONSE" | json_get count)"
echo "✅ auth/sessions me OK (count: ${SESSIONS_ME_COUNT})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  SESSIONS_TENANT_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/sessions?scope=tenant&includeRevoked=0&limit=20" \
    -H "Authorization: Bearer $TOKEN")"
  SESSIONS_TENANT_COUNT="$(printf '%s' "$SESSIONS_TENANT_RESPONSE" | json_get count)"
  echo "✅ auth/sessions tenant OK (count: ${SESSIONS_TENANT_COUNT})"

  SECOND_LOGIN_RESPONSE_RAW="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$CURRENT_TENANT\"}")"
  SECOND_LOGIN_RESPONSE="$(complete_login_with_optional_mfa "$SECOND_LOGIN_RESPONSE_RAW" "$CURRENT_TENANT" "$EMAIL")"
  SECOND_TOKEN="$(printf '%s' "$SECOND_LOGIN_RESPONSE" | json_get token 2>/dev/null || true)"
  if [[ -z "$SECOND_TOKEN" ]]; then
    echo "ℹ️ auth/sessions revoke SKIP (kunde inte skapa sekundär session med MFA)"
  else
  SECOND_ME_RESPONSE="$(curl -s "$BASE_URL/api/v1/auth/me" \
    -H "Authorization: Bearer $SECOND_TOKEN")"
  SECOND_SESSION_ID="$(printf '%s' "$SECOND_ME_RESPONSE" | json_get session.id)"
  if [[ -z "$SECOND_SESSION_ID" || "$SECOND_SESSION_ID" == "$CURRENT_SESSION_ID" ]]; then
    echo "❌ Kunde inte skapa separat session för revoke-test."
    exit 1
  fi

  FIRST_ME_AFTER_SECOND_LOGIN="$(curl -s "$BASE_URL/api/v1/auth/me" \
    -H "Authorization: Bearer $TOKEN")"
  FIRST_SESSION_AFTER_SECOND_LOGIN="$(printf '%s' "$FIRST_ME_AFTER_SECOND_LOGIN" | json_get session.id 2>/dev/null || true)"

  if [[ -n "$FIRST_SESSION_AFTER_SECOND_LOGIN" && "$FIRST_SESSION_AFTER_SECOND_LOGIN" != "$SECOND_SESSION_ID" ]]; then
    SESSIONS_REVOKE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/sessions/$SECOND_SESSION_ID/revoke" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"reason":"smoke_revoke_secondary_session"}')"
    REVOKED_FLAG="$(printf '%s' "$SESSIONS_REVOKE_RESPONSE" | json_get revoked)"
    echo "✅ auth/sessions revoke OK (revoked: ${REVOKED_FLAG})"
  else
    TOKEN="$SECOND_TOKEN"
    CURRENT_SESSION_ID="$SECOND_SESSION_ID"
    echo "ℹ️ auth/sessions revoke SKIP (login rotation invalidated första sessionen)"
  fi
  fi
fi

TENANTS_MY_RESPONSE="$(curl -s "$BASE_URL/api/v1/tenants/my" \
  -H "Authorization: Bearer $TOKEN")"
TENANTS_MY_COUNT="$(printf '%s' "$TENANTS_MY_RESPONSE" | json_get count)"
echo "✅ tenants/my OK (count: ${TENANTS_MY_COUNT})"

TENANT_ACCESS_CHECK_RESPONSE="$(curl -s "$BASE_URL/api/v1/tenants/${CURRENT_TENANT}/access-check" \
  -H "Authorization: Bearer $TOKEN")"
TENANT_ACCESS_CHECK_OK="$(printf '%s' "$TENANT_ACCESS_CHECK_RESPONSE" | json_get ok 2>/dev/null || true)"
if [[ "$TENANT_ACCESS_CHECK_OK" != "true" ]]; then
  echo "❌ tenants/access-check misslyckades"
  printf '%s\n' "$TENANT_ACCESS_CHECK_RESPONSE"
  exit 1
fi
echo "✅ tenants/access-check OK (tenant: ${CURRENT_TENANT})"

if [[ "${MEMBERSHIP_COUNT}" -gt 1 ]]; then
  ALT_TENANT_ID="$(printf '%s' "$ME_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const list=Array.isArray(d.memberships)?d.memberships:[]; const current=d?.membership?.tenantId||''; const alt=(list.find((item)=>item?.tenantId&&item.tenantId!==current)||{}).tenantId||''; process.stdout.write(String(alt));")"
  if [[ -n "${ALT_TENANT_ID}" ]]; then
    SWITCH_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/switch-tenant" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"tenantId\":\"${ALT_TENANT_ID}\"}")"
    TOKEN="$(printf '%s' "$SWITCH_RESPONSE" | json_get token)"
    SWITCHED_TENANT="$(printf '%s' "$SWITCH_RESPONSE" | json_get membership.tenantId)"
    echo "✅ auth/switch-tenant OK (nu: ${SWITCHED_TENANT})"

    SWITCH_BACK_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/switch-tenant" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"tenantId\":\"${CURRENT_TENANT}\"}")"
    TOKEN="$(printf '%s' "$SWITCH_BACK_RESPONSE" | json_get token)"
    SWITCH_BACK_TENANT="$(printf '%s' "$SWITCH_BACK_RESPONSE" | json_get membership.tenantId)"
    echo "✅ auth/switch-tenant restore OK (tillbaka: ${SWITCH_BACK_TENANT})"
  fi
fi

MONITOR_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/status" \
  -H "Authorization: Bearer $TOKEN")"
MONITOR_TEMPLATES="$(printf '%s' "$MONITOR_RESPONSE" | json_get kpis.templatesTotal)"
MONITOR_RESTORE_DRILL_HEALTHY="$(printf '%s' "$MONITOR_RESPONSE" | json_get gates.restoreDrill.healthy 2>/dev/null || true)"
MONITOR_RESTORE_DRILL_NOGO="$(printf '%s' "$MONITOR_RESPONSE" | json_get gates.restoreDrill.noGo 2>/dev/null || true)"
MONITOR_PILOT_REPORT_HEALTHY="$(printf '%s' "$MONITOR_RESPONSE" | json_get gates.pilotReport.healthy 2>/dev/null || true)"
MONITOR_PILOT_REPORT_NOGO="$(printf '%s' "$MONITOR_RESPONSE" | json_get gates.pilotReport.noGo 2>/dev/null || true)"
MONITOR_SCHED_JOB_COUNT="$(printf '%s' "$MONITOR_RESPONSE" | json_get runtime.scheduler.jobs | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
MONITOR_RISK_LIMIT_MAX="$(printf '%s' "$MONITOR_RESPONSE" | json_get security.rateLimits.riskMax 2>/dev/null || true)"
MONITOR_ORCHESTRATOR_LIMIT_MAX="$(printf '%s' "$MONITOR_RESPONSE" | json_get security.rateLimits.orchestratorMax 2>/dev/null || true)"
MONITOR_PUBLIC_CHAT_LIMIT_MAX="$(printf '%s' "$MONITOR_RESPONSE" | json_get security.rateLimits.publicChatMax 2>/dev/null || true)"
if [[ "$MONITOR_RESTORE_DRILL_HEALTHY" != "true" && "$MONITOR_RESTORE_DRILL_HEALTHY" != "false" ]]; then
  echo "❌ monitor/status saknar gates.restoreDrill.healthy"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
if [[ "$MONITOR_RESTORE_DRILL_NOGO" != "true" && "$MONITOR_RESTORE_DRILL_NOGO" != "false" ]]; then
  echo "❌ monitor/status saknar gates.restoreDrill.noGo"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
if [[ "$MONITOR_PILOT_REPORT_HEALTHY" != "true" && "$MONITOR_PILOT_REPORT_HEALTHY" != "false" ]]; then
  echo "❌ monitor/status saknar gates.pilotReport.healthy"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
if [[ "$MONITOR_PILOT_REPORT_NOGO" != "true" && "$MONITOR_PILOT_REPORT_NOGO" != "false" ]]; then
  echo "❌ monitor/status saknar gates.pilotReport.noGo"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
if [[ -z "$MONITOR_SCHED_JOB_COUNT" || "$MONITOR_SCHED_JOB_COUNT" -lt 4 ]]; then
  echo "❌ monitor/status saknar scheduler jobs-lista"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
if [[ -z "$MONITOR_RISK_LIMIT_MAX" || "$MONITOR_RISK_LIMIT_MAX" == "null" || -z "$MONITOR_ORCHESTRATOR_LIMIT_MAX" || "$MONITOR_ORCHESTRATOR_LIMIT_MAX" == "null" || -z "$MONITOR_PUBLIC_CHAT_LIMIT_MAX" || "$MONITOR_PUBLIC_CHAT_LIMIT_MAX" == "null" ]]; then
  echo "❌ monitor/status saknar dedikerade rate limit-fält"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
echo "✅ monitor/status OK (templates: ${MONITOR_TEMPLATES}, restoreDrillHealthy: ${MONITOR_RESTORE_DRILL_HEALTHY}, restoreDrillNoGo: ${MONITOR_RESTORE_DRILL_NOGO}, pilotReportHealthy: ${MONITOR_PILOT_REPORT_HEALTHY}, schedulerJobs: ${MONITOR_SCHED_JOB_COUNT})"

MONITOR_METRICS_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/metrics?areaLimit=6" \
  -H "Authorization: Bearer $TOKEN")"
MONITOR_METRICS_P95="$(printf '%s' "$MONITOR_METRICS_RESPONSE" | json_get latency.p95Ms 2>/dev/null || true)"
MONITOR_METRICS_SAMPLED="$(printf '%s' "$MONITOR_METRICS_RESPONSE" | json_get totals.sampledRequests 2>/dev/null || true)"
if [[ -z "$MONITOR_METRICS_P95" || "$MONITOR_METRICS_P95" == "null" || -z "$MONITOR_METRICS_SAMPLED" || "$MONITOR_METRICS_SAMPLED" == "null" ]]; then
  echo "❌ monitor/metrics saknar latency/sampledRequests"
  printf '%s\n' "$MONITOR_METRICS_RESPONSE"
  exit 1
fi
echo "✅ monitor/metrics OK (p95Ms: ${MONITOR_METRICS_P95}, sampled: ${MONITOR_METRICS_SAMPLED})"

MONITOR_SLO_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/slo" \
  -H "Authorization: Bearer $TOKEN")"
MONITOR_SLO_STATUS="$(printf '%s' "$MONITOR_SLO_RESPONSE" | json_get summary.overallStatus 2>/dev/null || true)"
MONITOR_SLO_COUNT="$(printf '%s' "$MONITOR_SLO_RESPONSE" | json_get slos | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
if [[ "$MONITOR_SLO_STATUS" != "green" && "$MONITOR_SLO_STATUS" != "yellow" && "$MONITOR_SLO_STATUS" != "red" && "$MONITOR_SLO_STATUS" != "unknown" ]]; then
  echo "❌ monitor/slo saknar giltig summary.overallStatus"
  printf '%s\n' "$MONITOR_SLO_RESPONSE"
  exit 1
fi
if [[ "$MONITOR_SLO_COUNT" -lt 3 ]]; then
  echo "❌ monitor/slo returnerade för få SLO-rader (${MONITOR_SLO_COUNT})"
  printf '%s\n' "$MONITOR_SLO_RESPONSE"
  exit 1
fi
echo "✅ monitor/slo OK (overall: ${MONITOR_SLO_STATUS}, slos: ${MONITOR_SLO_COUNT})"

READINESS_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/readiness" \
  -H "Authorization: Bearer $TOKEN")"
READINESS_SCORE="$(printf '%s' "$READINESS_RESPONSE" | json_get score 2>/dev/null || true)"
READINESS_BAND="$(printf '%s' "$READINESS_RESPONSE" | json_get band 2>/dev/null || true)"
READINESS_CATEGORIES_COUNT="$(printf '%s' "$READINESS_RESPONSE" | json_get categories | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
READINESS_NOGO_COUNT="$(printf '%s' "$READINESS_RESPONSE" | json_get noGoTriggers | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
READINESS_NOGO_UNKNOWN="$(printf '%s' "$READINESS_RESPONSE" | json_get noGoTriggers | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const c=Array.isArray(d)?d.filter((item)=>String(item?.status||'').toLowerCase()==='unknown').length:0; process.stdout.write(String(c));")"
READINESS_TRIGGERED_NOGO_COUNT="$(printf '%s' "$READINESS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=Number(d?.goNoGo?.triggeredNoGoCount||0); process.stdout.write(String(Number.isFinite(v)?Math.max(0,Math.trunc(v)):0));")"
READINESS_REMEDIATION_TOTAL="$(printf '%s' "$READINESS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=Number(d?.remediation?.summary?.total||0); process.stdout.write(String(Number.isFinite(v)?Math.max(0,Math.trunc(v)):0));")"
READINESS_REMEDIATION_ACTIONS="$(printf '%s' "$READINESS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d?.remediation?.actions)?d.remediation.actions.length:0));")"
READINESS_REMEDIATION_P0="$(printf '%s' "$READINESS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=Number(d?.remediation?.summary?.byPriority?.P0||0); process.stdout.write(String(Number.isFinite(v)?Math.max(0,Math.trunc(v)):0));")"
READINESS_REMEDIATION_POTENTIAL="$(printf '%s' "$READINESS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=Number(d?.remediation?.summary?.potentialScoreGain||0); process.stdout.write(Number.isFinite(v)?String(v):'NaN');")"
if [[ -z "$READINESS_SCORE" || "$READINESS_SCORE" == "null" || "$READINESS_CATEGORIES_COUNT" -lt 4 || "$READINESS_NOGO_COUNT" -lt 6 ]]; then
  echo "❌ monitor/readiness saknar score eller kategorier"
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
if [[ "$READINESS_NOGO_UNKNOWN" -ne 0 ]]; then
  echo "❌ monitor/readiness innehåller okända no-go-statusar (${READINESS_NOGO_UNKNOWN})"
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
if [[ "$READINESS_REMEDIATION_ACTIONS" -lt "$READINESS_REMEDIATION_TOTAL" ]]; then
  echo "❌ monitor/readiness remediation summary/actions är inkonsistenta"
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
if [[ "$READINESS_REMEDIATION_POTENTIAL" == "NaN" ]]; then
  echo "❌ monitor/readiness remediation potentialScoreGain är ogiltig"
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
if [[ "$READINESS_BAND" != "controlled_go" || "$READINESS_TRIGGERED_NOGO_COUNT" -gt 0 ]]; then
  if [[ "$READINESS_REMEDIATION_TOTAL" -lt 1 ]]; then
    echo "❌ monitor/readiness saknar remediation-actions trots att readiness inte är green-go"
    printf '%s\n' "$READINESS_RESPONSE"
    exit 1
  fi
fi
if [[ "$READINESS_TRIGGERED_NOGO_COUNT" -gt 0 && "$READINESS_REMEDIATION_P0" -lt 1 ]]; then
  echo "❌ monitor/readiness saknar P0-remediation trots triggered no-go"
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
echo "✅ monitor/readiness OK (score: ${READINESS_SCORE}, band: ${READINESS_BAND}, categories: ${READINESS_CATEGORIES_COUNT}, noGo: ${READINESS_NOGO_COUNT}, remediation: ${READINESS_REMEDIATION_TOTAL}, potentialGain: ${READINESS_REMEDIATION_POTENTIAL})"

READINESS_HISTORY_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/readiness/history?limit=5" \
  -H "Authorization: Bearer $TOKEN")"
READINESS_HISTORY_COUNT="$(printf '%s' "$READINESS_HISTORY_RESPONSE" | json_get count 2>/dev/null || true)"
READINESS_HISTORY_ENTRIES_COUNT="$(printf '%s' "$READINESS_HISTORY_RESPONSE" | json_get entries | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
READINESS_HISTORY_LATEST_SCORE="$(printf '%s' "$READINESS_HISTORY_RESPONSE" | json_get entries.0.score 2>/dev/null || true)"
READINESS_HISTORY_LATEST_GO_ALLOWED="$(printf '%s' "$READINESS_HISTORY_RESPONSE" | json_get entries.0.goAllowed 2>/dev/null || true)"
if [[ -z "$READINESS_HISTORY_COUNT" || "$READINESS_HISTORY_COUNT" == "null" || "$READINESS_HISTORY_ENTRIES_COUNT" -lt 1 ]]; then
  echo "❌ monitor/readiness/history saknar entries"
  printf '%s\n' "$READINESS_HISTORY_RESPONSE"
  exit 1
fi
if [[ -z "$READINESS_HISTORY_LATEST_SCORE" || "$READINESS_HISTORY_LATEST_SCORE" == "null" ]]; then
  echo "❌ monitor/readiness/history saknar entries[0].score"
  printf '%s\n' "$READINESS_HISTORY_RESPONSE"
  exit 1
fi
if [[ "$READINESS_HISTORY_LATEST_GO_ALLOWED" != "true" && "$READINESS_HISTORY_LATEST_GO_ALLOWED" != "false" ]]; then
  echo "❌ monitor/readiness/history saknar entries[0].goAllowed"
  printf '%s\n' "$READINESS_HISTORY_RESPONSE"
  exit 1
fi
echo "✅ monitor/readiness/history OK (count: ${READINESS_HISTORY_COUNT}, entries: ${READINESS_HISTORY_ENTRIES_COUNT}, latestScore: ${READINESS_HISTORY_LATEST_SCORE})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/readiness/remediate-output-gates" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true,"limit":20,"detailsLimit":3}')"
  OPS_READINESS_REMEDIATION_PREVIEW_OK="$(printf '%s' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE" | json_get ok 2>/dev/null || true)"
  OPS_READINESS_REMEDIATION_PREVIEW_DRY_RUN="$(printf '%s' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE" | json_get dryRun 2>/dev/null || true)"
  OPS_READINESS_REMEDIATION_PREVIEW_CANDIDATES="$(printf '%s' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE" | json_get candidates 2>/dev/null || true)"
  OPS_READINESS_REMEDIATION_PREVIEW_FIXABLE="$(printf '%s' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE" | json_get fixableCandidates 2>/dev/null || true)"
  if [[ "$OPS_READINESS_REMEDIATION_PREVIEW_OK" != "true" || "$OPS_READINESS_REMEDIATION_PREVIEW_DRY_RUN" != "true" ]]; then
    echo "❌ ops/readiness/remediate-output-gates preview misslyckades"
    printf '%s\n' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE"
    exit 1
  fi
  if [[ -z "$OPS_READINESS_REMEDIATION_PREVIEW_CANDIDATES" || "$OPS_READINESS_REMEDIATION_PREVIEW_CANDIDATES" == "null" || -z "$OPS_READINESS_REMEDIATION_PREVIEW_FIXABLE" || "$OPS_READINESS_REMEDIATION_PREVIEW_FIXABLE" == "null" ]]; then
    echo "❌ ops/readiness/remediate-output-gates preview saknar candidates/fixable"
    printf '%s\n' "$OPS_READINESS_REMEDIATION_PREVIEW_RESPONSE"
    exit 1
  fi
  echo "✅ ops/readiness/remediate-output-gates preview OK (candidates: ${OPS_READINESS_REMEDIATION_PREVIEW_CANDIDATES}, fixable: ${OPS_READINESS_REMEDIATION_PREVIEW_FIXABLE})"

  OPS_MANIFEST_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/state/manifest" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_MANIFEST_COUNT="$(printf '%s' "$OPS_MANIFEST_RESPONSE" | json_get stores | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
  echo "✅ ops/state/manifest OK (stores: ${OPS_MANIFEST_COUNT})"

  OPS_SECRETS_STATUS_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/secrets/status" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_SECRETS_TRACKED="$(printf '%s' "$OPS_SECRETS_STATUS_RESPONSE" | json_get totals.tracked)"
  OPS_SECRETS_STALE_REQUIRED="$(printf '%s' "$OPS_SECRETS_STATUS_RESPONSE" | json_get totals.staleRequired)"
  OPS_SECRETS_PENDING="$(printf '%s' "$OPS_SECRETS_STATUS_RESPONSE" | json_get totals.pendingRotation)"
  if [[ "${OPS_SECRETS_TRACKED}" -lt 1 ]]; then
    echo "❌ ops/secrets/status returnerade inga tracked secrets"
    printf '%s\n' "$OPS_SECRETS_STATUS_RESPONSE"
    exit 1
  fi
  echo "✅ ops/secrets/status OK (tracked: ${OPS_SECRETS_TRACKED}, staleRequired: ${OPS_SECRETS_STALE_REQUIRED}, pending: ${OPS_SECRETS_PENDING})"

  OPS_SECRETS_SNAPSHOT_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/secrets/snapshot" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true,"note":"Smoke preview snapshot"}')"
  OPS_SECRETS_SNAPSHOT_DRYRUN="$(printf '%s' "$OPS_SECRETS_SNAPSHOT_PREVIEW_RESPONSE" | json_get dryRun)"
  if [[ "$OPS_SECRETS_SNAPSHOT_DRYRUN" != "true" ]]; then
    echo "❌ ops/secrets/snapshot preview saknar dryRun=true"
    printf '%s\n' "$OPS_SECRETS_SNAPSHOT_PREVIEW_RESPONSE"
    exit 1
  fi
  echo "✅ ops/secrets/snapshot preview OK"

  OPS_SECRETS_HISTORY_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/secrets/history?limit=5" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_SECRETS_HISTORY_COUNT="$(printf '%s' "$OPS_SECRETS_HISTORY_RESPONSE" | json_get count)"
  if [[ "${OPS_SECRETS_HISTORY_COUNT}" -lt 1 ]]; then
    echo "❌ ops/secrets/history returnerade tom historik"
    printf '%s\n' "$OPS_SECRETS_HISTORY_RESPONSE"
    exit 1
  fi
  echo "✅ ops/secrets/history OK (count: ${OPS_SECRETS_HISTORY_COUNT})"

  OPS_BACKUP_CREATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/backup" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}')"
  OPS_BACKUP_FILE="$(printf '%s' "$OPS_BACKUP_CREATE_RESPONSE" | json_get backup.fileName)"
  echo "✅ ops/state/backup OK (file: ${OPS_BACKUP_FILE})"

  OPS_BACKUPS_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/state/backups?limit=5" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_BACKUPS_COUNT="$(printf '%s' "$OPS_BACKUPS_RESPONSE" | json_get count)"
  echo "✅ ops/state/backups OK (count: ${OPS_BACKUPS_COUNT})"

  OPS_PRUNE_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/backups/prune" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true}')"
  OPS_PRUNE_PREVIEW_COUNT="$(printf '%s' "$OPS_PRUNE_PREVIEW_RESPONSE" | json_get deletedCount)"
  echo "✅ ops/state/backups/prune preview OK (deleted: ${OPS_PRUNE_PREVIEW_COUNT})"

  OPS_RESTORE_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/state/restore" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"fileName\":\"${OPS_BACKUP_FILE}\",\"dryRun\":true}")"
  OPS_RESTORE_PREVIEW_COUNT="$(printf '%s' "$OPS_RESTORE_PREVIEW_RESPONSE" | json_get preview.stores | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.filter((row)=>row&&row.willRestore).length:0));")"
  echo "✅ ops/state/restore preview OK (willRestore: ${OPS_RESTORE_PREVIEW_COUNT})"

  OPS_SCHED_STATUS_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/scheduler/status" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_SCHED_ENABLED="$(printf '%s' "$OPS_SCHED_STATUS_RESPONSE" | json_get scheduler.enabled)"
  OPS_SCHED_JOB_COUNT="$(printf '%s' "$OPS_SCHED_STATUS_RESPONSE" | json_get scheduler.jobs | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
  echo "✅ ops/scheduler/status OK (enabled: ${OPS_SCHED_ENABLED}, jobs: ${OPS_SCHED_JOB_COUNT})"

  OPS_SCHED_SUITE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/scheduler/run" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jobId":"required_suite"}')"
  OPS_SCHED_SUITE_OK="$(printf '%s' "$OPS_SCHED_SUITE_RESPONSE" | json_get ok 2>/dev/null || true)"
  OPS_SCHED_SUITE_TOTAL="$(printf '%s' "$OPS_SCHED_SUITE_RESPONSE" | json_get suite.total 2>/dev/null || true)"
  OPS_SCHED_SUITE_FAILED="$(printf '%s' "$OPS_SCHED_SUITE_RESPONSE" | json_get suite.failed 2>/dev/null || true)"
  if [[ "$OPS_SCHED_SUITE_OK" == "true" ]]; then
    if [[ -z "$OPS_SCHED_SUITE_TOTAL" || "$OPS_SCHED_SUITE_TOTAL" -lt 4 ]]; then
      echo "❌ ops/scheduler/run required_suite saknar full suite-total"
      printf '%s\n' "$OPS_SCHED_SUITE_RESPONSE"
      exit 1
    fi
    echo "✅ ops/scheduler/run required_suite OK (total: ${OPS_SCHED_SUITE_TOTAL}, failed: ${OPS_SCHED_SUITE_FAILED})"
  else
    echo "❌ ops/scheduler/run required_suite misslyckades"
    printf '%s\n' "$OPS_SCHED_SUITE_RESPONSE"
    exit 1
  fi

  OPS_SCHED_RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/scheduler/run" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jobId":"alert_probe"}')"
  OPS_SCHED_RUN_OK="$(printf '%s' "$OPS_SCHED_RUN_RESPONSE" | json_get ok 2>/dev/null || true)"
  OPS_SCHED_RUN_ERROR="$(printf '%s' "$OPS_SCHED_RUN_RESPONSE" | json_get error 2>/dev/null || true)"
  if [[ "$OPS_SCHED_RUN_OK" == "true" ]]; then
    OPS_SCHED_RUN_JOB="$(printf '%s' "$OPS_SCHED_RUN_RESPONSE" | json_get jobId)"
    OPS_SCHED_AUTO_ASSIGNED="$(printf '%s' "$OPS_SCHED_RUN_RESPONSE" | json_get result.autoAssignedOwnerCount 2>/dev/null || true)"
    OPS_SCHED_AUTO_ESCALATED="$(printf '%s' "$OPS_SCHED_RUN_RESPONSE" | json_get result.autoEscalatedCount 2>/dev/null || true)"
    if [[ -z "$OPS_SCHED_AUTO_ASSIGNED" || -z "$OPS_SCHED_AUTO_ESCALATED" ]]; then
      echo "❌ ops/scheduler/run saknar expected auto-assignment/escalation-fält"
      printf '%s\n' "$OPS_SCHED_RUN_RESPONSE"
      exit 1
    fi
    echo "✅ ops/scheduler/run OK (job: ${OPS_SCHED_RUN_JOB}, auto-assigned: ${OPS_SCHED_AUTO_ASSIGNED}, auto-escalated: ${OPS_SCHED_AUTO_ESCALATED})"
  elif [[ "$OPS_SCHED_RUN_ERROR" == "disabled_job" || "$OPS_SCHED_RUN_ERROR" == "job_running" ]]; then
    echo "ℹ️ ops/scheduler/run SKIP (${OPS_SCHED_RUN_ERROR})"
  else
    echo "❌ ops/scheduler/run misslyckades"
    printf '%s\n' "$OPS_SCHED_RUN_RESPONSE"
    exit 1
  fi

  OPS_SCHED_REPORT_RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/scheduler/run" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jobId":"nightly_pilot_report"}')"
  OPS_SCHED_REPORT_RUN_OK="$(printf '%s' "$OPS_SCHED_REPORT_RUN_RESPONSE" | json_get ok 2>/dev/null || true)"
  OPS_SCHED_REPORT_RUN_ERROR="$(printf '%s' "$OPS_SCHED_REPORT_RUN_RESPONSE" | json_get error 2>/dev/null || true)"
  if [[ "$OPS_SCHED_REPORT_RUN_OK" == "true" ]]; then
    OPS_SCHED_REPORT_RUN_JOB="$(printf '%s' "$OPS_SCHED_REPORT_RUN_RESPONSE" | json_get jobId)"
    OPS_SCHED_REPORT_FILE="$(printf '%s' "$OPS_SCHED_REPORT_RUN_RESPONSE" | json_get result.fileName 2>/dev/null || true)"
    OPS_SCHED_REPORT_PRUNE_DELETED="$(printf '%s' "$OPS_SCHED_REPORT_RUN_RESPONSE" | json_get result.pruneDeletedCount 2>/dev/null || true)"
    if [[ -z "$OPS_SCHED_REPORT_FILE" || -z "$OPS_SCHED_REPORT_PRUNE_DELETED" ]]; then
      echo "❌ ops/scheduler/run nightly_pilot_report saknar expected report/prune-fält"
      printf '%s\n' "$OPS_SCHED_REPORT_RUN_RESPONSE"
      exit 1
    fi
    echo "✅ ops/scheduler/run nightly_pilot_report OK (job: ${OPS_SCHED_REPORT_RUN_JOB}, file: ${OPS_SCHED_REPORT_FILE}, pruneDeleted: ${OPS_SCHED_REPORT_PRUNE_DELETED})"
  elif [[ "$OPS_SCHED_REPORT_RUN_ERROR" == "disabled_job" || "$OPS_SCHED_REPORT_RUN_ERROR" == "job_running" ]]; then
    echo "ℹ️ ops/scheduler/run nightly_pilot_report SKIP (${OPS_SCHED_REPORT_RUN_ERROR})"
  else
    echo "❌ ops/scheduler/run nightly_pilot_report misslyckades"
    printf '%s\n' "$OPS_SCHED_REPORT_RUN_RESPONSE"
    exit 1
  fi

  OPS_REPORTS_LIST_RESPONSE="$(curl -s "$BASE_URL/api/v1/ops/reports?limit=20" \
    -H "Authorization: Bearer $TOKEN")"
  OPS_REPORTS_LIST_COUNT="$(printf '%s' "$OPS_REPORTS_LIST_RESPONSE" | json_get count 2>/dev/null || true)"
  OPS_REPORTS_FIRST_FILE="$(printf '%s' "$OPS_REPORTS_LIST_RESPONSE" | json_get reports.0.fileName 2>/dev/null || true)"
  if [[ -z "$OPS_REPORTS_LIST_COUNT" || -z "$OPS_REPORTS_FIRST_FILE" ]]; then
    echo "❌ ops/reports saknar expected count/fileName-fält"
    printf '%s\n' "$OPS_REPORTS_LIST_RESPONSE"
    exit 1
  fi
  if [[ "$OPS_REPORTS_FIRST_FILE" != Pilot_Scheduler_* ]]; then
    echo "❌ ops/reports returnerade oväntat filnamn: $OPS_REPORTS_FIRST_FILE"
    printf '%s\n' "$OPS_REPORTS_LIST_RESPONSE"
    exit 1
  fi
  echo "✅ ops/reports OK (count: ${OPS_REPORTS_LIST_COUNT}, latest: ${OPS_REPORTS_FIRST_FILE})"

  OPS_REPORTS_PRUNE_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/reports/prune" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true}')"
  OPS_REPORTS_PRUNE_PREVIEW_COUNT="$(printf '%s' "$OPS_REPORTS_PRUNE_PREVIEW_RESPONSE" | json_get deletedCount 2>/dev/null || true)"
  if [[ -z "$OPS_REPORTS_PRUNE_PREVIEW_COUNT" ]]; then
    echo "❌ ops/reports/prune preview saknar deletedCount"
    printf '%s\n' "$OPS_REPORTS_PRUNE_PREVIEW_RESPONSE"
    exit 1
  fi
  echo "✅ ops/reports/prune preview OK (deleted: ${OPS_REPORTS_PRUNE_PREVIEW_COUNT})"

  MONITOR_AFTER_REPORT_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/status" \
    -H "Authorization: Bearer $TOKEN")"
  MONITOR_AFTER_REPORT_HEALTHY="$(printf '%s' "$MONITOR_AFTER_REPORT_RESPONSE" | json_get gates.pilotReport.healthy 2>/dev/null || true)"
  MONITOR_AFTER_REPORT_NOGO="$(printf '%s' "$MONITOR_AFTER_REPORT_RESPONSE" | json_get gates.pilotReport.noGo 2>/dev/null || true)"
  if [[ "$MONITOR_AFTER_REPORT_HEALTHY" != "true" || "$MONITOR_AFTER_REPORT_NOGO" != "false" ]]; then
    echo "❌ monitor/status pilot-report gate uppdaterades inte efter nightly_pilot_report"
    printf '%s\n' "$MONITOR_AFTER_REPORT_RESPONSE"
    exit 1
  fi
  echo "✅ monitor/status pilot-report gate OK efter nightly_pilot_report"

  OPS_SCHED_RESTORE_RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/ops/scheduler/run" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"jobId":"restore_drill_preview"}')"
  OPS_SCHED_RESTORE_RUN_OK="$(printf '%s' "$OPS_SCHED_RESTORE_RUN_RESPONSE" | json_get ok 2>/dev/null || true)"
  OPS_SCHED_RESTORE_RUN_ERROR="$(printf '%s' "$OPS_SCHED_RESTORE_RUN_RESPONSE" | json_get error 2>/dev/null || true)"
  if [[ "$OPS_SCHED_RESTORE_RUN_OK" == "true" ]]; then
    OPS_SCHED_RESTORE_RUN_JOB="$(printf '%s' "$OPS_SCHED_RESTORE_RUN_RESPONSE" | json_get jobId)"
    echo "✅ ops/scheduler/run restore OK (job: ${OPS_SCHED_RESTORE_RUN_JOB})"

    MONITOR_AFTER_RESTORE_RESPONSE="$(curl -s "$BASE_URL/api/v1/monitor/status" \
      -H "Authorization: Bearer $TOKEN")"
    MONITOR_AFTER_RESTORE_HEALTHY="$(printf '%s' "$MONITOR_AFTER_RESTORE_RESPONSE" | json_get gates.restoreDrill.healthy 2>/dev/null || true)"
    MONITOR_AFTER_RESTORE_NOGO="$(printf '%s' "$MONITOR_AFTER_RESTORE_RESPONSE" | json_get gates.restoreDrill.noGo 2>/dev/null || true)"
    if [[ "$MONITOR_AFTER_RESTORE_HEALTHY" != "true" || "$MONITOR_AFTER_RESTORE_NOGO" != "false" ]]; then
      echo "❌ monitor/status restore-drill gate uppdaterades inte efter restore_drill_preview"
      printf '%s\n' "$MONITOR_AFTER_RESTORE_RESPONSE"
      exit 1
    fi
    echo "✅ monitor/status restore gate OK efter restore_drill_preview"
  elif [[ "$OPS_SCHED_RESTORE_RUN_ERROR" == "disabled_job" || "$OPS_SCHED_RESTORE_RUN_ERROR" == "job_running" ]]; then
    echo "ℹ️ ops/scheduler/run restore SKIP (${OPS_SCHED_RESTORE_RUN_ERROR})"
  else
    echo "❌ ops/scheduler/run restore misslyckades"
    printf '%s\n' "$OPS_SCHED_RESTORE_RUN_RESPONSE"
    exit 1
  fi
fi

META_RESPONSE="$(curl -s "$BASE_URL/api/v1/templates/meta" \
  -H "Authorization: Bearer $TOKEN")"
CATEGORY_COUNT="$(printf '%s' "$META_RESPONSE" | json_get categories | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
echo "✅ templates/meta OK (kategorier: $CATEGORY_COUNT)"

RISK_SETTINGS_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/settings" \
  -H "Authorization: Bearer $TOKEN")"
RISK_MODIFIER="$(printf '%s' "$RISK_SETTINGS_RESPONSE" | json_get settings.riskSensitivityModifier)"
RISK_VERSION_BEFORE="$(printf '%s' "$RISK_SETTINGS_RESPONSE" | json_get settings.riskThresholdVersion)"
if [[ -z "$RISK_VERSION_BEFORE" || "$RISK_VERSION_BEFORE" == "null" ]]; then
  echo "❌ risk/settings saknar riskThresholdVersion"
  printf '%s\n' "$RISK_SETTINGS_RESPONSE"
  exit 1
fi
echo "✅ risk/settings OK (modifier: ${RISK_MODIFIER}, version: ${RISK_VERSION_BEFORE})"

RISK_VERSIONS_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/settings/versions?limit=5" \
  -H "Authorization: Bearer $TOKEN")"
RISK_VERSIONS_COUNT="$(printf '%s' "$RISK_VERSIONS_RESPONSE" | json_get count)"
if [[ "${RISK_VERSIONS_COUNT}" -lt 1 ]]; then
  echo "❌ risk/settings/versions returnerade inga versioner"
  printf '%s\n' "$RISK_VERSIONS_RESPONSE"
  exit 1
fi
echo "✅ risk/settings/versions OK (count: ${RISK_VERSIONS_COUNT})"

RISK_TEMP_MODIFIER="$(node -e "const curr=Number(process.argv[1]); let next=Number.isFinite(curr)?curr+0.25:0.25; if(next>10) next=curr-0.25; if(next<-10) next=curr+0.25; if(Math.abs(next-curr)<0.001) next=curr>=0?curr-0.5:curr+0.5; if(next>10) next=10; if(next<-10) next=-10; process.stdout.write(String(Number(next.toFixed(2))));" "$RISK_MODIFIER")"
RISK_PATCH_RESPONSE="$(curl -s -X PATCH "$BASE_URL/api/v1/risk/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"riskSensitivityModifier\":${RISK_TEMP_MODIFIER},\"note\":\"Smoke temporary modifier change\"}")"
RISK_PATCH_MODIFIER="$(printf '%s' "$RISK_PATCH_RESPONSE" | json_get settings.riskSensitivityModifier)"
RISK_PATCH_VERSION="$(printf '%s' "$RISK_PATCH_RESPONSE" | json_get settings.riskThresholdVersion)"
if ! node -e "const a=Number(process.argv[1]); const b=Number(process.argv[2]); process.exit(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.001?0:1);" "$RISK_PATCH_MODIFIER" "$RISK_TEMP_MODIFIER"; then
  echo "❌ risk/settings patch modifier mismatch (expected: ${RISK_TEMP_MODIFIER}, got: ${RISK_PATCH_MODIFIER})"
  printf '%s\n' "$RISK_PATCH_RESPONSE"
  exit 1
fi
echo "✅ risk/settings patch OK (modifier: ${RISK_PATCH_MODIFIER}, version: ${RISK_PATCH_VERSION})"

RISK_ROLLBACK_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/settings/rollback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"version\":${RISK_VERSION_BEFORE},\"note\":\"Smoke rollback to baseline\"}")"
RISK_ROLLBACK_MODIFIER="$(printf '%s' "$RISK_ROLLBACK_RESPONSE" | json_get settings.riskSensitivityModifier)"
RISK_ROLLBACK_VERSION="$(printf '%s' "$RISK_ROLLBACK_RESPONSE" | json_get settings.riskThresholdVersion)"
if ! node -e "const a=Number(process.argv[1]); const b=Number(process.argv[2]); process.exit(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=0.001?0:1);" "$RISK_ROLLBACK_MODIFIER" "$RISK_MODIFIER"; then
  echo "❌ risk/settings rollback gav fel modifier (expected: ${RISK_MODIFIER}, got: ${RISK_ROLLBACK_MODIFIER})"
  printf '%s\n' "$RISK_ROLLBACK_RESPONSE"
  exit 1
fi
echo "✅ risk/settings rollback OK (modifier: ${RISK_ROLLBACK_MODIFIER}, version: ${RISK_ROLLBACK_VERSION})"

RISK_PRECISION_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/precision/report" \
  -H "Authorization: Bearer $TOKEN")"
RISK_PRECISION_CASES="$(printf '%s' "$RISK_PRECISION_RESPONSE" | json_get report.totals.cases)"
RISK_PRECISION_BAND_ACC="$(printf '%s' "$RISK_PRECISION_RESPONSE" | json_get report.totals.bandAccuracyPercent)"
if [[ "${RISK_PRECISION_CASES}" -lt 150 ]]; then
  echo "❌ risk/precision/report returnerade för få cases (${RISK_PRECISION_CASES})"
  printf '%s\n' "$RISK_PRECISION_RESPONSE"
  exit 1
fi
echo "✅ risk/precision/report OK (cases: ${RISK_PRECISION_CASES}, bandAccuracy: ${RISK_PRECISION_BAND_ACC}%)"

POLICY_FLOOR_RESPONSE="$(curl -s "$BASE_URL/api/v1/policy/floor" \
  -H "Authorization: Bearer $TOKEN")"
POLICY_RULE_COUNT="$(printf '%s' "$POLICY_FLOOR_RESPONSE" | json_get policyFloor.rules | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
echo "✅ policy/floor OK (rules: ${POLICY_RULE_COUNT})"

TEMPLATE_NAME="Smoke mall $(date +%s)"
CREATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"category\":\"CONSULTATION\",\"name\":\"$TEMPLATE_NAME\",\"channel\":\"email\",\"locale\":\"sv-SE\"}")"
TEMPLATE_ID="$(printf '%s' "$CREATE_RESPONSE" | json_get template.id)"
echo "✅ template skapad ($TEMPLATE_ID)"

DRAFT_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/drafts/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instruction":"Skriv en vänlig konsultationsbekräftelse med variabel {{patient_name}}."}')"
VERSION_ID="$(printf '%s' "$DRAFT_RESPONSE" | json_get version.id)"
GEN_PROVIDER="$(printf '%s' "$DRAFT_RESPONSE" | json_get generation.provider || true)"
echo "✅ draft genererad ($VERSION_ID, provider: ${GEN_PROVIDER:-unknown})"

UPDATED_CONTENT="Hej {{patient_name}}, detta är en uppdaterad konsultationsbekräftelse från {{clinic_name}}."
UPDATE_RESPONSE="$(curl -s -X PATCH "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Smoke uppdaterad version\",\"content\":\"$UPDATED_CONTENT\",\"instruction\":\"Uppdatera tonen men behåll kliniskt säkra formuleringar.\"}")"
UPDATED_VERSION_ID="$(printf '%s' "$UPDATE_RESPONSE" | json_get version.id)"
UPDATED_DECISION="$(printf '%s' "$UPDATE_RESPONSE" | json_get version.risk.decision)"
echo "✅ update_draft OK (${UPDATED_VERSION_ID}, decision: ${UPDATED_DECISION})"

EVALUATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID/evaluate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')"
RISK_LEVEL="$(printf '%s' "$EVALUATE_RESPONSE" | json_get version.risk.riskLevel)"
RISK_DECISION="$(printf '%s' "$EVALUATE_RESPONSE" | json_get version.risk.decision)"
echo "✅ evaluate OK (risk: ${RISK_LEVEL}, decision: ${RISK_DECISION})"

RISK_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/evaluations?minRiskLevel=1&limit=5&templateId=$TEMPLATE_ID&templateVersionId=$VERSION_ID" \
  -H "Authorization: Bearer $TOKEN")"
RISK_COUNT="$(printf '%s' "$RISK_RESPONSE" | json_get count)"
echo "✅ risk/evaluations OK (count: ${RISK_COUNT})"

EVALUATION_ID="$(printf '%s' "$RISK_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d?.evaluations?.[0]?.id||''));")"
if [[ "$RISK_DECISION" != "allow" && -n "$EVALUATION_ID" ]]; then
  PRE_ACT_OWNER_ACTION="$(curl -s -X POST "$BASE_URL/api/v1/risk/evaluations/$EVALUATION_ID/owner-action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"approve_exception","note":"Smoke test activation gate override."}')"
  PRE_ACT_OWNER_DECISION="$(printf '%s' "$PRE_ACT_OWNER_ACTION" | json_get evaluation.ownerDecision)"
  echo "✅ pre-activate owner-action OK (decision: ${PRE_ACT_OWNER_DECISION})"
fi

ACTIVATE_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/templates/$TEMPLATE_ID/versions/$VERSION_ID/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')"
STATUS="$(printf '%s' "$ACTIVATE_RESPONSE" | json_get version.state)"
echo "✅ activate OK (state: ${STATUS})"

if [[ -n "$EVALUATION_ID" ]]; then
  OWNER_ACTION_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/evaluations/$EVALUATION_ID/owner-action" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"request_revision","note":"Smoke test owner action."}')"
  OWNER_DECISION="$(printf '%s' "$OWNER_ACTION_RESPONSE" | json_get evaluation.ownerDecision)"
  echo "✅ owner-action OK (decision: ${OWNER_DECISION})"
fi

PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"CONSULTATION","scope":"output","content":"Detta är en trygg konsultationsbekräftelse för {{clinic_name}} med variabel {{first_name}}.","variables":["clinic_name","first_name"]}')"
PREVIEW_LEVEL="$(printf '%s' "$PREVIEW_RESPONSE" | json_get evaluation.riskLevel)"
echo "✅ risk/preview OK (riskLevel: ${PREVIEW_LEVEL})"

CALIBRATION_SUGGESTION_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/calibration/suggestion" \
  -H "Authorization: Bearer $TOKEN")"
SUGGESTED_MODIFIER="$(printf '%s' "$CALIBRATION_SUGGESTION_RESPONSE" | json_get suggestion.suggestedModifier)"
echo "✅ risk/calibration/suggestion OK (suggestedModifier: ${SUGGESTED_MODIFIER})"

CALIBRATION_APPLY_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/risk/calibration/apply-suggestion" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"suggestedModifier\":${SUGGESTED_MODIFIER},\"note\":\"Smoke test apply suggestion\"}")"
APPLIED_MODIFIER="$(printf '%s' "$CALIBRATION_APPLY_RESPONSE" | json_get settings.riskSensitivityModifier)"
echo "✅ risk/calibration/apply-suggestion OK (applied: ${APPLIED_MODIFIER})"

RESTORE_MODIFIER_RESPONSE="$(curl -s -X PATCH "$BASE_URL/api/v1/risk/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"riskSensitivityModifier\":${RISK_MODIFIER}}")"
RESTORED_MODIFIER="$(printf '%s' "$RESTORE_MODIFIER_RESPONSE" | json_get settings.riskSensitivityModifier)"
echo "✅ risk/settings restore OK (modifier: ${RESTORED_MODIFIER})"

ORCHESTRATOR_META_RESPONSE="$(curl -s "$BASE_URL/api/v1/orchestrator/meta" \
  -H "Authorization: Bearer $TOKEN")"
ORCHESTRATOR_AGENT_COUNT="$(printf '%s' "$ORCHESTRATOR_META_RESPONSE" | json_get agents | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d&&typeof d==='object'?Object.keys(d).length:0));")"
echo "✅ orchestrator/meta OK (agents: ${ORCHESTRATOR_AGENT_COUNT})"

ORCHESTRATOR_RUN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/orchestrator/admin-run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Granska riskläget och föreslå owner actions för high/critical idag."}')"
ORCHESTRATOR_INTENT="$(printf '%s' "$ORCHESTRATOR_RUN_RESPONSE" | json_get intent)"
echo "✅ orchestrator/admin-run OK (intent: ${ORCHESTRATOR_INTENT})"

REPORT_RESPONSE="$(curl -s "$BASE_URL/api/v1/reports/pilot?days=14" \
  -H "Authorization: Bearer $TOKEN")"
REPORT_EVALS="$(printf '%s' "$REPORT_RESPONSE" | json_get kpis.evaluationsTotal)"
echo "✅ reports/pilot OK (evaluations: ${REPORT_EVALS})"

MAIL_INSIGHTS_RESPONSE="$(curl -s "$BASE_URL/api/v1/mail/insights" \
  -H "Authorization: Bearer $TOKEN")"
MAIL_READY="$(printf '%s' "$MAIL_INSIGHTS_RESPONSE" | json_get ready)"
MAIL_QA_PAIRS="$(printf '%s' "$MAIL_INSIGHTS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const v=d?.report?.counts?.qaPairs; process.stdout.write(String(Number.isFinite(Number(v))?Number(v):0));")"
echo "✅ mail/insights OK (ready: ${MAIL_READY}, qaPairs: ${MAIL_QA_PAIRS})"

if [[ "$CURRENT_ROLE" == "OWNER" ]]; then
  MAIL_SEED_PREVIEW_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/mail/template-seeds/apply" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"dryRun":true,"limit":2}')"
  if MAIL_SEED_PREVIEW_SELECTED="$(printf '%s' "$MAIL_SEED_PREVIEW_RESPONSE" | json_get selected 2>/dev/null)"; then
    echo "✅ mail/template-seeds/apply preview OK (selected: ${MAIL_SEED_PREVIEW_SELECTED})"
  else
    MAIL_SEED_PREVIEW_ERROR="$(printf '%s' "$MAIL_SEED_PREVIEW_RESPONSE" | json_get error 2>/dev/null || true)"
    if [[ "$MAIL_SEED_PREVIEW_ERROR" == *"Hittade inga template seeds"* ]]; then
      echo "ℹ️ mail/template-seeds/apply preview SKIP (${MAIL_SEED_PREVIEW_ERROR})"
    else
      echo "❌ mail/template-seeds/apply preview misslyckades"
      printf '%s\n' "$MAIL_SEED_PREVIEW_RESPONSE"
      exit 1
    fi
  fi
else
  echo "ℹ️ mail/template-seeds/apply preview SKIP (ej OWNER)"
fi

SUMMARY_RESPONSE="$(curl -s "$BASE_URL/api/v1/risk/summary?minRiskLevel=1" \
  -H "Authorization: Bearer $TOKEN")"
SUMMARY_TOTAL="$(printf '%s' "$SUMMARY_RESPONSE" | json_get totals.evaluations)"
echo "✅ risk/summary OK (evaluations: ${SUMMARY_TOTAL})"

INCIDENT_SUMMARY_RESPONSE="$(curl -s "$BASE_URL/api/v1/incidents/summary" \
  -H "Authorization: Bearer $TOKEN")"
INCIDENTS_TOTAL="$(printf '%s' "$INCIDENT_SUMMARY_RESPONSE" | json_get totals.incidents)"
INCIDENTS_OPEN="$(printf '%s' "$INCIDENT_SUMMARY_RESPONSE" | json_get totals.openUnresolved)"
INCIDENTS_BREACHED="$(printf '%s' "$INCIDENT_SUMMARY_RESPONSE" | json_get totals.breachedOpen)"
echo "✅ incidents/summary OK (all: ${INCIDENTS_TOTAL}, open: ${INCIDENTS_OPEN}, breached: ${INCIDENTS_BREACHED})"

INCIDENT_LIST_RESPONSE="$(curl -s "$BASE_URL/api/v1/incidents?status=open&limit=5" \
  -H "Authorization: Bearer $TOKEN")"
INCIDENT_LIST_COUNT="$(printf '%s' "$INCIDENT_LIST_RESPONSE" | json_get count)"
echo "✅ incidents list OK (open count: ${INCIDENT_LIST_COUNT})"

if [[ "$INCIDENT_LIST_COUNT" -gt 0 ]]; then
  INCIDENT_ID="$(printf '%s' "$INCIDENT_LIST_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d?.incidents?.[0]?.id||''));")"
  INCIDENT_DETAIL_RESPONSE="$(curl -s "$BASE_URL/api/v1/incidents/$INCIDENT_ID" \
    -H "Authorization: Bearer $TOKEN")"
  INCIDENT_DETAIL_STATUS="$(printf '%s' "$INCIDENT_DETAIL_RESPONSE" | json_get incident.status)"
  INCIDENT_DETAIL_SEVERITY="$(printf '%s' "$INCIDENT_DETAIL_RESPONSE" | json_get incident.severity)"
  echo "✅ incidents detail OK (${INCIDENT_ID}, status: ${INCIDENT_DETAIL_STATUS}, severity: ${INCIDENT_DETAIL_SEVERITY})"
fi

AUDIT_INTEGRITY_RESPONSE="$(curl -s "$BASE_URL/api/v1/audit/integrity?maxIssues=25" \
  -H "Authorization: Bearer $TOKEN")"
AUDIT_CHAIN_OK="$(printf '%s' "$AUDIT_INTEGRITY_RESPONSE" | json_get ok)"
AUDIT_CHAIN_ISSUES="$(printf '%s' "$AUDIT_INTEGRITY_RESPONSE" | json_get issues | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(Array.isArray(d)?d.length:0));")"
if [[ "$AUDIT_CHAIN_OK" != "true" ]]; then
  echo "❌ audit/integrity misslyckades (issues: ${AUDIT_CHAIN_ISSUES})"
  printf '%s\n' "$AUDIT_INTEGRITY_RESPONSE"
  exit 1
fi
echo "✅ audit/integrity OK (issues: ${AUDIT_CHAIN_ISSUES})"

AUDIT_EVENTS_RESPONSE="$(curl -s "$BASE_URL/api/v1/audit/events?limit=5" \
  -H "Authorization: Bearer $TOKEN")"
AUDIT_CORRELATION_ID="$(printf '%s' "$AUDIT_EVENTS_RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const id=d?.events?.[0]?.metadata?.correlationId||''; process.stdout.write(String(id));" 2>/dev/null || true)"
if [[ -z "$AUDIT_CORRELATION_ID" ]]; then
  echo "❌ audit/events saknar metadata.correlationId i senaste event"
  printf '%s\n' "$AUDIT_EVENTS_RESPONSE"
  exit 1
fi
echo "✅ audit/events correlation-id OK (${AUDIT_CORRELATION_ID})"

echo
echo "🎯 Smoke test klart."
