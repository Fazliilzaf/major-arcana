#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${CMO_SMOKE_PORT:-3110}"
SERVER_PID=""
STAGING_URL="${ARCANA_STAGING_URL:-https://arcana-staging.onrender.com}"

SMOKE_OWNER_EMAIL="${ARCANA_OWNER_EMAIL:-fazli@hairtpclinic.com}"
SMOKE_OWNER_PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
SMOKE_TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

json_get() {
  local path="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(input); } catch { process.exit(1); }
const parts = process.argv[1].split('.');
let ref = data;
for (const key of parts) {
  if (!key) continue;
  ref = ref?.[key];
}
if (ref === undefined || ref === null) process.exit(2);
if (typeof ref === 'object') process.stdout.write(JSON.stringify(ref));
else process.stdout.write(String(ref));
" "$path"
}

fetch_bearer_token() {
  local base_url="$1"
  local login_response
  login_response="$(curl -sS -X POST "${base_url}/api/v1/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"${SMOKE_OWNER_EMAIL}\",\"password\":\"${SMOKE_OWNER_PASSWORD}\"}")"

  local token
  token="$(printf '%s' "$login_response" | json_get token 2>/dev/null || true)"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return 0
  fi

  local requires_mfa mfa_ticket mfa_code mfa_verify
  requires_mfa="$(printf '%s' "$login_response" | json_get requiresMfa 2>/dev/null || true)"
  if [[ "$requires_mfa" != "true" ]]; then
    echo "login failed: $login_response" >&2
    return 1
  fi

  mfa_ticket="$(printf '%s' "$login_response" | json_get mfaTicket 2>/dev/null || true)"
  local mfa_secret
  mfa_secret="$(printf '%s' "$login_response" | json_get mfa.secret 2>/dev/null || true)"
  if [[ -z "$mfa_secret" && -f ./data/auth.json ]]; then
    mfa_secret="$(node -e "
const fs=require('fs');
const email=process.argv[1].toLowerCase();
const raw=JSON.parse(fs.readFileSync('./data/auth.json','utf8'));
const users=Object.values(raw.users||{});
const user=users.find(u=>String(u.email||'').toLowerCase()===email);
process.stdout.write(String(user?.mfaSecret||''));
" "$SMOKE_OWNER_EMAIL")"
  fi
  if [[ -z "$mfa_secret" ]]; then
    echo "MFA required but no secret available" >&2
    return 1
  fi
  mfa_code="$(node -e "
const crypto=require('crypto');
const secret=String(process.argv[1]).toUpperCase().replace(/[^A-Z2-7]/g,'');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits=0,value=0,output='';
for (const ch of secret){const idx=alphabet.indexOf(ch);if(idx<0)continue;value=(value<<5)|idx;bits+=5;if(bits>=8){output+=String.fromCharCode((value>>(bits-8))&255);bits-=8;}}
const step=30;const counter=Math.floor(Date.now()/1000/step);
const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
const hmac=crypto.createHmac('sha1',Buffer.from(output)).update(buf).digest();
const offset=hmac[hmac.length-1]&15;
const code=((hmac[offset]&127)<<24|(hmac[offset+1]&255)<<16|(hmac[offset+2]&255)<<8|(hmac[offset+3]&255))%1000000;
process.stdout.write(String(code).padStart(6,'0'));
" "$mfa_secret")"
  mfa_verify="$(curl -sS -X POST "${base_url}/api/v1/auth/mfa/verify" \
    -H 'content-type: application/json' \
    -d "{\"mfaTicket\":\"${mfa_ticket}\",\"code\":\"${mfa_code}\"}")"
  token="$(printf '%s' "$mfa_verify" | json_get token 2>/dev/null || true)"
  if [[ -n "$token" ]]; then
    printf '%s' "$token"
    return 0
  fi
  local login_ticket
  login_ticket="$(printf '%s' "$mfa_verify" | json_get loginTicket 2>/dev/null || true)"
  if [[ -n "$login_ticket" ]]; then
    local tenant_select
    tenant_select="$(curl -sS -X POST "${base_url}/api/v1/auth/select-tenant" \
      -H 'content-type: application/json' \
      -d "{\"loginTicket\":\"${login_ticket}\",\"tenantId\":\"${SMOKE_TENANT_ID}\"}")"
    token="$(printf '%s' "$tenant_select" | json_get token 2>/dev/null || true)"
    if [[ -n "$token" ]]; then
      printf '%s' "$token"
      return 0
    fi
  fi
  echo "MFA login failed: $mfa_verify" >&2
  return 1
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "▶️ Fas O — local HTTP connector smoke (port ${PORT})"
EXISTING_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "${EXISTING_PID}" ]]; then
  kill "${EXISTING_PID}" >/dev/null 2>&1 || true
  sleep 1
fi

PORT="$PORT" \
ARCANA_AI_PROVIDER=fallback \
ARCANA_GRAPH_READ_ENABLED=false \
ARCANA_GRAPH_SEND_ENABLED=false \
ARCANA_MARKETING_CONNECTORS_ENABLED=true \
ARCANA_MARKETING_CONNECTORS_MODE=fixture \
ARCANA_MARKETING_GOOGLE_ADS_ENABLED=true \
ARCANA_MARKETING_META_ENABLED=true \
ARCANA_MARKETING_LINKEDIN_ENABLED=true \
ARCANA_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
ARCANA_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
ARCANA_DEFAULT_TENANT="$SMOKE_TENANT_ID" \
node server.js >/tmp/arcana-cmo-smoke.log 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 90); do
  if curl -sf "http://localhost:${PORT}/readyz" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "❌ Server exited during startup"
    cat /tmp/arcana-cmo-smoke.log || true
    exit 1
  fi
  sleep 1
done

if ! curl -sf "http://localhost:${PORT}/readyz" >/dev/null 2>&1; then
  echo "❌ Server not ready on ${PORT}"
  cat /tmp/arcana-cmo-smoke.log || true
  exit 1
fi

LOCAL_BASE="http://localhost:${PORT}"
TOKEN="$(fetch_bearer_token "$LOCAL_BASE")"
echo "✅ Local auth token acquired"

ARCANA_SMOKE_BASE_URL="$LOCAL_BASE" \
ARCANA_SMOKE_TOKEN="$TOKEN" \
npm run smoke:cmo-connectors

echo ""
echo "▶️ Fas O — remote staging probe (${STAGING_URL})"
if curl -sf "${STAGING_URL}/healthz" >/dev/null 2>&1; then
  echo "✅ staging healthz OK"
  if REMOTE_TOKEN="$(fetch_bearer_token "${STAGING_URL%/}" 2>/dev/null || true)" && [[ -n "$REMOTE_TOKEN" ]]; then
    echo "✅ staging auth OK — running HTTP connector smoke"
    ARCANA_SMOKE_BASE_URL="${STAGING_URL%/}" \
    ARCANA_SMOKE_TOKEN="$REMOTE_TOKEN" \
    npm run smoke:cmo-connectors
  else
    echo "⚠️ staging auth skipped (MFA/credentials) — set secrets in Render + rerun"
  fi
else
  echo "⚠️ staging not reachable at ${STAGING_URL}/healthz"
fi

echo "✅ Fas O HTTP smoke complete"
