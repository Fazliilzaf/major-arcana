#!/usr/bin/env bash
# Verifiera alla pilotkunder på prod (gate, offert, journal).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"

fail() { echo "✗ $1"; exit 1; }

[[ -f "$PILOT_JSON" ]] || fail "Saknar $PILOT_JSON"

echo "=== Alla pilotkunder ($BASE) ==="
FIRST_ID="$(node -e "const p=require('$PILOT_JSON'); console.log((p.patientIds||[])[0]||'');")"
[[ -n "$FIRST_ID" ]] || fail "pilot-patients.json saknar patientIds"
bash "$ROOT_DIR/scripts/verify-pilot-journey-prod.sh" "$FIRST_ID" >/dev/null
VERSION="$(curl -fsS "$BASE/api/v1/_diag/version")"
COMMIT="$(printf '%s' "$VERSION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).commit.slice(0,7)));")"
echo "Prod commit: $COMMIT"
echo ""

AUTH_TOKEN="$(node "$ROOT_DIR/scripts/get-prod-auth-token.js" --owner 2>/dev/null || node "$ROOT_DIR/scripts/get-prod-auth-token.js" 2>/dev/null || true)"
export AUTH_TOKEN

FAILED=0
node - "$BASE" "$PILOT_JSON" <<'NODE'
const path = require('node:path');
const { resolvePilotProdId } = require(path.join(process.cwd(), 'scripts/lib/resolve-pilot-prod-id.js'));

const base = process.argv[2];
const pilotJson = process.argv[3];
const token = process.env.AUTH_TOKEN || '';
const pilots = require(path.resolve(pilotJson));
const headers = { Accept: 'application/json', 'x-arcana-client': 'major_arcana_admin' };
if (token) headers.Authorization = `Bearer ${token}`;

async function get(pathname) {
  const res = await fetch(new URL(pathname, base), { headers });
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`);
  return res.json();
}

(async () => {
  let failed = 0;
  for (const row of pilots.patients || []) {
    const resolved = await resolvePilotProdId({ base, token, pilotRow: row });
    if (!resolved?.patientId) {
      console.log(`✗ ${row.displayName}: hittades inte på prod`);
      failed += 1;
      continue;
    }
    const patientId = resolved.patientId;
    const patient = (await get(`/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`)).patient;
    const gate = (await get(`/api/v1/cco-treatment-agreement/booking-gate?patientId=${encodeURIComponent(patientId)}&serviceId=fue`)).gate;
    const commercial = (await get(`/api/v1/cco-commercial/patient-case?patientId=${encodeURIComponent(patientId)}`)).commercialCase;
    const agreement = (await get(`/api/v1/cco-treatment-agreement/patient-agreement?patientId=${encodeURIComponent(patientId)}`)).agreement;
    const journal = await get(`/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`);
    const types = (journal.entries || []).reduce((acc, e) => {
      acc[e.journalType] = (acc[e.journalType] || 0) + 1;
      return acc;
    }, {});

    const healthCount = types.health_declaration || 0;
    const planCount = types.consultation_plan || 0;
    const historicalCount = types.historical_import || 0;
    const gateOk = gate?.allowed === true;
    const offerOk = commercial?.quoteStatus === 'accepted';
    const agreementOk = agreement?.agreementStatus === 'bookable';
    const healthOk = healthCount === 1;
    const planOk = planCount >= 1;
    const ok = gateOk && offerOk && agreementOk && healthOk && planOk;

    const status = ok ? '✓' : '✗';
    console.log(
      `${status} ${patient.displayName}: gate=${gateOk ? 'open' : 'blocked'} offert=${commercial?.quoteStatus || '-'} avtal=${agreement?.agreementStatus || '-'} hälsodekl=${healthCount} plan=${planCount} historik=${historicalCount}`
    );
    if (!ok) failed += 1;
  }
  process.exit(failed > 0 ? 1 : 0);
})();
NODE
FAILED=$?

echo ""
if [[ "$FAILED" -eq 0 ]]; then
  echo "✓ Alla pilotkunder OK"
else
  echo "✗ $FAILED kund(er) behöver åtgärd"
  exit 1
fi
