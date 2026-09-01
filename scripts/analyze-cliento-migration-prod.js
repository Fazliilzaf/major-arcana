#!/usr/bin/env node
/**
 * Analyserar Cliento-storen inför en eventuell migrering till CCO-egna
 * bokningar (source -> cco_engine) — mäter vad som faktiskt krävs för att
 * preflight-grindarna ska passera.
 *
 * LÄSANDE. Skapar, ändrar och avbokar ingenting.
 *
 * Usage:
 *   node scripts/analyze-cliento-migration-prod.js
 *
 * Körs mot prod-storen /var/data/cco/cliento-bookings.json på Render.
 */
'use strict';

const { execSync } = require('node:child_process');

const REMOTE = 'srv-d8b3i3tckfvc73clgeng@ssh.frankfurt.render.com';
const KEY = `${process.env.HOME}/.ssh/id_render`;
const STORE = '/var/data/cco/cliento-bookings.json';

const SCRIPT = `
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('${STORE}', 'utf8'));
const b = c.bookings || {};
let total = 0, withNotes = 0, withPatient = 0, withEmail = 0, withService = 0, withEncounter = 0;
const staffNames = {};
const serviceMissing = [];
const noPatient = [];
for (const k of Object.keys(b)) {
  const arr = Array.isArray(b[k]) ? b[k] : [b[k]];
  for (const v of arr) {
    total++;
    if (v.notes) withNotes++;
    if (v.patientId) withPatient++; else noPatient.push({ id: v.bookingId, name: v.customerName, at: v.startsAt });
    if (v.customerEmail) withEmail++;
    if (v.serviceLabel) withService++; else serviceMissing.push({ id: v.bookingId, name: v.customerName });
    if (v.encounterId) withEncounter++;
    const sn = String(v.staffName || 'SAKNAS');
    staffNames[sn] = (staffNames[sn] || 0) + 1;
  }
}
console.log('TOTAL_BOKNINGAR:', total);
console.log('MED_PATIENT_ID:', withPatient, '(' + Math.round(100 * withPatient / total) + '%)');
console.log('MED_EMAIL:', withEmail, '(' + Math.round(100 * withEmail / total) + '%)');
console.log('MED_SERVICE:', withService, '(' + Math.round(100 * withService / total) + '%)');
console.log('MED_NOTES:', withNotes, '(' + Math.round(100 * withNotes / total) + '%)');
console.log('MED_ENCOUNTER_ID:', withEncounter);
console.log('SAKNAR_PATIENT:', noPatient.length, '| exempel:', JSON.stringify(noPatient.slice(0, 3)));
console.log('SAKNAR_SERVICE:', serviceMissing.length, '| exempel:', JSON.stringify(serviceMissing.slice(0, 3)));
// Tjänstenamn i vårdgivarfältet (grind 7 datakvalitet)
const serviceNames = ['Transplantation', 'Fysisk konsultation', 'Online konsultation', 'Konsultation'];
let serviceInStaff = 0;
for (const k of Object.keys(b)) {
  const arr = Array.isArray(b[k]) ? b[k] : [b[k]];
  for (const v of arr) {
    if (serviceNames.some((s) => String(v.staffName || '').includes(s))) serviceInStaff++;
  }
}
console.log('TJANSTENAMN_I_STAFF:', serviceInStaff);
console.log('TOPP_STAFF:', Object.entries(staffNames).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k + ':' + n).join(', '));
`;

function main() {
  const out = execSync(
    `cat <<'EOF' | ssh -o BatchMode=yes -o ConnectTimeout=20 -i "${KEY}" "${REMOTE}" node -\n${SCRIPT}\nEOF`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  console.log(out.trim());
}

main();
