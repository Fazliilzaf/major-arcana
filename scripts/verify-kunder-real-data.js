#!/usr/bin/env node
'use strict';

/**
 * P0.1 gate: /kunder.html must not ship mock population or static CUSTOMER_ROWS.
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

const blocked = [
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
];

for (const { re, label } of blocked) {
  if (re.test(html)) fail(`kunder.html innehåller ${label}`);
  else pass(`kunder.html utan ${label}`);
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

if (/Anna Karlsson/.test(html) && /name:\s*'Anna Karlsson'/.test(html)) {
  fail('kunder.html har fortfarande statisk Anna Karlsson mock-rad');
} else {
  pass('ingen statisk CUSTOMER_ROWS Anna Karlsson');
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\n✅ verify-kunder-real-data PASS');
