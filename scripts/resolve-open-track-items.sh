#!/usr/bin/env bash
# Lös öppna spår-punkter: enrich → push index only → verify (valfritt MFA).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DO_MFA=false
for arg in "$@"; do
  [[ "$arg" == "--mfa" ]] && DO_MFA=true
done

echo "=== 1. Drive enrich (återstående) ==="
npm run migration:enrich-drive-ids

echo ""
echo "=== 2. Push endast migration-index (rör ej pilot-journal) ==="
export ARCANA_OWNER_TOKEN="$(node scripts/get-prod-auth-token.js --owner)"
npm run push:migration-state-prod -- --index-only
render restart srv-d8b3i3tckfvc73clgeng --confirm || true
for i in 1 2 3 4 5 6 8; do
  curl -fsS https://arcana.hairtpclinic.se/readyz >/dev/null 2>&1 && break
  sleep 15
done

echo ""
echo "=== 3. Verify ==="
ARCANA_OWNER_TOKEN="$(node scripts/get-prod-auth-token.js --owner)" npm run verify:migration-prod
bash scripts/verify-all-pilot-journey-prod.sh | tail -5

if $DO_MFA; then
  echo ""
  echo "=== 4. Auth go-live (OWNER MFA required) ==="
  bash scripts/apply-auth-go-live-prod.sh
  npm run verify:auth-go-live-prod
fi

if [[ -n "${NOTION_API_KEY:-}" ]]; then
  echo ""
  echo "=== 5. Notion sync ==="
  node scripts/sync-notion-master-todo.mjs
else
  echo ""
  echo "ℹ NOTION_API_KEY saknas — hoppa Notion (se NOTION-SYNC-MANIFEST.md eller Cursor MCP)"
fi

if [[ -n "${RESEND_API_KEY:-}" ]]; then
  echo ""
  echo "=== 6. Resend provision ==="
  npm run provision:resend-go-live-prod
  STRICT=1 npm run verify:resend-domain-prod
else
  echo ""
  echo "ℹ RESEND_API_KEY saknas i .env — U5A.4 kvar Blocked (Graph fallback aktiv)"
fi

node -e "const f=require('./data/migration-index.json').files;const w=f.filter(x=>x.driveFileId).length;console.log('Index driveFileId:',w+'/'+f.length);"
