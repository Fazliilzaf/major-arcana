#!/usr/bin/env bash
# Skriv ut copy-paste-meddelande till pilotpersonal (Slack/SMS/mail).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE="${ARCANA_PROD_URL:-https://arcana.hairtpclinic.se}"
BASE="${BASE%/}"
PILOT_JSON="${PILOT_JSON:-./data/pilot-patients.json}"

[[ -f "$PILOT_JSON" ]] || { echo "Saknar $PILOT_JSON"; exit 1; }

node - "$BASE" "$PILOT_JSON" <<'NODE'
const base = process.argv[2];
const pilot = require(process.argv[3]);

console.log(`CCO mobil pilot — start (Fas 5.6)

Hej! CCO är redo för pilot på telefon.

1. Öppna Safari/Chrome: ${base}/staff
2. Logga in (STAFF-konto)
3. Gå till Kunder (tab bar) → välj kund ELLER öppna länk nedan
4. Fliken Journal → tryck Ta bild → ta foto → välj etikett

Instruktion (1 sida): docs/strategy/cco-mobile-staff-instructions.md

Pilotkunder:`);

for (const row of pilot.patients || []) {
  const url = `${base}/staff?view=customers&patientId=${encodeURIComponent(row.patientId)}`;
  console.log(`• ${row.displayName}: ${url}`);
}

console.log(`
Efter varje test: fyll i docs/strategy/cco-mobile-staff-pilot-checklist.md
Mål: 2 personal × 5 konsultationer totalt.

Tack!`);
NODE
