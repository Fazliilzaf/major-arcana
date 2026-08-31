#!/usr/bin/env bash
# Efter Render-deploy: återställ env om nödvändigt + verifiera alla pilotkunder.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
# shellcheck source=render-prod-defaults.sh
source "$ROOT_DIR/scripts/render-prod-defaults.sh"

BASE_URL="${ARCANA_PROD_URL:-$RENDER_PROD_URL}"
SERVICE_ID="${RENDER_SERVICE_ID:-$RENDER_PROD_SERVICE_ID}"

wait_for_prod() {
  local attempt stable=0
  for attempt in $(seq 1 24); do
    local code body
    body="$(curl -sS "${BASE_URL%/}/api/v1/_diag/version" 2>/dev/null || true)"
    code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL%/}/api/v1/_diag/version" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" && "$body" == *'"ok":true'* ]]; then
      stable=$((stable + 1))
      [[ "$stable" -ge 2 ]] && return 0
    else
      stable=0
    fi
    echo "  väntar på prod... ($attempt, http=$code)"
    sleep 5
  done
  echo "❌ Prod svarar inte stabilt"
  return 1
}

# ORD-156: räkningen gick tidigare via en enda GET med ?limit=100. Render
# pagineras, och render.yaml deklarerar 122 nycklar — en tappad sida bortom den
# första var alltså osynlig, och golvet på 25 kunde passeras med 100 saknade
# nycklar. Går nu via den paginerade hjälpmodulen.
ENV_COUNT="$(RENDER_SERVICE_ID="$SERVICE_ID" node -e "
  const { fetchAllRenderEnvMap } = require('./scripts/lib/renderEnvApi');
  fetchAllRenderEnvMap(process.env.RENDER_SERVICE_ID)
    .then((m) => console.log(m.size))
    .catch(() => console.log(0));
" 2>/dev/null || echo 0)"

echo "== Prod heal =="
echo "BASE: $BASE_URL"
echo "Render env keys: ${ENV_COUNT:-0}"

if [[ "${ENV_COUNT:-0}" -lt 25 ]]; then
  echo "⚠ Få env-nycklar — kör restore..."
  bash "$ROOT_DIR/scripts/restore-render-env-from-blueprint.sh"
  wait_for_prod
else
  wait_for_prod
fi

RESOLVED="$(curl -fsS "${BASE_URL%/}/api/v1/_diag/env")"
echo "$RESOLVED" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('stateRoot',j.resolved?.stateRoot||j.env?.ARCANA_STATE_ROOT);console.log('aiProvider',j.resolved?.aiProvider);});"

PATIENTS="$(curl -fsS "${BASE_URL%/}/api/v1/cco-patient-master/stats" -H 'x-arcana-client: major_arcana_admin' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).stats?.totalPatients||0));")"
if [[ "${PATIENTS:-0}" -lt 5 ]]; then
  echo "⚠ Endast $PATIENTS pilotkunder — pushar om..."
  bash "$ROOT_DIR/scripts/push-pilot-prod.sh"
fi

bash "$ROOT_DIR/scripts/verify-all-pilot-journey-prod.sh"
echo "✅ Prod heal klar"
