#!/usr/bin/env bash
# Push Resend env till Render prod (merge PUT). Kräver RESEND_API_KEY i .env.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

[[ -f .env ]] || { echo "❌ Saknar .env"; exit 1; }
RESEND_API_KEY="$(node -e "require('dotenv').config({quiet:true}); process.stdout.write((process.env.RESEND_API_KEY||'').trim())")"
[[ -n "$RESEND_API_KEY" ]] || { echo "❌ Saknar RESEND_API_KEY i .env"; exit 1; }

export SKIP_RESEND=false
node ./scripts/apply-graph-resend-go-live-prod.js

echo "Väntar på prod readyz..."
BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
for attempt in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${BASE}/readyz" 2>/dev/null || echo 000)"
  [[ "$code" == "200" ]] && break
  sleep 10
done

# Smoke: skicka test till Resend API (ingen mail till patient)
node -r dotenv/config -e "
const key = process.env.RESEND_API_KEY;
fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: process.env.RESEND_FROM || 'contact@hairtpclinic.com',
    to: process.env.OPERATOR_NOTIFY_TO || 'contact@hairtpclinic.com',
    subject: '[Arcana] Resend go-live smoke',
    html: '<p>Resend live på Render — smoke OK.</p>',
  }),
}).then(r => r.json().then(j => { console.log(r.status, j.id ? 'OK id='+j.id : JSON.stringify(j)); process.exit(r.ok?0:1); }));
" && echo "✅ Resend API smoke OK"
