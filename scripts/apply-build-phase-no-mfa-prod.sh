#!/usr/bin/env bash
# Byggfas: stäng av MFA-krav och open-access journal tills go-live.
# Uppdaterar Render env + deploy. Kräver Render API-nyckel (render login).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
SERVICE_ID="${RENDER_SERVICE_ID:-srv-d6b11o0boq4c73chm7f0}"

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

echo "=== Byggfas: MFA av på prod ($BASE) ==="

node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d6b11o0boq4c73chm7f0';
const cliYaml = fs.readFileSync(path.join(process.env.HOME, '.render/cli.yaml'), 'utf8');
const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
if (!apiKey) throw new Error('Saknar Render API key (kör: render login)');

(async () => {
  const existingRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const existing = await existingRes.json();
  const map = new Map(
    existing.map((row) => {
      const ev = row.envVar || row;
      return [ev.key, ev.value ?? ''];
    })
  );
  map.set('ARCANA_AUTH_OWNER_MFA_REQUIRED', 'false');
  map.set('ARCANA_STAFF_JOURNAL_OPEN_ACCESS', 'true');
  map.set('ARCANA_PREFLIGHT_READINESS_CHECKS', 'cors_strict');
  map.set('ARCANA_BOOTSTRAP_RESET_OWNER_MFA', 'false');

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) throw new Error(`Render env PUT failed: ${putRes.status}`);

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
