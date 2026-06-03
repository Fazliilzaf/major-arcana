#!/usr/bin/env node
'use strict';

/**
 * P0 Kunder gate: /kunder.html must not ship mock population.
 *   node scripts/verify-kunder-real-data.js
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const KUNDER = path.join(REPO, 'public/kunder.html');
const REAL_JS = path.join(REPO, 'public/cco-kunder-real.js');
const ACTIONS_JS = path.join(REPO, 'public/cco-kunder-actions.js');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const html = fs.readFileSync(KUNDER, 'utf8');
const js = fs.existsSync(REAL_JS) ? fs.readFileSync(REAL_JS, 'utf8') : '';

/** Active customers-shell region only (not voice/watch overlays below). */
const customersStart = html.indexOf('<section class="customers-shell">');
let customersHtml = html;
if (customersStart >= 0) {
  const closeIdx = html.indexOf('</section>', customersStart);
  customersHtml = closeIdx >= 0 ? html.slice(customersStart, closeIdx + '</section>'.length) : html;
}

if (!js.includes('cco/staff/customers-shell')) {
  fail('cco-kunder-real.js saknar customers-shell API');
} else {
  pass('cco-kunder-real.js kopplad till customers-shell');
}

if (!html.includes('cco-kunder-real.js')) {
  fail('kunder.html inkluderar inte cco-kunder-real.js');
} else {
  pass('kunder.html laddar cco-kunder-real.js');
}

if (!html.includes('cco-kunder-actions.js')) {
  fail('kunder.html inkluderar inte cco-kunder-actions.js (P1.1)');
} else {
  pass('kunder.html laddar cco-kunder-actions.js');
}

if (!fs.existsSync(ACTIONS_JS)) {
  fail('cco-kunder-actions.js saknas');
} else {
  pass('cco-kunder-actions.js finns');
}

if (!js.includes('kunderLoadMore') && !js.includes('Ladda fler')) {
  fail('cco-kunder-real.js saknar paginering Ladda fler');
} else {
  pass('cco-kunder-real.js har Ladda fler');
}

const blockedHtml = [
  { re: /\bCUSTOMER_ROWS\b/, label: 'CUSTOMER_ROWS array' },
  { re: /\bconst CUSTOMERS\b/, label: 'CUSTOMERS mock search array' },
  { re: /\bDOSSIER_DATA\b/, label: 'DOSSIER_DATA mock' },
  { re: /1\s*247/, label: 'mock count 1247' },
  { re: /49\s*MSEK/, label: 'mock revenue 49 MSEK' },
  { re: /485\s*200\s*kr/, label: 'mock weekly revenue' },
  { re: /renderDriveSection/, label: 'Drive link builder' },
  { re: /Drive \(interim\)/, label: 'Drive interim section' },
  { re: /drive\.google\.com|docs\.google\.com/, label: 'Drive URL in page' },
  { re: /AI-åtgärd startad/, label: 'fake AI toast' },
  { re: /data-patient-name=/, label: 'assets by patient name attr' },
  { re: /Snitt LTV:\s*24\s*800/, label: 'mock Snitt LTV in customers shell' },
  { re: />\s*234\s*VIP</, label: 'mock 234 VIP pill' },
  { re: /87\s+aktiva\s+i\s+maj/, label: 'mock 87 aktiva pill' },
  { re: /Anna Karlsson/, label: 'Anna Karlsson in customers shell' },
  { re: /agg-insight-body/, label: 'mock agg-insight cards in customers shell' },
];

for (const { re, label } of blockedHtml) {
  if (re.test(customersHtml)) fail(`kunder.html customers-shell: ${label}`);
  else pass(`kunder.html customers-shell utan ${label}`);
}

if (html.includes('calendar-shell') && html.includes('data-cco-shell="calendar"')) {
  fail('kunder.html har fortfarande hidden calendar-shell block');
} else {
  pass('kunder.html utan hidden calendar-shell block');
}

const blockedJs = [
  { re: /toast\([^)]*AI-åtgärd/, label: 'fake AI toast in JS' },
  { re: /åtgärd startad/, label: 'fake action toast' },
];

for (const { re, label } of blockedJs) {
  if (re.test(js)) fail(`cco-kunder-real.js: ${label}`);
  else pass(`cco-kunder-real.js utan ${label}`);
}

if (!/data-patient-id/.test(js) && !/dataset\.patientId/.test(js)) {
  fail('cco-kunder-real.js saknar patientId på rader');
} else {
  pass('cco-kunder-real.js använder patientId');
}

if (!/CcoJournalFeed\.mount/.test(js)) {
  fail('cco-kunder-real.js mountar inte journal-feed');
} else {
  pass('cco-kunder-real.js mountar CcoJournalFeed');
}

if (
  !/\/api\/v1\/cco\/patients\/.*patientId/.test(js) &&
  !/encodeURIComponent\(patientId\)/.test(js)
) {
  fail('cco-kunder-real.js assets använder inte patientId i URL');
} else {
  pass('cco-kunder-real.js assets via patientId');
}

if (!/params\.set\('q'/.test(js)) {
  fail('cco-kunder-real.js saknar global sök q=');
} else {
  pass('cco-kunder-real.js global sök via q=');
}

if (!/segmentStats/.test(js) && !/params\.set\('segment'/.test(js)) {
  fail('cco-kunder-real.js saknar segment-filter (P0.3)');
} else {
  pass('cco-kunder-real.js segment-filter P0.3');
}

if (/Snitt LTV|49\s*MSEK|AI-åtgärd|toast\(/.test(js)) {
  fail('cco-kunder-real.js har kvar mock KPI/AI/toast');
} else {
  pass('cco-kunder-real.js utan mock KPI/AI/toast');
}

if (!/Ej kopplat|Kommer i P1/.test(js)) {
  fail('cco-kunder-real.js saknar disabled-action copy');
} else {
  pass('cco-kunder-real.js disabled actions märkta');
}

if (!fs.existsSync(path.join(REPO, 'src/ops/ccoKunderEnrichment.js'))) {
  fail('ccoKunderEnrichment.js saknas');
} else {
  pass('ccoKunderEnrichment.js finns');
}

const staff = fs.readFileSync(path.join(REPO, 'src/routes/ccoStaff.js'), 'utf8');
if (!/segmentStats/.test(staff) || !/buildKunderReadout/.test(staff)) {
  fail('ccoStaff customers-shell saknar P0.3 enrichment');
} else {
  pass('ccoStaff customers-shell P0.3 enrichment');
}

if (!/loadKunderBookingIndex/.test(staff) || !/bookingCoverage/.test(staff)) {
  fail('ccoStaff saknar P0.4 booking enrichment');
} else {
  pass('ccoStaff P0.4 booking enrichment');
}

if (!fs.existsSync(path.join(REPO, 'src/ops/ccoKunderBookingEnrichment.js'))) {
  fail('ccoKunderBookingEnrichment.js saknas');
} else {
  pass('ccoKunderBookingEnrichment.js finns');
}

if (!/hasUpcomingBooking|nextBookingAt|todayVisit/.test(js)) {
  fail('cco-kunder-real.js saknar booking-fält i UI');
} else {
  pass('cco-kunder-real.js booking UI-fält');
}

const actionsSrc = fs.existsSync(ACTIONS_JS) ? fs.readFileSync(ACTIONS_JS, 'utf8') : '';
if (!/Kopplas i Kalender P1/.test(js) && !/Kopplas i Kalender P1/.test(actionsSrc)) {
  fail('saknar disabled copy för boka/omboka (P1.1 action matrix)');
} else {
  pass('boka/omboka disabled korrekt (P1.1)');
}

if (/>\s*\d{2,4}\s*</.test(customersHtml) && /DHI|PRP|Microneedling/.test(customersHtml)) {
  const hardcodedTreatment = />\s*(142|389|234|47|23|12)\s*</.test(customersHtml);
  if (hardcodedTreatment) fail('kunder.html customers-shell har hardcodade behandlingstal');
  else pass('kunder.html utan hardcodade behandlingstal i shell');
} else {
  pass('kunder.html behandlingstal ej hårdkodade (kontroll)');
}

if (/toast\([^)]*bokning|fake.*booking/i.test(js)) {
  fail('cco-kunder-real.js fake booking toast');
} else {
  pass('cco-kunder-real.js utan fake booking toast');
}

if (!/CcoKunderActions/.test(js)) {
  fail('cco-kunder-real.js saknar CcoKunderActions (P1.1)');
} else {
  pass('cco-kunder-real.js använder action matrix P1.1');
}

if (!/assignedOwner|ARCANA_CCO_MINE_OWNER/.test(js)) {
  fail('cco-kunder-real.js saknar Mina kunder assignedOwner (P1.1)');
} else {
  pass('cco-kunder-real.js Mina kunder readiness P1.1');
}

if (!/ownerName|isMinePatient/.test(js)) {
  fail('cco-kunder-real.js saknar owner-rad-badge P1.1');
} else {
  pass('cco-kunder-real.js owner-rad-badge P1.1');
}

if (!/kalender\.html\?patientId=/.test(js) && !fs.existsSync(ACTIONS_JS)) {
  fail('kalender patientId-länk saknas');
} else if (fs.existsSync(ACTIONS_JS)) {
  const actionsJs = fs.readFileSync(ACTIONS_JS, 'utf8');
  if (!/kalender\.html\?patientId=/.test(actionsJs)) {
    fail('cco-kunder-actions.js saknar kalender patientId-länk');
  } else if (/toast\(/.test(actionsJs)) {
    fail('cco-kunder-actions.js har fake toast');
  } else if (!/Kopplas i Kalender P1/.test(actionsJs)) {
    fail('cco-kunder-actions.js saknar disabled boka/omboka');
  } else {
    pass('cco-kunder-actions.js kalender + disabled boka P1.1');
  }
}

const enrich = fs.readFileSync(path.join(REPO, 'src/ops/ccoKunderEnrichment.js'), 'utf8');
if (!/getPatientOwnerName/.test(enrich) || !/Kräver ägare per kund/.test(enrich)) {
  fail('ccoKunderEnrichment saknar mine/owner P1.1');
} else {
  pass('ccoKunderEnrichment mine/owner P1.1');
}

if (!/buildOwnerFieldInventory|mineKunder/.test(enrich)) {
  fail('ccoKunderEnrichment saknar owner field inventory P1.1');
} else {
  pass('ccoKunderEnrichment owner field inventory P1.1');
}

if (
  /Exportera GDPR-paket|Radera kund permanent|MutationObserver.*gdpr|AI-åtgärd startad/.test(
    customersHtml
  ) ||
  /<div class="gdpr-row"/.test(customersHtml)
) {
  fail('kunder.html customers-shell har fake GDPR/toast injection');
} else {
  pass('kunder.html utan fake GDPR toast injection');
}

const actionsSrcFull = fs.existsSync(ACTIONS_JS) ? fs.readFileSync(ACTIONS_JS, 'utf8') : '';
if (!/data-kunder-status/.test(actionsSrcFull) || !/buildDossierBar/.test(actionsSrcFull)) {
  fail('cco-kunder-actions.js saknar full status matrix P1.1');
} else {
  pass('cco-kunder-actions.js full status matrix P1.1');
}

if (!/buildDossierBar/.test(js)) {
  fail('cco-kunder-real.js använder inte dossier action bar');
} else {
  pass('cco-kunder-real.js dossier action bar P1.1');
}

if (!/assignedOwner/.test(staff)) {
  fail('ccoStaff saknar assignedOwner query P1.1');
} else {
  pass('ccoStaff assignedOwner P1.1');
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\n✅ verify-kunder-real-data PASS');
