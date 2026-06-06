#!/usr/bin/env bash
# Återställ icke-hemliga Render env-vars från render.yaml + behåll befintliga.
# Render PUT /env-vars ERSÄTTER hela listan — detta skript mergar säkert.
#
# ⚠ Kör ENDAST manuellt eller via workflow_dispatch med restore_env_from_blueprint=true.
# GET pagineras (limit=100); vid API-fel avbryts skriptet (ingen tyst tom lista).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=render-prod-defaults.sh
source "$ROOT_DIR/scripts/render-prod-defaults.sh"
SERVICE_ID="${RENDER_SERVICE_ID:-$RENDER_PROD_SERVICE_ID}"

fail() { echo "❌ $1" >&2; exit 1; }

if [[ "${RENDER_ENV_RESTORE_ENABLED:-}" == "false" ]]; then
  echo "⏭ Env restore avstängd (RENDER_ENV_RESTORE_ENABLED=false)"
  exit 0
fi

API_KEY="${RENDER_API_KEY:-}"
if [[ -z "$API_KEY" && -f "${HOME}/.render/cli.yaml" ]]; then
  API_KEY="$(grep 'key: rnd_' "${HOME}/.render/cli.yaml" | head -1 | awk '{print $2}')"
fi
[[ -n "$API_KEY" ]] || fail "Saknar Render API-nyckel (RENDER_API_KEY eller render login)."

EXISTING_JSON="$(node "$ROOT_DIR/scripts/fetch-render-env-vars.js" --service-id "$SERVICE_ID" --json)"

MERGED_JSON="$(node "$ROOT_DIR/scripts/merge-render-env-from-blueprint.js" \
  "$ROOT_DIR/render.yaml" "$EXISTING_JSON")"

BEFORE_COUNT="$(printf '%s' "$EXISTING_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"
AFTER_COUNT="$(printf '%s' "$MERGED_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"
YAML_COUNT="$(node -e "const {parseRenderYamlEnvDefaults}=require('$ROOT_DIR/scripts/merge-render-env-from-blueprint.js');const fs=require('fs');console.log(parseRenderYamlEnvDefaults(fs.readFileSync('$ROOT_DIR/render.yaml','utf8')).size);")"

if [[ "$AFTER_COUNT" -lt "$BEFORE_COUNT" ]]; then
  fail "Merge skulle minska env count ($BEFORE_COUNT → $AFTER_COUNT) — avbryter PUT"
fi

echo "Blueprint defaults: $YAML_COUNT nycklar"
echo "Återställer env-vars: $BEFORE_COUNT → $AFTER_COUNT nycklar"

curl -fsS -X PUT \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" \
  -d "$MERGED_JSON" >/dev/null

if [[ "${RENDER_ENV_RESTORE_RESTART:-true}" == "true" ]]; then
  curl -fsS -X POST \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Accept: application/json" \
    "https://api.render.com/v1/services/${SERVICE_ID}/restart" >/dev/null
  echo "✅ Env återställd + omstart via Render API"
else
  echo "✅ Env återställd (ingen omstart — ny deploy krävs för process.env)"
fi
