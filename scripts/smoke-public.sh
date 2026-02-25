#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
MFA_CODE="${ARCANA_OWNER_MFA_CODE:-}"
MFA_SECRET="${ARCANA_OWNER_MFA_SECRET:-}"
AUTH_STORE_PATH="${AUTH_STORE_PATH:-./data/auth.json}"
SKIP_AUTH_RAW="${ARCANA_SMOKE_SKIP_AUTH:-false}"

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y|on) return 0 ;;
    *) return 1 ;;
  esac
}

SKIP_AUTH="false"
if is_truthy "$SKIP_AUTH_RAW"; then
  SKIP_AUTH="true"
fi

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
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
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
if [[ -z "$MFA_CODE" ]]; then
  MFA_CODE="$(dotenv_get ARCANA_OWNER_MFA_CODE || true)"
fi
if [[ -z "$MFA_SECRET" ]]; then
  MFA_SECRET="$(dotenv_get ARCANA_OWNER_MFA_SECRET || true)"
fi
if [[ "${AUTH_STORE_PATH}" == "./data/auth.json" ]]; then
  DOTENV_AUTH_STORE_PATH="$(dotenv_get AUTH_STORE_PATH || true)"
  if [[ -n "$DOTENV_AUTH_STORE_PATH" ]]; then
    AUTH_STORE_PATH="$DOTENV_AUTH_STORE_PATH"
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
if (!key.length) process.exit(1);
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

  local resolved_mfa_code="$MFA_CODE"
  if [[ -z "$resolved_mfa_code" ]]; then
    local resolved_mfa_secret="$MFA_SECRET"
    if [[ -z "$resolved_mfa_secret" ]]; then
      resolved_mfa_secret="$(printf '%s' "$login_response" | json_get mfa.secret 2>/dev/null || true)"
    fi
    if [[ -z "$resolved_mfa_secret" ]]; then
      resolved_mfa_secret="$(read_mfa_secret_from_store "$email" 2>/dev/null || true)"
    fi
    if [[ -n "$resolved_mfa_secret" ]]; then
      resolved_mfa_code="$(generate_totp_code "$resolved_mfa_secret" 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$resolved_mfa_code" ]]; then
    printf '%s' "$login_response"
    return 0
  fi

  local mfa_verify_response=""
  mfa_verify_response="$(curl -sS -X POST "$BASE_URL/api/v1/auth/mfa/verify" \
    -H "Content-Type: application/json" \
    -d "{\"mfaTicket\":\"$mfa_ticket\",\"code\":\"$resolved_mfa_code\",\"tenantId\":\"$requested_tenant_id\"}")"

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

if [[ "$SKIP_AUTH" == "true" ]]; then
  echo "ℹ️ Hoppar auth-smoke (ARCANA_SMOKE_SKIP_AUTH=true)"
  echo
  echo "🎯 Public smoke klart."
  exit 0
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ℹ️ Hoppar auth-smoke (saknar ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD)"
  exit 0
fi

LOGIN_RESPONSE_RAW="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"
LOGIN_RESPONSE="$(complete_login_with_optional_mfa "$LOGIN_RESPONSE_RAW" "$TENANT_ID" "$EMAIL")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token || true)"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Login misslyckades i public smoke"
  printf '%s\n' "$LOGIN_RESPONSE"
  echo
  echo "Åtgärd:"
  echo "- Verifiera att ARCANA_OWNER_EMAIL/ARCANA_OWNER_PASSWORD i Render är korrekt satta."
  echo "- Om MFA är aktivt: sätt ARCANA_OWNER_MFA_CODE eller ARCANA_OWNER_MFA_SECRET."
  echo "- För setup av OWNER MFA med samma credentials:"
  echo "  BASE_URL=$BASE_URL ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup"
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
