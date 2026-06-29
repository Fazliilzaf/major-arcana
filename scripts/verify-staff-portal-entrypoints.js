#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: saknar ${needle}`);
  }
  pass(label);
}

function assertNotIncludes(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: får inte innehålla ${needle}`);
  }
  pass(label);
}

function main() {
  const ccoDemo = read('public/cco-demo.html');
  const admin = read('public/admin.html');
  const router = read('src/routes/staffPortal.js');

  assertIncludes(ccoDemo, 'href="/staff-portal"', 'CCO demo länkar till personalportalen');
  assertIncludes(ccoDemo, 'Personalportal</h2>', 'CCO demo visar Personalportal-kort');
  assertIncludes(ccoDemo, 'data-kind="staff"', 'CCO demo har staff-kortstil');

  assertIncludes(admin, 'id="staffPortalHeaderLink"', 'Admin har header-länk');
  assertIncludes(admin, 'href="/staff-portal"', 'Admin länkar till personalportalen');
  assertIncludes(admin, 'Öppna personalportal', 'Mobil adminbanner pekar mot personalportal');
  assertNotIncludes(
    admin,
    'id="mobileStaffJournalLink" class="btn primary" href="/staff?view=customers"',
    'Mobil adminbanner använder inte gamla staff-kundvy-länken'
  );

  assertIncludes(router, "router.get('/staff-portal'", 'Staff portal route finns');
  assertIncludes(router, 'public/staff-portal.html', 'Staff portal route serverar rätt HTML');
}

try {
  main();
} catch (err) {
  console.error(`FAIL staff portal entrypoints: ${err.message || err}`);
  process.exit(1);
}
