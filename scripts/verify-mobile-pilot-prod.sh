#!/usr/bin/env bash
# Mobil pilot — prod-verifiering + deep links för personal (Fas 5.5 förberedelse).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"

pass() { echo "✅ $1"; }
warn() { echo "⚠️  $1"; }
fail() { echo "❌ $1"; exit 1; }

echo "== Mobil pilot prod-verify =="
echo "BASE: $BASE"
echo ""

# Ladda STAFF/OWNER från .env om saknas (go-live)
if [[ -f .env ]]; then
  if [[ -z "${ARCANA_STAFF_EMAIL:-}" ]]; then
    ARCANA_STAFF_EMAIL="$(node -r dotenv/config -e "console.log(process.env.ARCANA_STAFF_EMAIL||'')")"
    export ARCANA_STAFF_EMAIL
  fi
  if [[ -z "${ARCANA_STAFF_PASSWORD:-}" ]]; then
    ARCANA_STAFF_PASSWORD="$(node -r dotenv/config -e "console.log(process.env.ARCANA_STAFF_PASSWORD||'')")"
    export ARCANA_STAFF_PASSWORD
  fi
fi

bash "$ROOT_DIR/scripts/smoke-mobile-journal.sh"

HEALTH="$(curl -fsS "$BASE/api/v1/health/journal-photos")"
OPEN="$(printf '%s' "$HEALTH" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).staffJournalOpenAccess));")"
if [[ "$OPEN" == "true" ]]; then
  pass "ARCANA_STAFF_JOURNAL_OPEN_ACCESS=true — personal når journal utan login (pilotläge)"
else
  pass "Auth go-live aktiv — journal kräver login (OPEN_ACCESS=false)"
  if node -r dotenv/config -e "process.exit(process.env.ARCANA_STAFF_EMAIL&&process.env.ARCANA_STAFF_PASSWORD?0:1)" 2>/dev/null; then
    pass "STAFF-credentials finns lokalt — smoke använder staff@ för API-tester"
  else
    warn "Saknar ARCANA_STAFF_* i .env — API-upload-tester kan hoppas över"
  fi
fi

STAFF_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -L "$BASE/staff?view=customers")"
[[ "$STAFF_CODE" == "200" ]] || fail "/staff HTTP $STAFF_CODE"
pass "/staff?view=customers laddas ($STAFF_CODE)"

[[ -f "$PILOT_JSON" ]] || warn "Saknar $PILOT_JSON — hoppar deep links"

if [[ -f "$PILOT_JSON" ]]; then
  echo ""
  echo "=== Pilotkunder — öppna på telefon ==="
  node - "$BASE" "$PILOT_JSON" <<'NODE'
const base = process.argv[2];
const pilot = require(process.argv[3]);
for (const row of pilot.patients || []) {
  const url = `${base}/major-arcana-preview/?view=customers&patientId=${encodeURIComponent(row.patientId)}`;
  const staff = `${base}/staff?view=customers&patientId=${encodeURIComponent(row.patientId)}`;
  console.log(`\n${row.displayName}`);
  console.log(`  Staff:  ${staff}`);
  console.log(`  Direct: ${url}`);
}
NODE
fi

echo ""
echo "=== Nästa (personal) ==="
echo "1. Logga in på /staff med STAFF-konto (staff@hairtpclinic.se — lösenord i .env/GitHub Secrets)"
echo "2. Öppna Staff-länk ovan på iPhone/Android"
echo "3. Journal → Ta bild → verifiera bild inom 10 sek"
echo "4. Fyll i docs/strategy/cco-mobile-staff-pilot-checklist.md"
echo ""
pass "Mobil pilot prod-verify klar"
