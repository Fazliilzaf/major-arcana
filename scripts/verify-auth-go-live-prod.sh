#!/usr/bin/env bash
# Fas 2: verifiera auth-läge prod + skriv ut go-live-steg (flippar INTE env automatiskt).
set -euo pipefail

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
OPEN="$(printf '%s' "$ENV_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.env?.ARCANA_STAFF_JOURNAL_OPEN_ACCESS ?? j.resolved?.staffJournalOpenAccess ?? '?')}catch{console.log('?')}});")"
MFA="$(printf '%s' "$ENV_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).env?.ARCANA_AUTH_OWNER_MFA_REQUIRED ?? '?')}catch{console.log('?')}});")"

echo "ARCANA_STAFF_JOURNAL_OPEN_ACCESS=$OPEN"
echo "ARCANA_AUTH_OWNER_MFA_REQUIRED=$MFA"

if [[ "$OPEN" == "true" ]]; then
  echo "ℹ Pilotläge aktivt — förväntat före go-live"
else
  echo "✅ Open access av"
fi

if [[ "$MFA" == "true" ]]; then
  echo "✅ OWNER MFA required"
else
  echo "ℹ OWNER MFA av (byggfas)"
fi

if [[ -n "$API_KEY" ]]; then
  STAFF_COUNT="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
    "${BASE}/api/v1/users/staff" 2>/dev/null | \
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log((JSON.parse(d).staff||[]).length)}catch{console.log(0)}});" 2>/dev/null || echo 0)"
  echo "STAFF-konton (via prod API): ${STAFF_COUNT:-?} (kräver OWNER-token om 0/401)"
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
