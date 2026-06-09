#!/usr/bin/env bash
# Graph send-only go-live på Render prod (READ fortsatt av).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.com}"
BASE="${BASE%/}"

fail() { echo "❌ $1" >&2; exit 1; }
pass() { echo "✅ $1"; }
warn() { echo "⚠ $1"; }

[[ -f .env ]] || fail "Saknar .env med ARCANA_GRAPH_CLIENT_SECRET (se docs/ops/graph-resend-go-live.md)"

node ./scripts/apply-graph-send-only-prod.js

echo "Väntar på prod readyz..."
for attempt in $(seq 1 60); do
  code="$(curl -sS -o /tmp/graph-send-readyz.json -w '%{http_code}' "${BASE}/readyz" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    pass "Prod readyz OK (försök $attempt)"
    break
  fi
  echo "  försök $attempt (readyz=$code)"
  sleep 10
  [[ "$attempt" -eq 60 ]] && fail "Prod readyz timeout"
done

npm run verify:graph-send-status-prod || warn "Graph send status — kontrollera manuellt"
npm run enable:digest-prod || warn "Digest enable — kontrollera manuellt"

pass "Graph send go-live script klart"
