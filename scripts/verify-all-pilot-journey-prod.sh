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
bash "$ROOT_DIR/scripts/verify-pilot-journey-prod.sh" >/dev/null
VERSION="$(curl -fsS "$BASE/api/v1/_diag/version")"
COMMIT="$(printf '%s' "$VERSION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).commit.slice(0,7)));")"
echo "Prod commit: $COMMIT"
echo ""

FAILED=0
while IFS= read -r patientId; do
  [[ -n "$patientId" ]] || continue
  node - "$BASE" "$patientId" <<'NODE'
const base = process.argv[2];
const patientId = process.argv[3];
const headers = { Accept: 'application/json', 'x-arcana-client': 'major_arcana_admin' };

async function get(path) {
  const res = await fetch(new URL(path, base), { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

(async () => {
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
  const gateOk = gate?.allowed === true;
  const offerOk = commercial?.quoteStatus === 'accepted';
  const agreementOk = agreement?.agreementStatus === 'bookable';
  const healthOk = healthCount === 1;
  const planOk = planCount >= 1;
  const ok = gateOk && offerOk && agreementOk && healthOk && planOk;

  const status = ok ? '✓' : '✗';
  console.log(
    `${status} ${patient.displayName}: gate=${gateOk ? 'open' : 'blocked'} offert=${commercial?.quoteStatus || '-'} avtal=${agreement?.agreementStatus || '-'} hälsodekl=${healthCount} plan=${planCount}`
  );
  if (!ok) process.exitCode = 1;
})();
NODE
  if [[ "${PIPESTATUS[0]:-0}" -ne 0 ]]; then
    FAILED=$((FAILED + 1))
  fi
done < <(node -e "const p=require('$PILOT_JSON'); for (const id of p.patientIds||[]) console.log(id);")

echo ""
if [[ "$FAILED" -eq 0 ]]; then
  echo "✓ Alla pilotkunder OK"
else
  echo "✗ $FAILED kund(er) behöver åtgärd"
  exit 1
fi
