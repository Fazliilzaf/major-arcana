#!/usr/bin/env bash
# Byggfas: stäng av MFA-krav och open-access journal tills go-live.
# Uppdaterar Render env + deploy. Kräver Render API-nyckel (render login).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.com}"
BASE="${BASE%/}"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d8b3i3tckfvc73clgeng}"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

echo "=== Byggfas: MFA av på prod ($BASE) ==="

node <<'NODE'
// ORD-156: merge-PUT går via scripts/lib/renderEnvApi. Den inbäddade GET som
// stod här hämtade med ?limit=100 utan cursor — med 122 deklarerade nycklar i
// render.yaml raderade PUT:en tyst allt bortom första sidan.
const path = require('node:path');
const { resolveRenderApiKey, putRenderEnvMerged } = require(
  path.join(process.cwd(), 'scripts/lib/renderEnvApi')
);

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const apiKey = resolveRenderApiKey();
if (!apiKey) throw new Error('Saknar Render API key (kör: render login)');

(async () => {
  const { before, after, changed } = await putRenderEnvMerged(
    serviceId,
    {
      ARCANA_AUTH_OWNER_MFA_REQUIRED: 'false',
      ARCANA_STAFF_JOURNAL_OPEN_ACCESS: 'true',
      ARCANA_PREFLIGHT_READINESS_CHECKS: 'cors_strict',
      ARCANA_BOOTSTRAP_RESET_OWNER_MFA: 'false',
    },
    { apiKey }
  );
  console.log(`Render env: ${before} → ${after} nycklar (ändrade: ${changed.join(', ') || 'inga'})`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deploy = await deployRes.json();
  console.log(`Render deploy startad: ${deploy.id || deploy.deploy?.id || 'ok'}`);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
NODE

echo "Väntar på readyz..."
for attempt in $(seq 1 36); do
  if curl -fsS "${BASE}/readyz" | grep -q '"ready":true'; then
    pass "readyz grön"
    break
  fi
  sleep 10
  if [[ "$attempt" -eq 36 ]]; then
    fail "readyz timeout"
  fi
done

DIAG="$(curl -fsS "${BASE}/api/v1/_diag/env" 2>/dev/null || echo '{}')"
echo "$DIAG" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    const mfa=j.resolved?.authOwnerMfaRequired ?? j.env?.ARCANA_AUTH_OWNER_MFA_REQUIRED;
    const open=j.resolved?.staffJournalOpenAccess ?? j.env?.ARCANA_STAFF_JOURNAL_OPEN_ACCESS;
    console.log('ARCANA_AUTH_OWNER_MFA_REQUIRED=', mfa);
    console.log('ARCANA_STAFF_JOURNAL_OPEN_ACCESS=', open);
    if (mfa === true || mfa === 'true') process.exit(2);
  } catch { process.exit(3); }
});
" && pass "MFA av i prod-diag" || fail "MFA fortfarande på i prod — kontrollera Render manuellt"

echo "Klart. Logga in med e-post + lösenord (ingen MFA-prompt)."
