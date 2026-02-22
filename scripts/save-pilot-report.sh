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
    *)
      echo "Okänd flagga: $1"
      echo "Använd: [--base-url URL] [--email EMAIL] [--password PASSWORD] [--tenant TENANT] [--days 14] [--out FIL]"
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

if [[ -z "$OUT_FILE" ]]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  OUT_FILE="data/reports/Pilot_Baseline_${DAYS}d_${ts}.json"
fi

mkdir -p "$(dirname "$OUT_FILE")"

LOGIN_PAYLOAD="$(node -e 'const [email,password,tenant]=process.argv.slice(1); process.stdout.write(JSON.stringify({email,password,tenantId:tenant}));' "$EMAIL" "$PASSWORD" "$TENANT_ID")"
LOGIN_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  --data-raw "$LOGIN_PAYLOAD")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token || true)"

if [[ -z "$TOKEN" ]]; then
  echo "❌ Login misslyckades."
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi

REPORT_RESPONSE="$(curl -sS "$BASE_URL/api/v1/reports/pilot?days=$DAYS" \
  -H "Authorization: Bearer $TOKEN")"

TENANT_FROM_REPORT="$(printf '%s' "$REPORT_RESPONSE" | json_get tenantId || true)"
if [[ -z "$TENANT_FROM_REPORT" ]]; then
  echo "❌ Kunde inte hämta pilotrapport."
  printf '%s\n' "$REPORT_RESPONSE"
  exit 1
fi

printf '%s\n' "$REPORT_RESPONSE" > "$OUT_FILE"

TEMPLATES_TOTAL="$(printf '%s' "$REPORT_RESPONSE" | json_get kpis.templatesTotal || echo 0)"
EVALUATIONS_TOTAL="$(printf '%s' "$REPORT_RESPONSE" | json_get kpis.evaluationsTotal || echo 0)"
HIGH_CRITICAL_TOTAL="$(printf '%s' "$REPORT_RESPONSE" | json_get kpis.highCriticalTotal || echo 0)"

echo "✅ Pilotrapport sparad: $OUT_FILE"
echo "   tenant=$TENANT_FROM_REPORT templates=$TEMPLATES_TOTAL evaluations=$EVALUATIONS_TOTAL highCritical=$HIGH_CRITICAL_TOTAL"
