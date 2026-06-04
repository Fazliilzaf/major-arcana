#!/usr/bin/env bash
# Vänta tills Render Blueprint CCO-Next synkat given commit (autoSync vid push).
# Deploy-drift: timeout eller sync-lag är icke-blockerande — post-deploy-heal fortsätter
# med env-restore (samma policy som verify-render-blueprint-link.sh soft warnings).
set -euo pipefail

BLUEPRINT_ID="${RENDER_BLUEPRINT_ID:-exs-d6vdjapaae7s7386fum0}"
TARGET_SHA="${TARGET_SHA:-}"
CLI_YAML="${HOME}/.render/cli.yaml"
API_KEY="${RENDER_API_KEY:-}"
MAX_ATTEMPTS="${RENDER_BLUEPRINT_SYNC_MAX_ATTEMPTS:-36}"
SLEEP_SECONDS="${RENDER_BLUEPRINT_SYNC_SLEEP_SECONDS:-10}"

fail() { echo "❌ $1" >&2; exit 1; }

[[ -n "$TARGET_SHA" ]] || fail "TARGET_SHA saknas"

if [[ -z "$API_KEY" && -f "$CLI_YAML" ]]; then
  API_KEY="$(grep 'key: rnd_' "$CLI_YAML" | head -1 | awk '{print $2}')"
fi
[[ -n "$API_KEY" ]] || fail "Saknar Render API-nyckel"

target_short="${TARGET_SHA:0:7}"
echo "Väntar på Blueprint-sync för commit ${target_short} (max ${MAX_ATTEMPTS} försök)..."

in_progress_seen=0

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  body="$(curl -fsS -H "Authorization: Bearer ${API_KEY}" \
    "https://api.render.com/v1/blueprints/${BLUEPRINT_ID}/syncs?limit=5" 2>/dev/null || echo '[]')"
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
    echo "  sync hittad: state=$state commit=$commit (försök $i/$MAX_ATTEMPTS)"
    case "$state" in
      success)
        echo "Blueprint sync klar för ${commit}."
        exit 0
        ;;
      failed)
        fail "Blueprint sync misslyckades för ${commit}"
        ;;
      in_progress|pending|queued|created|running)
        in_progress_seen=1
        echo "  sync pågår ($state) — väntar..."
        ;;
      *)
        echo "  okänd sync-state ($state) — väntar..."
        ;;
    esac
  else
    latest_short="$(printf '%s' "$body" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        try {
          const rows=JSON.parse(d);
          console.log(rows[0]?.sync?.commit?.id?.slice(0,7)||'');
        } catch {}
      });")"
    if [[ -n "$latest_short" && "$latest_short" != "$target_short" ]]; then
      echo "  försök $i/$MAX_ATTEMPTS: senaste sync=$latest_short, väntar på ${target_short}"
    else
      echo "  försök $i/$MAX_ATTEMPTS: ingen sync för ${target_short} ännu"
    fi
  fi
  sleep "$SLEEP_SECONDS"
done

if [[ "$in_progress_seen" -eq 1 ]]; then
  echo "::warning::Blueprint-sync för ${target_short} fortfarande in_progress efter timeout — fortsätter med env-heal (icke-blockerande drift)"
else
  echo "::warning::Blueprint nådde inte ${target_short} inom timeout — fortsätter med env-heal (icke-blockerande drift)"
fi
exit 0
