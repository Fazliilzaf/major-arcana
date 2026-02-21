#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
EMAIL="${ARCANA_OWNER_EMAIL:-owner@hairtpclinic.se}"
PASSWORD="${ARCANA_OWNER_PASSWORD:-ArcanaPilot!2026}"
TENANT_ID="${ARCANA_DEFAULT_TENANT:-hair-tp-clinic}"

MODE="preview"
LIMIT="8"
OFFSET="0"
CATEGORY=""
NAME_PREFIX=""
SKIP_EXISTING="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      MODE="apply"
      shift
      ;;
    --preview)
      MODE="preview"
      shift
      ;;
    --limit)
      LIMIT="${2:-8}"
      shift 2
      ;;
    --offset)
      OFFSET="${2:-0}"
      shift 2
      ;;
    --category)
      CATEGORY="${2:-}"
      shift 2
      ;;
    --name-prefix)
      NAME_PREFIX="${2:-}"
      shift 2
      ;;
    --allow-duplicates)
      SKIP_EXISTING="false"
      shift
      ;;
    --skip-existing)
      SKIP_EXISTING="true"
      shift
      ;;
    *)
      echo "Okänd flagga: $1"
      echo "Använd: --preview|--apply [--limit 8] [--offset 0] [--category CONSULTATION]"
      echo "       [--name-prefix \"Mail seed HTPC\"] [--skip-existing|--allow-duplicates]"
      exit 1
      ;;
  esac
done

LOGIN_RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT_ID\"}")"

TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | node -e "const fs=require('fs'); const raw=fs.readFileSync(0,'utf8'); let d={}; try{d=JSON.parse(raw);}catch{}; process.stdout.write(String(d.token||''));")"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Login misslyckades."
  printf '%s\n' "$LOGIN_RESPONSE"
  exit 1
fi

PAYLOAD="$(MODE="$MODE" LIMIT="$LIMIT" OFFSET="$OFFSET" CATEGORY="$CATEGORY" NAME_PREFIX="$NAME_PREFIX" SKIP_EXISTING="$SKIP_EXISTING" node -e "const mode=process.env.MODE||'preview'; const limitRaw=Number.parseInt(process.env.LIMIT||'8',10); const offsetRaw=Number.parseInt(process.env.OFFSET||'0',10); const skipRaw=String(process.env.SKIP_EXISTING||'true').trim().toLowerCase(); const payload={dryRun: mode !== 'apply', limit: Number.isFinite(limitRaw)?Math.max(1,Math.min(50,limitRaw)):8, offset: Number.isFinite(offsetRaw)?Math.max(0,offsetRaw):0, skipExisting: !['0','false','no','off'].includes(skipRaw)}; const category=(process.env.CATEGORY||'').trim(); const namePrefix=(process.env.NAME_PREFIX||'').trim(); if(category) payload.category=category; if(namePrefix) payload.namePrefix=namePrefix; process.stdout.write(JSON.stringify(payload));")"

RESPONSE="$(curl -s -X POST "$BASE_URL/api/v1/mail/template-seeds/apply" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")"

ERROR_MESSAGE="$(printf '%s' "$RESPONSE" | node -e "const fs=require('fs'); const raw=fs.readFileSync(0,'utf8'); let d={}; try{d=JSON.parse(raw);}catch{}; process.stdout.write(String(d.error||''));")"
if [[ -n "$ERROR_MESSAGE" ]]; then
  if [[ "$MODE" == "preview" && "$ERROR_MESSAGE" == *"Hittade inga template seeds"* ]]; then
    echo "ℹ️ Inga seeds ännu. Kör mail-ingest först:"
    echo "   npm run ingest:mails -- --input ./mail-exports --brand hair-tp-clinic"
    exit 0
  fi
  echo "❌ Seed-körning misslyckades: $ERROR_MESSAGE"
  printf '%s\n' "$RESPONSE"
  exit 1
fi

if [[ "$MODE" == "apply" ]]; then
  SUMMARY="$(printf '%s' "$RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const rows=Array.isArray(d.templates)?d.templates:[]; const head=rows.slice(0,5).map((r,i)=>(i+1)+'. '+(r.templateName||'-')+' ['+(r.category||'-')+'] L'+(r.riskLevel??'-')+' '+(r.decision||'-')).join('\n'); process.stdout.write('✅ Apply klart: created='+(d.created||0)+' / skipped='+(d.skippedExisting||0)+' / selected='+(d.selected||0)+' / total='+(d.totalAvailable||'-')+' / offset='+(d.offset||0)+' / skipExisting='+(d.skipExisting!==false?'true':'false')+'\\n'+head);")"
  printf '%s\n' "$SUMMARY"
else
  SUMMARY="$(printf '%s' "$RESPONSE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const rows=Array.isArray(d.preview)?d.preview:[]; const head=rows.slice(0,5).map((r,i)=>(i+1)+'. '+(r.templateName||'-')+' ['+(r.category||'-')+'] unknown='+(Array.isArray(r.unknownVariables)?r.unknownVariables.length:0)+' missing='+(Array.isArray(r.missingRequiredVariables)?r.missingRequiredVariables.length:0)+' existing='+(r.skippedExisting===true?'yes':'no')).join('\n'); process.stdout.write('✅ Preview klart: selected='+(d.selected||0)+' / skipped='+(d.skippedExisting||0)+' / total='+(d.totalAvailable||'-')+' / offset='+(d.offset||0)+' / skipExisting='+(d.skipExisting!==false?'true':'false')+'\\n'+head);")"
  printf '%s\n' "$SUMMARY"
fi
