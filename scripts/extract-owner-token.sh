#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${ARCANA_PUBLIC_BASE_URL:-https://arcana.hairtpclinic.se}}"
BASE_URL="${BASE_URL%/}"
EMAIL="${ARCANA_OWNER_EMAIL:-}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"
MFA_CODE="${ARCANA_OWNER_MFA_CODE:-}"
MFA_SECRET="${ARCANA_OWNER_MFA_SECRET:-}"
MFA_RECOVERY_CODE="${ARCANA_OWNER_MFA_RECOVERY_CODE:-}"
AUTH_STORE_PATH="${AUTH_STORE_PATH:-./data/auth.json}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "extract-owner-token: saknar ARCANA_OWNER_EMAIL / ARCANA_OWNER_PASSWORD" >&2
  exit 1
fi

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

read_mfa_secret_from_store() {
  local email="$1"
  node -e "
const fs = require('fs');
const path = process.argv[1];
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) process.exit(0);
let raw = null;
try { raw = JSON.parse(fs.readFileSync(path, 'utf8')); } catch { process.exit(0); }
const users = raw && raw.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
const user = users.find((item) => String(item?.email || '').trim().toLowerCase() === email) || null;
const secret = String(user?.mfaSecret || '').trim();
if (secret) process.stdout.write(secret);
" "$AUTH_STORE_PATH" "$email"
}

generate_totp_code() {
  local secret="$1"
  local step_offset="${2:-0}"
  node -e "
const crypto = require('crypto');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const secret = String(process.argv[1] || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
const stepOffset = Number(process.argv[2] || 0);
if (!secret) process.exit(1);
let bits = 0; let value = 0; const bytes = [];
for (const ch of secret) {
  const idx = alphabet.indexOf(ch);
  if (idx < 0) continue;
  value = (value << 5) | idx; bits += 5;
  if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
}
const key = Buffer.from(bytes);
if (!key.length) process.exit(1);
const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
const counterBuffer = Buffer.alloc(8);
counterBuffer.writeBigUInt64BE(BigInt(counter));
const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
const offset = hmac[hmac.length - 1] & 0x0f;
const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
process.stdout.write(String(binary % 1000000).padStart(6, '0'));
" "$secret" "$step_offset"
}

verify_mfa_ticket() {
  local mfa_ticket="$1"
  local requested_tenant_id="$2"
  local verify_code="$3"
  local mfa_verify_response=""
  mfa_verify_response="$(curl -sS -X POST "$BASE_URL/api/v1/auth/mfa/verify" \
    -H "Content-Type: application/json" \
    -d "{\"mfaTicket\":\"$mfa_ticket\",\"code\":\"$verify_code\",\"tenantId\":\"$requested_tenant_id\"}")"
  local mfa_token=""
  mfa_token="$(printf '%s' "$mfa_verify_response" | json_get token 2>/dev/null || true)"
  if [[ -n "$mfa_token" ]]; then printf '%s' "$mfa_verify_response"; return 0; fi
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
      local tenant_token=""
      tenant_token="$(printf '%s' "$tenant_select_response" | json_get token 2>/dev/null || true)"
      if [[ -n "$tenant_token" ]]; then printf '%s' "$tenant_select_response"; return 0; fi
    fi
  fi
  printf '%s' "$mfa_verify_response"
  return 1
}

complete_login_with_optional_mfa() {
  local login_response="$1"
  local requested_tenant_id="$2"
  local email="$3"
  local token=""
  token="$(printf '%s' "$login_response" | json_get token 2>/dev/null || true)"
  if [[ -n "$token" ]]; then printf '%s' "$login_response"; return 0; fi
  local requires_mfa=""
  requires_mfa="$(printf '%s' "$login_response" | json_get requiresMfa 2>/dev/null || true)"
  if [[ "$requires_mfa" != "true" ]]; then printf '%s' "$login_response"; return 0; fi
  local mfa_ticket=""
  mfa_ticket="$(printf '%s' "$login_response" | json_get mfaTicket 2>/dev/null || true)"
  if [[ -z "$mfa_ticket" ]]; then printf '%s' "$login_response"; return 0; fi
  local resolved_mfa_secret="$MFA_SECRET"
  if [[ -z "$resolved_mfa_secret" ]]; then
    resolved_mfa_secret="$(printf '%s' "$login_response" | json_get mfa.secret 2>/dev/null || true)"
  fi
  if [[ -z "$resolved_mfa_secret" ]]; then
    resolved_mfa_secret="$(read_mfa_secret_from_store "$email" 2>/dev/null || true)"
  fi
  local verify_candidates=()
  if [[ -n "$MFA_CODE" ]]; then verify_candidates+=("$MFA_CODE"); fi
  if [[ -n "$resolved_mfa_secret" ]]; then
    for step_offset in -1 0 1; do
      local generated_code=""
      generated_code="$(generate_totp_code "$resolved_mfa_secret" "$step_offset" 2>/dev/null || true)"
      if [[ -n "$generated_code" ]]; then verify_candidates+=("$generated_code"); fi
    done
  fi
  if [[ -n "$MFA_RECOVERY_CODE" ]]; then verify_candidates+=("$MFA_RECOVERY_CODE"); fi
  if [[ "${#verify_candidates[@]}" -eq 0 ]]; then printf '%s' "$login_response"; return 0; fi
  local last_mfa_verify_response="$login_response"
  local candidate=""
  for candidate in "${verify_candidates[@]}"; do
    [[ -z "$candidate" ]] && continue
    local attempt_response=""
    if attempt_response="$(verify_mfa_ticket "$mfa_ticket" "$requested_tenant_id" "$candidate")"; then
      printf '%s' "$attempt_response"
      return 0
    fi
    last_mfa_verify_response="$attempt_response"
  done
  printf '%s' "$last_mfa_verify_response"
  return 0
}

LOGIN_RESPONSE_RAW="$(curl -sS -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"
LOGIN_RESPONSE="$(complete_login_with_optional_mfa "$LOGIN_RESPONSE_RAW" "$TENANT_ID" "$EMAIL")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get token 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  echo "extract-owner-token: login misslyckades" >&2
  printf '%s\n' "$LOGIN_RESPONSE" >&2
  exit 1
fi
printf '%s' "$TOKEN"
