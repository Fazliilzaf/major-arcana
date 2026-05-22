#!/usr/bin/env bash
# Push pilotkunder till prod via öppen journal-API (ingen owner-login krävs när
# ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true, default i byggfas).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-https://arcana.hairtpclinic.se}"
BASE_URL="${BASE_URL%/}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"
USE_AUTH="${ARCANA_PUSH_REQUIRE_AUTH:-false}"

fail() { echo "❌ $1"; exit 1; }
pass() { echo "✅ $1"; }

[[ -f "$PILOT_JSON" ]] || fail "Saknar $PILOT_JSON — kör select-pilot-patients.js först."

PILOT_IDS="$(node -e "const p=require('$PILOT_JSON'); process.stdout.write((p.patientIds||[]).join(','));")"
[[ -n "$PILOT_IDS" ]] || fail "pilot-patients.json saknar patientIds"

AUTH_HEADER=""
JSON_HEADER='Content-Type: application/json'
CLIENT_HEADER='x-arcana-client: major_arcana_admin'

if [[ "$USE_AUTH" == "true" ]]; then
  EMAIL="${ARCANA_OWNER_EMAIL:-}"
  PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
  [[ -n "$EMAIL" && -n "$PASSWORD" ]] || fail "Sätt ARCANA_OWNER_EMAIL och ARCANA_OWNER_PASSWORD (eller ARCANA_PUSH_REQUIRE_AUTH=false)."
  LOGIN_PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD, tenantId: process.env.TENANT_ID }));" EMAIL="$EMAIL" PASSWORD="$PASSWORD" TENANT_ID="$TENANT_ID")"
  TOKEN="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
    -H "$JSON_HEADER" -H "$CLIENT_HEADER" \
    -d "$LOGIN_PAYLOAD" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j=JSON.parse(d||'{}');
  if(!j.token) process.exit(1);
  process.stdout.write(j.token);
});")" || fail "Inloggning misslyckades"
  AUTH_HEADER="Authorization: Bearer $TOKEN"
  pass "Inloggad som owner"
else
  echo "Öppen journal-API (ingen auth-header)"
fi

curl_auth() {
  if [[ -n "$AUTH_HEADER" ]]; then
    curl -sS "$@" -H "$AUTH_HEADER"
  else
    curl -sS "$@"
  fi
}

echo "== Push pilotkunder till prod =="
echo "BASE_URL: $BASE_URL"
echo "PILOT_IDS: $PILOT_IDS"
echo

while IFS= read -r patient; do
  PID="$(printf '%s' "$patient" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).patientId));")"
  FULL="$(node -e "
const fs=require('fs');
const local=JSON.parse(fs.readFileSync('./data/cco-patient-master.json','utf8'));
const row=(local.tenants?.['$TENANT_ID']?.patients||[]).find(p=>p.id==='$PID');
if(!row) process.exit(1);
process.stdout.write(JSON.stringify({ ...row, patientId: row.id }));
")"

  curl_auth -X PUT "$BASE_URL/api/v1/cco-patient-master/patient" \
    -H "$JSON_HEADER" -H "$CLIENT_HEADER" \
    -d "$FULL" >/dev/null

  IMPORT_RESULT="$(curl_auth -X POST "$BASE_URL/api/v1/cco-journal/import-historical" \
    -H "$JSON_HEADER" -H "$CLIENT_HEADER" \
    -d "{\"patientId\":\"$PID\"}")"

  CREATED="$(printf '%s' "$IMPORT_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d||'{}');process.stdout.write(String(j.created||0));});")"
  pass "Upsert + historik: $PID (skapade $CREATED poster)"
done < <(node -e "
const pilot=require('$PILOT_JSON');
for (const row of pilot.patients||[]) console.log(JSON.stringify(row));
")

STATS="$(curl_auth "$BASE_URL/api/v1/cco-patient-master/stats" -H "$CLIENT_HEADER")"
TOTAL="$(printf '%s' "$STATS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).stats?.totalPatients||0)));")"
pass "Prod patient-master: $TOTAL kunder totalt"

if [[ "${ARCANA_PUSH_SKIP_RENDER_ENV:-false}" != "true" ]] && command -v render >/dev/null 2>&1; then
  CLI_YAML="${HOME}/.render/cli.yaml"
  if [[ -f "$CLI_YAML" ]]; then
    API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
    EXISTING_JSON="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
      "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" || echo '[]')"
    MERGED_JSON="$(node -e "
const existing=JSON.parse(process.argv[1]||'[]');
const map=new Map(existing.map(row=>{const ev=row.envVar||row; return [ev.key, ev.value??''];}));
map.set('ARCANA_PILOT_PATIENT_IDS', process.argv[2]);
if (!map.get('ARCANA_AI_PROVIDER')) map.set('ARCANA_AI_PROVIDER','fallback');
process.stdout.write(JSON.stringify([...map.entries()].map(([key,value])=>({key,value}))));
" "$EXISTING_JSON" "$PILOT_IDS")"
    curl -fsS -X PUT \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" \
      -d "$MERGED_JSON" >/dev/null
    pass "Render: ARCANA_PILOT_PATIENT_IDS satt (merge, ingen omstart — data redan pushad)"
  fi
fi

if [[ -f "$ROOT_DIR/scripts/push-pilot-journals-prod.sh" ]]; then
  bash "$ROOT_DIR/scripts/push-pilot-journals-prod.sh"
fi

echo
echo "Klart. Testa: $BASE_URL/staff → Kunder (pilotlista)"
