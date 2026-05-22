#!/usr/bin/env bash
# Återställ icke-hemliga Render env-vars från render.yaml + behåll befintliga.
# Render PUT /env-vars ERSÄTTER hela listan — detta skript mergar säkert.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"
CLI_YAML="${HOME}/.render/cli.yaml"

fail() { echo "❌ $1" >&2; exit 1; }

[[ -f "$CLI_YAML" ]] || fail "Kör render login först (~/.render/cli.yaml saknas)."
API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
[[ -n "$API_KEY" ]] || fail "Kunde inte läsa Render API-nyckel."

EXISTING_JSON="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" || echo '[]')"

MERGED_JSON="$(node - "$ROOT_DIR/render.yaml" "$EXISTING_JSON" <<'NODE'
const fs = require('fs');
const yamlPath = process.argv[2];
const existingRaw = process.argv[3] || '[]';
const existing = JSON.parse(existingRaw);
const map = new Map(
  existing.map((row) => {
    const ev = row.envVar || row;
    return [ev.key, ev.value ?? ''];
  })
);

const yaml = fs.readFileSync(yamlPath, 'utf8');
const defaults = {
  ARCANA_STATE_ROOT: '/var/data',
  ARCANA_CCO_BOOKING_STORE_PATH: '/var/data/cco-booking.json',
  ARCANA_CCO_BOOKING_ENGINE_STORE_PATH: '/var/data/cco-booking-engine.json',
  PLAYWRIGHT_BROWSERS_PATH: '/var/data/playwright-browsers',
  NODE_ENV: 'production',
  TRUST_PROXY: 'true',
  ARCANA_AI_PROVIDER: 'fallback',
  ARCANA_GRAPH_READ_ENABLED: 'false',
  ARCANA_GRAPH_SEND_ENABLED: 'false',
  ARCANA_GRAPH_FULL_TENANT: 'true',
  ARCANA_GRAPH_USER_SCOPE: 'all',
  ARCANA_BOOTSTRAP_MAILBOX_BACKFILL: 'true',
  ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS: '14',
  ARCANA_BOOTSTRAP_PREFERRED_MAILBOX: 'contact@hairtpclinic.com',
  ARCANA_BOOTSTRAP_TENANT_ID: 'hair-tp-clinic',
  ARCANA_BOOTSTRAP_DELAY_MS: '5000',
  ARCANA_AUTH_OWNER_MFA_REQUIRED: 'false',
  ARCANA_PREFLIGHT_READINESS_CHECKS: 'cors_strict',
  ARCANA_BOOTSTRAP_RESET_OWNER_MFA: 'false',
  ARCANA_MARKETING_CONNECTORS_ENABLED: 'true',
  ARCANA_MARKETING_CONNECTORS_MODE: 'fixture',
  ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'false',
  ARCANA_MARKETING_GOOGLE_ADS_ENABLED: 'true',
  ARCANA_MARKETING_META_ENABLED: 'true',
  ARCANA_MARKETING_LINKEDIN_ENABLED: 'true',
  PUBLIC_BASE_URL: 'https://arcana.hairtpclinic.se',
  ARCANA_STAFF_JOURNAL_OPEN_ACCESS: 'true',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!map.has(key) || map.get(key) === '') map.set(key, value);
}

process.stdout.write(
  JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })))
);
NODE
)"

BEFORE_COUNT="$(printf '%s' "$EXISTING_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"
AFTER_COUNT="$(printf '%s' "$MERGED_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"

echo "Återställer env-vars: $BEFORE_COUNT → $AFTER_COUNT nycklar"
curl -fsS -X PUT \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" \
  -d "$MERGED_JSON" >/dev/null

if command -v render >/dev/null 2>&1; then
  render restart "$SERVICE_ID" --confirm -o text >/dev/null
  echo "✅ Env återställd + omstart triggad"
else
  echo "✅ Env återställd (starta om service manuellt i Render)"
fi
