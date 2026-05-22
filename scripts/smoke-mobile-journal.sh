#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-https://arcana.hairtpclinic.se}"
BASE_URL="${BASE_URL%/}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
PATIENT_ID="${ARCANA_SMOKE_PATIENT_ID:-}"
BEARER_TOKEN="${ARCANA_SMOKE_BEARER_TOKEN:-}"

fail() {
  echo "❌ $1"
  exit 1
}

pass() {
  echo "✅ $1"
}

warn() {
  echo "⚠️  $1"
}

json_get() {
  local path="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(input); } catch { process.exit(2); }
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

echo "== Mobile Journal Smoke =="
echo "BASE_URL: $BASE_URL"
echo

IS_LOCAL_PREVIEW=0
if [[ "$BASE_URL" == *"127.0.0.1"* || "$BASE_URL" == *"localhost"* ]]; then
  IS_LOCAL_PREVIEW=1
  echo "Läge: lokal preview (auth-krav slappas på localhost)"
  echo
fi

READY="$(curl -sS "$BASE_URL/readyz")"
[[ "$(printf '%s' "$READY" | json_get ready 2>/dev/null || true)" == "true" ]] || fail "readyz ej ready"
pass "readyz OK"

MANIFEST="$(curl -sS "$BASE_URL/major-arcana-preview/manifest.json")"
[[ "$MANIFEST" == *"view=customers"* ]] || fail "manifest saknar start_url ?view=customers"
pass "PWA manifest OK"

SW_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/major-arcana-preview/service-worker.js")"
[[ "$SW_CODE" == "200" ]] || fail "service-worker.js HTTP $SW_CODE"
pass "service-worker.js OK"

PREVIEW_HTML="$(curl -sS "$BASE_URL/major-arcana-preview/?view=customers")"
[[ "$PREVIEW_HTML" == *"app.bundle."* ]] || fail "preview saknar bundle"
BUNDLE_PATH="$(printf '%s' "$PREVIEW_HTML" | grep -oE 'app\.bundle\.[a-f0-9]+\.min\.js' | head -1 || true)"
[[ -n "$BUNDLE_PATH" ]] || fail "kunde inte hitta bundle-hash i preview"
pass "preview bundle: $BUNDLE_PATH"

BUNDLE="$(curl -sS "$BASE_URL/major-arcana-preview/$BUNDLE_PATH")"
[[ "$BUNDLE" == *"data-patient-photo-camera"* ]] || fail "bundle saknar kamera-input"
[[ "$BUNDLE" == *"Ta bild"* ]] || fail "bundle saknar Ta bild-knapp"
pass "bundle innehåller mobil journal-UI"

PHOTO_UNAUTH="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/v1/cco-journal/photo")"
if [[ "$IS_LOCAL_PREVIEW" == "1" ]]; then
  warn "lokal preview: photo utan auth → $PHOTO_UNAUTH (förväntat 400 utan fil)"
else
  [[ "$PHOTO_UNAUTH" == "401" || "$PHOTO_UNAUTH" == "403" ]] || fail "photo upload utan auth borde ge 401/403, fick $PHOTO_UNAUTH"
  pass "photo upload kräver auth ($PHOTO_UNAUTH)"
fi

PATIENTS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/cco-patient-master/patients?limit=1")"
if [[ "$IS_LOCAL_PREVIEW" == "1" ]]; then
  warn "lokal preview: patient-master utan auth → $PATIENTS_CODE"
else
  [[ "$PATIENTS_CODE" == "401" || "$PATIENTS_CODE" == "403" ]] || fail "patient-master utan auth borde ge 401/403, fick $PATIENTS_CODE"
  pass "patient-master kräver auth ($PATIENTS_CODE)"
fi

if [[ "$IS_LOCAL_PREVIEW" == "1" && -z "$BEARER_TOKEN" ]]; then
  BEARER_TOKEN="__preview_local__"
fi

if [[ -n "$BEARER_TOKEN" ]]; then
  TOKEN="$BEARER_TOKEN"
  pass "använder ARCANA_SMOKE_BEARER_TOKEN"
elif [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  warn "Hoppar autentiserade API-tester (sätt ARCANA_OWNER_EMAIL + ARCANA_OWNER_PASSWORD eller ARCANA_SMOKE_BEARER_TOKEN)"
  echo
  echo "✅ Mobile journal smoke (publik) klar."
  exit 0
else
  LOGIN_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"
  TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token 2>/dev/null || true)"
  [[ -n "$TOKEN" ]] || fail "inloggning misslyckades (saknar token)"
  pass "inloggning OK"
fi

PATIENTS="$(curl -sS "$BASE_URL/api/v1/cco-patient-master/patients?limit=3" \
  -H "Authorization: Bearer $TOKEN")"
FIRST_PATIENT="$(printf '%s' "$PATIENTS" | node -e "
const data = JSON.parse(require('fs').readFileSync(0,'utf8'));
const row = Array.isArray(data.patients) ? data.patients[0] : null;
if (!row?.patientId) process.exit(1);
process.stdout.write(row.patientId);
" 2>/dev/null || true)"
TARGET_PATIENT="${PATIENT_ID:-$FIRST_PATIENT}"
if [[ -z "$TARGET_PATIENT" ]]; then
  SMOKE_ENSURE_ID="a1111111-1111-4111-8111-111111111111"
  UPSERT_RESPONSE="$(curl -sS -X PUT "$BASE_URL/api/v1/cco-patient-master/patient" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"$SMOKE_ENSURE_ID\",\"displayName\":\"Arcana Smoke Journal\",\"primaryEmail\":\"smoke-journal@arcana.invalid\"}")"
  TARGET_PATIENT="$(printf '%s' "$UPSERT_RESPONSE" | json_get patient.id 2>/dev/null || true)"
  [[ -n "$TARGET_PATIENT" ]] || fail "kunde inte skapa smoke-testpatient"
  pass "smoke-testpatient upsertad: $TARGET_PATIENT"
else
  pass "testpatient: $TARGET_PATIENT"
fi

PATIENT_DETAIL="$(curl -sS "$BASE_URL/api/v1/cco-patient-master/patient?patientId=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$TARGET_PATIENT")" \
  -H "Authorization: Bearer $TOKEN")"
DETAIL_PATIENT_ID="$(printf '%s' "$PATIENT_DETAIL" | json_get card.patientId 2>/dev/null || true)"
if [[ -z "$DETAIL_PATIENT_ID" ]]; then
  DETAIL_PATIENT_ID="$(printf '%s' "$PATIENT_DETAIL" | json_get patient.id 2>/dev/null || true)"
fi
[[ "$DETAIL_PATIENT_ID" == "$TARGET_PATIENT" ]] || fail "kunde inte läsa kundkort"
pass "patient detail OK"

TMP_PNG="$(mktemp /tmp/arcana-smoke-XXXXXX.png)"
node -e "
const fs = require('fs');
const zlib = require('zlib');
const path = process.argv[1];
const width = 8;
const height = 8;
const raw = Buffer.concat(
  Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]))
);
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', Buffer.from([0, 0, 0, 8, 0, 0, 0, 8, 8, 2, 0, 0, 0])),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(path, png);
" "$TMP_PNG"

UPLOAD_RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/api/v1/cco-journal/photo" \
  -H "Authorization: Bearer $TOKEN" \
  -F "patientId=$TARGET_PATIENT" \
  -F "label=Smoke Front" \
  -F "photo=@$TMP_PNG;type=image/png;filename=smoke-front.png")"
rm -f "$TMP_PNG"
UPLOAD_BODY="${UPLOAD_RESPONSE%$'\n'*}"
UPLOAD_CODE="${UPLOAD_RESPONSE##*$'\n'}"
[[ "$UPLOAD_CODE" == "200" ]] || fail "photo upload misslyckades ($UPLOAD_CODE): $UPLOAD_BODY"
pass "photo upload OK (200)"

echo
echo "✅ Mobile journal smoke klar (publik + autentiserad upload)."
