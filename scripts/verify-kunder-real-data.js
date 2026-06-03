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

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\n✅ verify-kunder-real-data PASS');
