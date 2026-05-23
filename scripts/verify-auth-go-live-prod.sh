#!/usr/bin/env bash
# Fas 2: verifiera auth-läge prod + skriv ut go-live-steg (flippar INTE env automatiskt).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
CLI_YAML="${HOME}/.render/cli.yaml"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"
API_KEY="${RENDER_API_KEY:-}"

if [[ -z "$API_KEY" && -f "$CLI_YAML" ]]; then
  API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
fi

echo "== Auth go-live verify =="
echo "BASE: $BASE"

ENV_JSON="$(curl -fsS "${BASE}/api/v1/_diag/env" 2>/dev/null || echo '{}')"
OPEN="$(printf '%s' "$ENV_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.resolved?.staffJournalOpenAccess ?? j.env?.ARCANA_STAFF_JOURNAL_OPEN_ACCESS ?? '?')}catch{console.log('?')}});")"
MFA_PROBE="$(node -r dotenv/config -e "(async()=>{try{const r=await fetch(process.argv[1]+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ARCANA_OWNER_EMAIL||'',password:process.env.ARCANA_OWNER_PASSWORD||'',tenantId:'hair-tp-clinic'})});const j=await r.json();if(j.requiresMfa)console.log('required');else if(j.token)console.log('off');else console.log('?')}catch{console.log('?')}})()" "$BASE" 2>/dev/null || echo "?")"
MFA="$(printf '%s' "$ENV_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).env?.ARCANA_AUTH_OWNER_MFA_REQUIRED ?? '?')}catch{console.log('?')}});")"
if [[ "$MFA" == "?" && "$MFA_PROBE" == "required" ]]; then MFA="true (probe)"; fi

echo "ARCANA_STAFF_JOURNAL_OPEN_ACCESS=$OPEN"
echo "ARCANA_AUTH_OWNER_MFA_REQUIRED=$MFA (login probe: $MFA_PROBE)"

if [[ "$OPEN" == "true" ]]; then
  echo "ℹ Pilotläge aktivt — förväntat före go-live"
else
  echo "✅ Open access av"
fi

if [[ "$MFA_PROBE" == "required" || "$MFA" == "true" || "$MFA" == "true (probe)" ]]; then
  echo "✅ OWNER MFA required (prod)"
else
  echo "ℹ OWNER MFA av (byggfas)"
fi

if [[ -n "$API_KEY" ]]; then
  OWNER_TOKEN="$(node "$ROOT_DIR/scripts/get-prod-auth-token.js" --owner 2>/dev/null || true)"
  if [[ -n "$OWNER_TOKEN" ]]; then
    STAFF_COUNT="$(curl -fsS -H "Authorization: Bearer ${OWNER_TOKEN}" \
      "${BASE}/api/v1/users/staff" 2>/dev/null | \
      node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log((j.members||j.staff||[]).filter(m=>String(m.membership?.role||m.role||'').toUpperCase()==='STAFF').length)}catch{console.log('?')}});" 2>/dev/null || echo "?")"
    echo "STAFF-konton (prod): ${STAFF_COUNT}"
  else
    echo "STAFF-konton (prod): ? (owner-token saknas)"
  fi
fi

cat <<'EOF'

Go-live (manuellt underhållsfönster):
  1. Skapa STAFF + verifiera OWNER MFA (npm run owner:mfa:setup)
  2. Render env: ARCANA_STAFF_JOURNAL_OPEN_ACCESS=false
  3. Render env: ARCANA_AUTH_OWNER_MFA_REQUIRED=true
  4. Uppdatera render.yaml + push (blueprint sync)
  5. Testa /staff login på mobil
  6. npm run verify:mobile-pilot-prod (med credentials)

EOF
