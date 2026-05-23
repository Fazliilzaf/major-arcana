#!/usr/bin/env bash
# Återställ icke-hemliga Render env-vars från render.yaml + behåll befintliga.
# Render PUT /env-vars ERSÄTTER hela listan — detta skript mergar säkert.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"
CLI_YAML="${HOME}/.render/cli.yaml"
API_KEY="${RENDER_API_KEY:-}"

fail() { echo "❌ $1" >&2; exit 1; }

if [[ -z "$API_KEY" && -f "$CLI_YAML" ]]; then
  API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
fi
[[ -n "$API_KEY" ]] || fail "Saknar Render API-nyckel (RENDER_API_KEY eller render login)."

EXISTING_JSON="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" || echo '[]')"

MERGED_JSON="$(node "$ROOT_DIR/scripts/merge-render-env-from-blueprint.js" \
  "$ROOT_DIR/render.yaml" "$EXISTING_JSON")"

BEFORE_COUNT="$(printf '%s' "$EXISTING_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"
AFTER_COUNT="$(printf '%s' "$MERGED_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).length));")"
YAML_COUNT="$(node -e "const {parseRenderYamlEnvDefaults}=require('$ROOT_DIR/scripts/merge-render-env-from-blueprint.js');const fs=require('fs');console.log(parseRenderYamlEnvDefaults(fs.readFileSync('$ROOT_DIR/render.yaml','utf8')).size);")"

echo "Blueprint defaults: $YAML_COUNT nycklar"
echo "Återställer env-vars: $BEFORE_COUNT → $AFTER_COUNT nycklar"

curl -fsS -X PUT \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" \
  -d "$MERGED_JSON" >/dev/null

if [[ "${RENDER_ENV_RESTORE_RESTART:-true}" == "true" ]] && command -v render >/dev/null 2>&1; then
  render restart "$SERVICE_ID" --confirm -o text >/dev/null
  echo "✅ Env återställd + omstart triggad"
else
  echo "✅ Env återställd (ingen omstart — sätt RENDER_ENV_RESTORE_RESTART=true för restart)"
fi
