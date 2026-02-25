#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
DAYS="${ARCANA_PILOT_REPORT_DAYS:-14}"
OUT_FILE="${ARCANA_PILOT_REPORT_OUT:-}"
MFA_CODE="${ARCANA_OWNER_MFA_CODE:-}"
MFA_SECRET="${ARCANA_OWNER_MFA_SECRET:-}"
READINESS_MODE="${ARCANA_PILOT_REPORT_READINESS_MODE:-full}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --password)
      PASSWORD="${2:-}"
      shift 2
      ;;
    --tenant)
      TENANT_ID="${2:-}"
      shift 2
      ;;
    --days)
      DAYS="${2:-}"
      shift 2
      ;;
    --out)
      OUT_FILE="${2:-}"
      shift 2
      ;;
    --mfa-code)
      MFA_CODE="${2:-}"
      shift 2
      ;;
    --mfa-secret)
      MFA_SECRET="${2:-}"
      shift 2
      ;;
    --readiness-mode)
      READINESS_MODE="${2:-}"
      shift 2
      ;;
    *)
      echo "Okänd flagga: $1"
      echo "Använd: [--base-url URL] [--email EMAIL] [--password PASSWORD] [--tenant TENANT] [--days 14] [--out FIL] [--mfa-code 123456] [--mfa-secret BASE32] [--readiness-mode compact|full]"
      exit 1
      ;;
  esac
done

BASE_URL="${BASE_URL%/}"

dotenv_get() {
  local key="$1"
  if [[ ! -f ".env" ]]; then
    return 1
  fi
  node -e "
const fs = require('fs');
const key = process.argv[1];
const raw = fs.readFileSync('.env', 'utf8');
for (const lineRaw of raw.split(/\\r?\\n/)) {
  const line = String(lineRaw || '').trim();
  if (!line || line.startsWith('#')) continue;
  const index = line.indexOf('=');
  if (index === -1) continue;
  const currentKey = line.slice(0, index).trim();
  if (currentKey !== key) continue;
  let value = line.slice(index + 1).trim();
  if (
    (value.startsWith('\"') && value.endsWith('\"')) ||
    (value.startsWith(\"'\") && value.endsWith(\"'\"))
  ) {
    value = value.slice(1, -1);
  }
  process.stdout.write(value);
  process.exit(0);
}
process.exit(1);
" "$key" 2>/dev/null || true
}

json_get() {
  local path="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(input); } catch {
  process.exit(2);
}
let ref = data;
for (const key of process.argv[1].split('.')) {
  if (!key) continue;
  ref = ref?.[key];
}
if (ref === undefined || ref === null) process.exit(3);
if (typeof ref === 'object') process.stdout.write(JSON.stringify(ref));
else process.stdout.write(String(ref));
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
    bits -= 8;
    bytes.push((value >>> bits) & 0xff);
  }
}
const key = Buffer.from(bytes);
if (!key.length) process.exit(1);
const step = 30;
const counter = Math.floor(Date.now() / 1000 / step);
const msg = Buffer.alloc(8);
msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
msg.writeUInt32BE(counter >>> 0, 4);
const hmac = crypto.createHmac('sha1', key).update(msg).digest();
const offset = hmac[hmac.length - 1] & 0x0f;
const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
process.stdout.write(code);
" "$secret"
}

complete_login_with_optional_mfa() {
  local login_response="$1"
  local requested_tenant_id="$2"
  local email="$3"
  local mfa_code_override="$4"
  local mfa_secret_override="$5"

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

  local mfa_code="$mfa_code_override"
  if [[ -z "$mfa_code" ]]; then
    local mfa_secret="$mfa_secret_override"
    if [[ -z "$mfa_secret" ]]; then
      mfa_secret="$(printf '%s' "$login_response" | json_get mfa.secret 2>/dev/null || true)"
    fi
    if [[ -z "$mfa_secret" ]]; then
      mfa_secret="$(read_mfa_secret_from_store "$email" 2>/dev/null || true)"
    fi
    if [[ -n "$mfa_secret" ]]; then
      mfa_code="$(generate_totp_code "$mfa_secret" 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$mfa_code" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_verify_response=""
  mfa_verify_response="$(curl -sS -X POST "$BASE_URL/api/v1/auth/mfa/verify" \
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
      tenant_select_response="$(curl -sS -X POST "$BASE_URL/api/v1/auth/select-tenant" \
        -H "Content-Type: application/json" \
        -d "{\"loginTicket\":\"$login_ticket\",\"tenantId\":\"$selected_tenant_id\"}")"
      printf '%s' "$tenant_select_response"
      return 0
    fi
  fi

  printf '%s' "$mfa_verify_response"
  return 0
}

if [[ -z "$EMAIL" ]]; then
  EMAIL="$(dotenv_get ARCANA_OWNER_EMAIL || true)"
fi
if [[ -z "$PASSWORD" ]]; then
  PASSWORD="$(dotenv_get ARCANA_OWNER_PASSWORD || true)"
fi
if [[ -z "${ARCANA_DEFAULT_TENANT:-}" ]]; then
  DOTENV_TENANT="$(dotenv_get ARCANA_DEFAULT_TENANT || true)"
  if [[ -n "$DOTENV_TENANT" ]]; then
    TENANT_ID="$DOTENV_TENANT"
  fi
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "❌ Saknar credentials. Sätt ARCANA_OWNER_EMAIL och ARCANA_OWNER_PASSWORD."
  echo "   Exempel:"
  echo "   BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com ARCANA_OWNER_PASSWORD='***' npm run report:pilot"
  exit 1
fi

if ! [[ "$DAYS" =~ ^[0-9]+$ ]]; then
  echo "❌ --days måste vara ett heltal."
  exit 1
fi
if (( DAYS < 1 || DAYS > 90 )); then
  echo "❌ --days måste vara mellan 1 och 90."
  exit 1
fi

READINESS_MODE="$(printf '%s' "$READINESS_MODE" | tr '[:upper:]' '[:lower:]')"
if [[ "$READINESS_MODE" != "compact" && "$READINESS_MODE" != "full" ]]; then
  echo "❌ --readiness-mode måste vara compact eller full."
  exit 1
fi

if [[ -z "$OUT_FILE" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  OUT_FILE="data/reports/Pilot_Baseline_${DAYS}d_${ts}.json"
fi

mkdir -p "$(dirname "$OUT_FILE")"

LOGIN_PAYLOAD="$(node -e 'const [email,password,tenant]=process.argv.slice(1); process.stdout.write(JSON.stringify({email,password,tenantId:tenant}));' "$EMAIL" "$PASSWORD" "$TENANT_ID")"
LOGIN_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw "$LOGIN_PAYLOAD")"
LOGIN_RESPONSE_FINAL="$(complete_login_with_optional_mfa "$LOGIN_RESPONSE" "$TENANT_ID" "$EMAIL" "$MFA_CODE" "$MFA_SECRET")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE_FINAL" | json_get token || true)"

if [[ -z "$TOKEN" ]]; then
  echo "❌ Login misslyckades (kontrollera lösenord + MFA-kod/secret)."
  echo "   Saknas MFA-kod/secret/recovery helt: kör kontrollerad reset med ARCANA_BOOTSTRAP_RESET_OWNER_MFA=true i runtime env, deploya en gång, slutför owner:mfa:setup och sätt sedan tillbaka till false."
  printf '%s\n' "$LOGIN_RESPONSE_FINAL"
  exit 1
fi

REPORT_RESPONSE="$(curl -sS "$BASE_URL/api/v1/reports/pilot?days=$DAYS" \
  -H "Authorization: Bearer $TOKEN")"
READINESS_RESPONSE="$(curl -sS "$BASE_URL/api/v1/monitor/readiness" \
  -H "Authorization: Bearer $TOKEN")"
READINESS_HISTORY_RESPONSE="$(curl -sS "$BASE_URL/api/v1/monitor/readiness/history?limit=14" \
  -H "Authorization: Bearer $TOKEN")"

READINESS_SCORE="$(printf '%s' "$READINESS_RESPONSE" | json_get score || true)"
if [[ -z "$READINESS_SCORE" ]]; then
  echo "❌ Kunde inte hämta readiness-snapshot."
  printf '%s\n' "$READINESS_RESPONSE"
  exit 1
fi
READINESS_HISTORY_COUNT="$(printf '%s' "$READINESS_HISTORY_RESPONSE" | json_get count || true)"
if [[ -z "$READINESS_HISTORY_COUNT" ]]; then
  echo "❌ Kunde inte hämta readiness-historik."
  printf '%s\n' "$READINESS_HISTORY_RESPONSE"
  exit 1
fi

REPORT_TMP="$(mktemp)"
READINESS_TMP="$(mktemp)"
READINESS_HISTORY_TMP="$(mktemp)"
cleanup_tmp() {
  rm -f "$REPORT_TMP" "$READINESS_TMP" "$READINESS_HISTORY_TMP"
}
trap cleanup_tmp EXIT

printf '%s\n' "$REPORT_RESPONSE" > "$REPORT_TMP"
printf '%s\n' "$READINESS_RESPONSE" > "$READINESS_TMP"
printf '%s\n' "$READINESS_HISTORY_RESPONSE" > "$READINESS_HISTORY_TMP"

COMBINED_REPORT="$(node -e "
const fs = require('fs');
const reportPath = process.argv[1];
const readinessPath = process.argv[2];
const readinessHistoryPath = process.argv[3];
const readinessMode = String(process.argv[4] || 'full').trim().toLowerCase();
let report = {};
let readiness = {};
let readinessHistory = {};
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch {
  process.exit(2);
}
try {
  readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
} catch {
  process.exit(3);
}
try {
  readinessHistory = JSON.parse(fs.readFileSync(readinessHistoryPath, 'utf8'));
} catch {
  process.exit(4);
}
const remediation = readiness?.remediation && typeof readiness.remediation === 'object'
  ? readiness.remediation
  : null;
const remediationSummary =
  remediation?.summary && typeof remediation.summary === 'object' ? remediation.summary : null;
const remediationNextActions = Array.isArray(remediation?.nextActions)
  ? remediation.nextActions
  : [];
const readinessHistoryEntries = Array.isArray(readinessHistory?.entries) ? readinessHistory.entries : [];
const readinessHistorySnapshot = {
  generatedAt: readinessHistory?.generatedAt || new Date().toISOString(),
  count: Number(readinessHistory?.count || readinessHistoryEntries.length || 0),
  trend:
    readinessHistory?.trend && typeof readinessHistory.trend === 'object'
      ? readinessHistory.trend
      : null,
  latest: readinessHistoryEntries[0] || null,
};
if (readinessMode !== 'compact') {
  readinessHistorySnapshot.entries = readinessHistoryEntries;
}
const readinessSnapshot = {
  generatedAt: new Date().toISOString(),
  detailMode: readinessMode === 'compact' ? 'compact' : 'full',
  score: Number(readiness?.score || 0),
  band: readiness?.band || null,
  goNoGo: readiness?.goNoGo || null,
  remediationSummary,
  remediationNextActions,
  history: readinessHistorySnapshot,
};
if (readinessMode !== 'compact') {
  readinessSnapshot.noGoTriggers = Array.isArray(readiness?.noGoTriggers) ? readiness.noGoTriggers : [];
  readinessSnapshot.remediation = remediation;
}
report.readinessSnapshot = readinessSnapshot;
process.stdout.write(JSON.stringify(report, null, 2));
" "$REPORT_TMP" "$READINESS_TMP" "$READINESS_HISTORY_TMP" "$READINESS_MODE")"

TENANT_FROM_REPORT="$(printf '%s' "$COMBINED_REPORT" | json_get tenantId || true)"
if [[ -z "$TENANT_FROM_REPORT" ]]; then
  echo "❌ Kunde inte hämta pilotrapport."
  printf '%s\n' "$COMBINED_REPORT"
  exit 1
fi

printf '%s\n' "$COMBINED_REPORT" > "$OUT_FILE"

TEMPLATES_TOTAL="$(printf '%s' "$COMBINED_REPORT" | json_get kpis.templatesTotal || echo 0)"
EVALUATIONS_TOTAL="$(printf '%s' "$COMBINED_REPORT" | json_get kpis.evaluationsTotal || echo 0)"
HIGH_CRITICAL_TOTAL="$(printf '%s' "$COMBINED_REPORT" | json_get kpis.highCriticalTotal || echo 0)"
READINESS_BAND="$(printf '%s' "$COMBINED_REPORT" | json_get readinessSnapshot.band || echo '-')"
READINESS_REMEDIATION_TOTAL="$(printf '%s' "$COMBINED_REPORT" | json_get readinessSnapshot.remediationSummary.total || echo 0)"
READINESS_HISTORY_SCORE_DELTA="$(printf '%s' "$COMBINED_REPORT" | json_get readinessSnapshot.history.trend.scoreDelta || echo 0)"

echo "✅ Pilotrapport sparad: $OUT_FILE"
echo "   tenant=$TENANT_FROM_REPORT templates=$TEMPLATES_TOTAL evaluations=$EVALUATIONS_TOTAL highCritical=$HIGH_CRITICAL_TOTAL"
echo "   readinessScore=$READINESS_SCORE readinessBand=$READINESS_BAND remediationActions=$READINESS_REMEDIATION_TOTAL historyCount=$READINESS_HISTORY_COUNT historyScoreDelta=$READINESS_HISTORY_SCORE_DELTA readinessMode=$READINESS_MODE"
