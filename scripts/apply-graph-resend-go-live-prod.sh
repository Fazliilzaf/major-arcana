#!/usr/bin/env bash
# Graph read + Resend go-live på Render prod (merge PUT — ersätter inte befintliga env).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"

fail() { echo "❌ $1" >&2; exit 1; }
pass() { echo "✅ $1"; }
warn() { echo "⚠ $1"; }

[[ -f .env ]] || fail "Saknar .env — lägg Graph/Resend secrets där först (se docs/ops/graph-resend-go-live.md)"

node ./scripts/apply-graph-resend-go-live-prod.js

echo "Väntar på prod readyz..."
for attempt in $(seq 1 60); do
  code="$(curl -sS -o /tmp/graph-resend-readyz.json -w '%{http_code}' "${BASE}/readyz" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    pass "Prod readyz OK (försök $attempt)"
    break
  fi
  echo "  försök $attempt (readyz=$code)"
  sleep 10
  [[ "$attempt" -eq 60 ]] && fail "Prod readyz timeout"
done

npm run verify:graph-read-prod || warn "Graph read verify — kontrollera manuellt"

pass "Graph/Resend go-live script klart"
