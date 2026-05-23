#!/usr/bin/env bash
# Efter Render-deploy: återställ env om nödvändigt + verifiera alla pilotkunder.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"

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

ENV_COUNT="$(curl -fsS -H "Authorization: Bearer $(grep 'key: rnd_' ~/.render/cli.yaml 2>/dev/null | head -1 | awk '{print $2}')" \
  "https://api.render.com/v1/services/${SERVICE_ID}/env-vars" 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}});" || echo 0)"

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
