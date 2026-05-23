#!/usr/bin/env bash
# Vänta tills Render Blueprint CCO-Next synkat given commit (autoSync vid push).
set -euo pipefail

BLUEPRINT_ID="${RENDER_BLUEPRINT_ID:-exs-d6vdjapaae7s7386fum0}"
TARGET_SHA="${TARGET_SHA:-}"
CLI_YAML="${HOME}/.render/cli.yaml"
API_KEY="${RENDER_API_KEY:-}"

fail() { echo "❌ $1" >&2; exit 1; }

[[ -n "$TARGET_SHA" ]] || fail "TARGET_SHA saknas"

if [[ -z "$API_KEY" && -f "$CLI_YAML" ]]; then
  API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
fi
[[ -n "$API_KEY" ]] || fail "Saknar Render API-nyckel"

target_short="${TARGET_SHA:0:7}"
echo "Väntar på Blueprint-sync för commit ${target_short}..."

for i in $(seq 1 30); do
  body="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
    "https://api.render.com/v1/blueprints/${BLUEPRINT_ID}/syncs?limit=3" 2>/dev/null || echo '[]')"
  match="$(printf '%s' "$body" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try {
        const rows=JSON.parse(d);
        const hit=rows.find(r=>(r.sync?.commit?.id||'').startsWith('${target_short}'));
        if(hit) console.log(hit.sync.state+'|'+hit.sync.commit.id.slice(0,7));
      } catch {}
    });")"
  if [[ -n "$match" ]]; then
    IFS='|' read -r state commit <<< "$match"
    echo "  sync hittad: state=$state commit=$commit (försök $i)"
    if [[ "$state" == "success" ]]; then
      echo "Blueprint sync klar för ${commit}."
      exit 0
    fi
    if [[ "$state" == "failed" ]]; then
      fail "Blueprint sync misslyckades för ${commit}"
    fi
  else
    echo "  försök $i: ingen sync för ${target_short} ännu"
  fi
  sleep 10
done

echo "::warning::Blueprint nådde inte ${target_short} inom timeout — fortsätter med env-heal"
exit 0
