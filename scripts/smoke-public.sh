#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

if [[ -z "$BASE_URL" ]]; then
  echo "❌ Sätt BASE_URL först, t.ex.:"
  echo "   BASE_URL=https://arcana.hairtpclinic.se npm run smoke:public"
  exit 1
fi

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

if [[ -z "$EMAIL" ]]; then
  EMAIL="$(dotenv_get ARCANA_OWNER_EMAIL)"
fi
if [[ -z "$PASSWORD" ]]; then
  PASSWORD="$(dotenv_get ARCANA_OWNER_PASSWORD)"
fi
if [[ -z "${ARCANA_DEFAULT_TENANT:-}" ]]; then
  DOTENV_TENANT="$(dotenv_get ARCANA_DEFAULT_TENANT)"
  if [[ -n "$DOTENV_TENANT" ]]; then
    TENANT_ID="$DOTENV_TENANT"
  fi
fi

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

echo "== Arcana Public Smoke =="
echo "BASE_URL:  $BASE_URL"
echo

HEALTH_RESPONSE="$(curl -sS "$BASE_URL/healthz")"
HEALTH_OK="$(printf '%s' "$HEALTH_RESPONSE" | json_get ok || true)"
if [[ "$HEALTH_OK" != "true" ]]; then
  echo "❌ healthz ej ok"
  printf '%s\n' "$HEALTH_RESPONSE"
  exit 1
fi
echo "✅ healthz OK"

READY_RESPONSE="$(curl -sS "$BASE_URL/readyz")"
READY_OK="$(printf '%s' "$READY_RESPONSE" | json_get ready || true)"
if [[ "$READY_OK" != "true" ]]; then
  echo "❌ readyz ej ready"
  printf '%s\n' "$READY_RESPONSE"
  exit 1
fi
echo "✅ readyz OK"

EMBED_RESPONSE="$(curl -sS "$BASE_URL/embed.js")"
if [[ "$EMBED_RESPONSE" == *"__ARCANA_EMBED__"* ]]; then
  echo "✅ embed.js OK"
else
  echo "❌ embed.js verkar inte vara Arcana-script"
  exit 1
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ℹ️ Hoppar auth-smoke (saknar ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD)"
  exit 0
fi

LOGIN_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token || true)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Login misslyckades i public smoke"
  printf '%s\n' "$LOGIN_RESPONSE"
  echo
  echo "Åtgärd:"
  echo "- Verifiera att ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD i Render är korrekt satta."
  echo "- Om användaren skapades med andra credentials i produktion: använd de credentials här."
  echo "- Kör sedan igen:"
  echo "  BASE_URL=$BASE_URL ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run smoke:public"
  exit 1
fi
echo "✅ auth/login OK"

ME_RESPONSE="$(curl -sS "$BASE_URL/api/v1/auth/me" \
  -H "Authorization: Bearer $TOKEN")"
ME_TENANT="$(printf '%s' "$ME_RESPONSE" | json_get membership.tenantId || true)"
ME_ROLE="$(printf '%s' "$ME_RESPONSE" | json_get membership.role || true)"
if [[ -z "$ME_TENANT" || -z "$ME_ROLE" ]]; then
  echo "❌ auth/me saknar membership-data"
  printf '%s\n' "$ME_RESPONSE"
  exit 1
fi
echo "✅ auth/me OK (tenant: ${ME_TENANT}, role: ${ME_ROLE})"

MONITOR_RESPONSE="$(curl -sS "$BASE_URL/api/v1/monitor/status" \
  -H "Authorization: Bearer $TOKEN")"
MONITOR_TEMPLATES="$(printf '%s' "$MONITOR_RESPONSE" | json_get kpis.templatesTotal || true)"
if [[ -z "$MONITOR_TEMPLATES" ]]; then
  echo "❌ monitor/status saknar KPI"
  printf '%s\n' "$MONITOR_RESPONSE"
  exit 1
fi
echo "✅ monitor/status OK (templates: ${MONITOR_TEMPLATES})"

MAIL_INSIGHTS_RESPONSE="$(curl -sS "$BASE_URL/api/v1/mail/insights" \
  -H "Authorization: Bearer $TOKEN")"
MAIL_READY="$(printf '%s' "$MAIL_INSIGHTS_RESPONSE" | json_get ready || true)"
echo "✅ mail/insights reachable (ready: ${MAIL_READY:-false})"

echo
echo "🎯 Public smoke klart."
