#!/usr/bin/env bash
# Field pilot Fas 5.6 — kör all automation, skriv ut deep links för personal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"
FAIL=0

section() { echo ""; echo "=== $1 ==="; }
pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAIL=1; }

section "Prod-verify (automation)"
npm run verify:cco-mail-start-prod && pass "Mail-lik start" || fail "Mail-lik start"
npm run verify:cco-mobile-pilot-prod && pass "Mobil pilot suite" || fail "Mobil pilot suite"

section "Rollout sweep"
npm run run:rollout-sweep && pass "Rollout sweep" || fail "Rollout sweep"

section "Journal backup"
if npm run backup:journal-photos >/dev/null 2>&1; then
  pass "Journal photo backup"
else
  fail "Journal photo backup"
fi

section "Pilotkunder — öppna på telefon (STAFF-login)"
if [[ ! -f "$PILOT_JSON" ]]; then
  fail "Saknar $PILOT_JSON"
else
  node - "$BASE" "$PILOT_JSON" <<'NODE'
const base = process.argv[2];
const pilot = require(process.argv[3]);
console.log('');
console.log('Instruktion: docs/strategy/cco-mobile-staff-instructions.md');
console.log('Checklista:  docs/strategy/cco-mobile-staff-pilot-checklist.md (Fas 5.6)');
console.log('');
for (const row of pilot.patients || []) {
  const staff = `${base}/staff?view=customers&patientId=${encodeURIComponent(row.patientId)}`;
  console.log(`${row.displayName}`);
  console.log(`  ${staff}`);
  console.log('');
}
NODE
  pass "Deep links skrivna ovan"
fi

section "Manuellt (2 personal × 5 konsultationer)"
echo "1. Skicka instruktion + länkar ovan till pilotpersonal"
echo "2. Testa på iPhone Safari + Android Chrome (tabell i checklistan)"
echo "3. Fyll i konsultations-tabell + feedback (1–5) i checklistan"
echo "4. GO/NO-GO när ≥5 konsultationer klara"

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  fail "Field pilot kickoff — minst ett automatiserat steg misslyckades"
  exit 1
fi

echo ""
pass "Field pilot kickoff (automation) klar — väntar på fysiska enhetstester"
