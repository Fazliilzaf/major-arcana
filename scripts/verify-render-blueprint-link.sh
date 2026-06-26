#!/usr/bin/env bash
# Verifiera att render.yaml pekar på prod-tjänsten och Blueprint CCO-Next är synkad.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d8b3i3tckfvc73clgeng}"
BLUEPRINT_ID="${RENDER_BLUEPRINT_ID:-exs-d6vdjapaae7s7386fum0}"
CLI_YAML="${HOME}/.render/cli.yaml"
API_KEY="${RENDER_API_KEY:-}"

fail() { echo "❌ $1" >&2; exit 1; }

if [[ -z "$API_KEY" && -f "$CLI_YAML" ]]; then
  API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
fi
[[ -n "$API_KEY" ]] || fail "Saknar Render API-nyckel (RENDER_API_KEY eller render login)."

YAML_NAME="$(node -e "
  const fs=require('fs');
  const lines=fs.readFileSync('$ROOT_DIR/render.yaml','utf8').split(/\r?\n/);
  const idx=lines.findIndex(l=>/^\s*-\s*type:\s*web/.test(l));
  if (idx<0) process.exit(1);
  for (let i=idx+1;i<lines.length;i++) {
    const m=lines[i].match(/^\s*name:\s*(.+)\s*$/);
    if (m) { console.log(m[1].trim()); process.exit(0); }
    if (/^\s*-\s*type:/.test(lines[i])) break;
  }
  process.exit(1);
")" || fail "Kunde inte läsa web-tjänstens name från render.yaml"

if [[ -n "${RENDER_EXPECTED_SERVICE_NAME:-}" && "$YAML_NAME" != "$RENDER_EXPECTED_SERVICE_NAME" ]]; then
  fail "render.yaml name=$YAML_NAME, förväntat $RENDER_EXPECTED_SERVICE_NAME (RENDER_EXPECTED_SERVICE_NAME)"
fi

SERVICE_JSON="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
  "https://api.render.com/v1/services/${SERVICE_ID}")"
ACTUAL_NAME="$(printf '%s' "$SERVICE_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).name));")"
[[ "$ACTUAL_NAME" == "$YAML_NAME" ]] || fail "Prod-tjänst ($SERVICE_ID) heter $ACTUAL_NAME, render.yaml har name=$YAML_NAME"

BP_JSON="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
  "https://api.render.com/v1/blueprints/${BLUEPRINT_ID}")"
BP_STATUS="$(printf '%s' "$BP_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log([j.autoSync,j.status,j.path,j.repo].join('|'));});")"
IFS='|' read -r BP_AUTO BP_STATE BP_PATH BP_REPO <<< "$BP_STATUS"
if [[ "$BP_AUTO" != "true" ]]; then
  if [[ "${RENDER_BLUEPRINT_AUTOSYNC_REQUIRED:-true}" == "false" ]]; then
    echo "::warning::Blueprint autoSync är av ($BP_AUTO) — accepterat eftersom prod-deploy triggas via Render API/deploy hook."
  else
    fail "Blueprint autoSync är av ($BP_AUTO)"
  fi
fi
[[ "$BP_PATH" == "render.yaml" ]] || fail "Blueprint path=$BP_PATH, förväntat render.yaml"
[[ "$BP_REPO" == *"Fazliilzaf/major-arcana"* ]] || fail "Blueprint repo=$BP_REPO"

echo "✅ Blueprint kopplad: $YAML_NAME ($SERVICE_ID), status=$BP_STATE, autoSync=$BP_AUTO"

if [[ -n "${TARGET_SHA:-}" ]]; then
  target_short="${TARGET_SHA:0:7}"
  sync_commit="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
    "https://api.render.com/v1/blueprints/${BLUEPRINT_ID}/syncs?limit=1" | \
    node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j[0]?.sync?.commit?.id?.slice(0,7)||'')}catch{}});")"
  if [[ -n "$sync_commit" && "$sync_commit" != "$target_short" ]]; then
    echo "⚠ Senaste blueprint-sync ($sync_commit) matchar inte push ($target_short) — autoSync kan vara på väg"
  else
    echo "✅ Blueprint sync commit matchar push ($target_short)"
  fi
fi
