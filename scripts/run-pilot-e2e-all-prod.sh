#!/usr/bin/env bash
# Kör pilot-E2E för alla pilotkunder på prod
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
BASE_URL="${ARCANA_PROD_URL:-${BASE_URL:-https://arcana.hairtpclinic.se}}"

fail() { echo "✗ $1"; exit 1; }

[[ -f "$PILOT_JSON" ]] || fail "Saknar $PILOT_JSON"

ENV_COUNT="$(curl -fsS -H "Authorization: Bearer $(grep 'key: rnd_' ~/.render/cli.yaml 2>/dev/null | head -1 | awk '{print $2}')" \
  "https://api.render.com/v1/services/${RENDER_SERVICE_ID:-srv-d8b3i3tckfvc73clgeng}/env-vars" 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}});" || echo 0)"

if [[ "${ENV_COUNT:-0}" -lt 25 ]]; then
  echo "⚠ Env-vars=${ENV_COUNT} — återställer från blueprint..."
  bash "$ROOT_DIR/scripts/restore-render-env-from-blueprint.sh"
  NEED_WAIT=1
fi

wait_for_prod() {
  local attempt stable=0
  for attempt in $(seq 1 36); do
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
  fail "Prod svarar inte stabilt på ${BASE_URL}"
}

if [[ "${NEED_WAIT:-0}" == "1" ]]; then
  echo "Väntar på omstart efter env-restore..."
  wait_for_prod
fi

wait_for_prod

echo "=== Pilot E2E — alla kunder ==="
echo "BASE: $BASE_URL"
echo

FAILED=0
PASSED=0

while IFS= read -r patientId; do
  [[ -n "$patientId" ]] || continue
  echo "────────────────────────────────────────"
  if bash "$ROOT_DIR/scripts/run-pilot-e2e-prod.sh" "$patientId"; then
    PASSED=$((PASSED + 1))
  else
    echo "✗ Misslyckades: $patientId"
    FAILED=$((FAILED + 1))
  fi
  echo
done < <(node -e "const p=require('$PILOT_JSON'); for (const id of p.patientIds||[]) console.log(id);")

echo "=== Sammanfattning ==="
echo "✓ OK: $PASSED"
echo "✗ Fel: $FAILED"

[[ "$FAILED" -eq 0 ]]
