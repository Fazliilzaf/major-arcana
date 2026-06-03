#!/usr/bin/env node
'use strict';

/**
 * P0.5 Mobil Kunder gate: /m-kunder.html must not ship mock population.
 *   node scripts/verify-mobile-kunder-real-data.js
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const MOBILE_HTML = path.join(REPO, 'public/m-kunder.html');
const MOBILE_JS = path.join(REPO, 'public/cco-kunder-mobil-real.js');
const ACTIONS_JS = path.join(REPO, 'public/cco-kunder-actions.js');
const STAFF_OWNER_JS = path.join(REPO, 'public/cco-kunder-staff-owner.js');
const DESKTOP_JS = path.join(REPO, 'public/cco-kunder-real.js');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

if (!fs.existsSync(MOBILE_HTML)) {
  fail('public/m-kunder.html saknas');
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

if (!fs.existsSync(MOBILE_JS)) {
  fail('public/cco-kunder-mobil-real.js saknas');
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

const html = fs.readFileSync(MOBILE_HTML, 'utf8');
const js = fs.readFileSync(MOBILE_JS, 'utf8');

if (!html.includes('cco-kunder-mobil-real.js')) {
  fail('m-kunder.html inkluderar inte cco-kunder-mobil-real.js');
} else {
  pass('m-kunder.html laddar cco-kunder-mobil-real.js');
}

if (!html.includes('cco-kunder-actions.js')) {
  fail('m-kunder.html inkluderar inte cco-kunder-actions.js (P1.1)');
} else {
  pass('m-kunder.html laddar cco-kunder-actions.js');
}

if (!html.includes('cco-kunder-smart-next-step.js')) {
  fail('m-kunder.html inkluderar inte cco-kunder-smart-next-step.js (ORD-3)');
} else {
  pass('m-kunder.html laddar cco-kunder-smart-next-step.js');
}

if (!js.includes('includeAutomation')) {
  fail('cco-kunder-mobil-real.js saknar includeAutomation (ORD-3)');
} else {
  pass('mobil includeAutomation=1');
}

if (!html.includes('cco-kunder-staff-owner.js')) {
  fail('m-kunder.html inkluderar inte cco-kunder-staff-owner.js (P1.2)');
} else if (!fs.existsSync(STAFF_OWNER_JS)) {
  fail('cco-kunder-staff-owner.js saknas på disk (P1.2)');
} else {
  pass('m-kunder.html laddar cco-kunder-staff-owner.js');
}

if (!html.includes('cco-journal-feed.js')) {
  fail('m-kunder.html saknar cco-journal-feed.js');
} else {
  pass('m-kunder.html laddar journal-feed');
}

if (!html.includes('data-cco-surface="mobile-kunder"')) {
  fail('m-kunder.html saknar data-cco-surface mobile-kunder');
} else {
  pass('m-kunder.html markerad som mobile-kunder surface');
}

if (!js.includes('cco/staff/customers-shell')) {
  fail('cco-kunder-mobil-real.js saknar customers-shell API');
} else {
  pass('cco-kunder-mobil-real.js kopplad till customers-shell');
}

if (!js.includes('handlesMobileCustomers')) {
  fail('cco-kunder-mobil-real.js saknar handlesMobileCustomers marker');
} else {
  pass('cco-kunder-mobil-real.js handlesMobileCustomers');
}

const blockedHtml = [
  { re: /\bCUSTOMER_ROWS\b/, label: 'CUSTOMER_ROWS array' },
  { re: /\bconst CUSTOMERS\b/, label: 'CUSTOMERS mock search array' },
  { re: /\bDOSSIER_DATA\b/, label: 'DOSSIER_DATA mock' },
  { re: /1\s*247/, label: 'mock count 1247' },
  { re: /49\s*MSEK/, label: 'mock revenue 49 MSEK' },
  { re: /485\s*200\s*kr/, label: 'mock weekly revenue' },
  { re: /renderDriveSection/, label: 'Drive link builder' },
  { re: /drive\.google\.com|docs\.google\.com/, label: 'Drive URL in page' },
  { re: /AI-åtgärd startad/, label: 'fake AI toast' },
  { re: /data-patient-name=/, label: 'assets by patient name attr' },
  { re: /Anna Karlsson/, label: 'Anna Karlsson runtime mock' },
  { re: /Snitt LTV:\s*24\s*800/, label: 'mock Snitt LTV' },
];

for (const { re, label } of blockedHtml) {
  if (re.test(html)) fail(`m-kunder.html: ${label}`);
  else pass(`m-kunder.html utan ${label}`);
}

const blockedJs = [
  { re: /toast\([^)]*AI-åtgärd/, label: 'fake AI toast in JS' },
  { re: /åtgärd startad/, label: 'fake action toast' },
  { re: /1\s*247/, label: 'mock count 1247' },
  { re: /49\s*MSEK/, label: 'mock revenue 49 MSEK' },
  { re: /Anna Karlsson/, label: 'Anna Karlsson mock' },
  { re: /drive\.google\.com|docs\.google\.com/, label: 'Drive URL in JS' },
  { re: /data-patient-name/, label: 'assets by name' },
  { re: /Snitt LTV|485\s*200/, label: 'mock KPI' },
];

for (const { re, label } of blockedJs) {
  if (re.test(js)) fail(`cco-kunder-mobil-real.js: ${label}`);
  else pass(`cco-kunder-mobil-real.js utan ${label}`);
}

if (!/data-patient-id|dataset\.patientId/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar patientId på rader');
} else {
  pass('cco-kunder-mobil-real.js använder patientId på rader');
}

if (!/openDossier/.test(js) || !/card\.patientId/.test(js)) {
  fail('cco-kunder-mobil-real.js dossier utan patientId-guard');
} else {
  pass('cco-kunder-mobil-real.js dossier kräver patientId');
}

if (!/CcoJournalFeed\.mount/.test(js)) {
  fail('cco-kunder-mobil-real.js mountar inte journal-feed');
} else {
  pass('cco-kunder-mobil-real.js mountar CcoJournalFeed');
}

if (!/encodeURIComponent\(card\.patientId\)|encodeURIComponent\(patientId\)/.test(js)) {
  fail('cco-kunder-mobil-real.js assets använder inte patientId i URL');
} else {
  pass('cco-kunder-mobil-real.js assets via patientId');
}

if (!/params\.set\('q'/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar global sök q=');
} else {
  pass('cco-kunder-mobil-real.js global sök via q=');
}

if (/filter\s*\(\s*\)\s*=>\s*.*currentPage|onlyCurrentPage|slice\(0,\s*visible/i.test(js)) {
  fail('cco-kunder-mobil-real.js söker bara aktuell sida');
} else {
  pass('cco-kunder-mobil-real.js söker inte bara aktuell sida');
}

if (!/segmentStats/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar segmentStats');
} else {
  pass('cco-kunder-mobil-real.js segmentStats');
}

const requiredChips = [
  'all',
  'mine',
  'needs_review',
  'today_visits',
  'this_week',
  'waitlist',
  'treatment_fue',
  'treatment_dhi',
  'treatment_prp',
  'treatment_microneedling',
  'treatment_consultation',
  'treatment_followup',
  'treatment_curatiio',
  'missing_journal',
  'missing_health_declaration',
  'missing_encounter',
  'photos_review',
  'getaccept',
  'halso',
  'has_drive_journal',
  'has_drive_document',
];

for (const id of requiredChips) {
  if (!js.includes(`'${id}'`) && !js.includes(`"${id}"`)) {
    fail(`cco-kunder-mobil-real.js saknar segment ${id}`);
  } else {
    pass(`cco-kunder-mobil-real.js segment ${id}`);
  }
}

const actionsSrc = fs.existsSync(ACTIONS_JS) ? fs.readFileSync(ACTIONS_JS, 'utf8') : '';
if (
  !/Kopplas i Kalender P1|Kommer i P1/.test(js) &&
  !/Kopplas i Kalender P1|Kommer i P1/.test(actionsSrc)
) {
  fail('mobil saknar disabled-action copy (P1.1 matrix)');
} else {
  pass('mobil disabled actions märkta (P1.1)');
}

if (!/mkLoadMore|Ladda fler/.test(js) && !html.includes('mkLoadMore')) {
  fail('mobil saknar Ladda fler paginering');
} else {
  pass('mobil har Ladda fler');
}

if (!/hasUpcomingBooking|todayVisit|nextBookingAt/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar booking-fält');
} else {
  pass('cco-kunder-mobil-real.js booking UI-fält');
}

if (!/CcoKunderActions/.test(js) || !/buildDossierBar/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar CcoKunderActions dossier bar (P1.1)');
} else {
  pass('cco-kunder-mobil-real.js action matrix P1.1');
}

if (!/data-kunder-status/.test(actionsSrc)) {
  fail('cco-kunder-actions.js saknar data-kunder-status attribut');
} else {
  pass('cco-kunder-actions.js action status attribut');
}

if (!/treatment_fue|treatment_curatiio/.test(js)) {
  fail('mobil saknar behandlingssegment P1.1');
} else {
  pass('mobil behandlingssegment parity P1.1');
}

if (!/CcoKunderStaffOwner|staffOwnership|auth\/me/.test(js)) {
  fail('mobil saknar auto staff owner P1.2');
} else {
  pass('mobil auto staff owner P1.2');
}

if (fs.existsSync(ACTIONS_JS) && fs.existsSync(DESKTOP_JS)) {
  const actions = fs.readFileSync(ACTIONS_JS, 'utf8');
  const labels = ['Journal', 'Timeline', 'Kalender', 'Formulär', 'Avtal', 'Foto', 'Boka', 'Omboka'];
  for (const label of labels) {
    if (!actions.includes(label)) {
      fail(`cco-kunder-actions.js saknar gemensamt label: ${label}`);
    }
  }
  if (!failed) pass('desktop/mobil delar action labels (P1.2)');
}

const treatmentIds = [
  'treatment_fue',
  'treatment_dhi',
  'treatment_prp',
  'treatment_microneedling',
  'treatment_consultation',
  'treatment_followup',
  'treatment_curatiio',
];
let treatmentInChips = true;
for (const tid of treatmentIds) {
  if (!js.includes(`'${tid}'`)) treatmentInChips = false;
}
if (!treatmentInChips) {
  fail('mobil MOBILE_CHIP_IDS saknar alla behandlingssegment');
} else {
  pass('mobil alla behandlingssegment i chips');
}

if (/\.pdf|\.heic|\.docx/.test(js) && /displayName\(/.test(js)) {
  pass('cco-kunder-mobil-real.js filtrerar tekniska filnamn i displayName');
} else if (!/displayName/.test(js)) {
  fail('cco-kunder-mobil-real.js saknar displayName sanering');
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

if (fs.existsSync(DESKTOP_JS)) {
  const desktop = fs.readFileSync(DESKTOP_JS, 'utf8');
  if (desktop.includes('customers-shell') && js.includes('customers-shell')) {
    pass('mobil och desktop delar customers-shell API');
  }
}

console.log('\n✅ verify-mobile-kunder-real-data PASS');
