'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const FORBIDDEN_SUBSTRINGS = [
  '/api/v1/calendar/services',
  '/api/v1/calendar/booking/',
  '/checkin',
  '/no-show',
  '/follow-up',
  '/status-pills',
  '/intelligence',
];

const ALLOWED_ROUTE_PREFIXES = [
  '/api/v1/cco-bookings/calendar-bundle',
  '/api/v1/cco-customers/',
  '/api/v1/cco-booking-engine/availability',
  '/api/v1/cco-booking-engine/create/preflight',
  '/api/v1/cco-booking-engine/create/confirm',
  '/api/v1/cco-booking-engine/catalog',
  '/api/v1/cco-bookings/canonical-integrity',
  '/api/v1/cco-bookings/cliento-unlinked-review',
  '/api/v1/calendar/day',
  '/api/v1/calendar/week',
  '/api/v1/cco-bookings/history-search',
];

function extractFetchTargets(source) {
  const targets = new Set();
  // Matcha fetch('/api/v1/...' + ... eller fetch('/api/v1/...?...'
  const re = /fetch\(\s*['"`](\/api\/v1\/[^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    targets.add(m[1]);
  }
  // Matcha fetch('/api/v1/' + encodeURIComponent(...) + '/...'
  const dynamicRe = /fetch\(\s*['"`](\/api\/v1\/[^'"`]+)['"`]\s*\+/g;
  while ((m = dynamicRe.exec(source)) !== null) {
    targets.add(m[1]);
  }
  return [...targets];
}

function isAllowed(target) {
  for (const prefix of ALLOWED_ROUTE_PREFIXES) {
    if (target.startsWith(prefix)) return true;
  }
  return false;
}

test('cco-kalender-shell anropar inga borttagna/saknade endpoints', async () => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'cco-kalender-shell.js');
  const source = await fs.readFile(filePath, 'utf8');
  const lines = source.split('\n');

  const forbidden = [];
  for (const line of lines) {
    if (!line.includes('fetch(')) continue;
    for (const sub of FORBIDDEN_SUBSTRINGS) {
      if (line.includes(sub)) forbidden.push(`${sub} (rad: ${line.trim()})`);
    }
  }

  assert.deepEqual(
    forbidden,
    [],
    `Hittade anrop till borttagna/saknade endpoints: ${forbidden.join('; ')}`
  );
});

test('cco-kalender-shell anropar bara kanda giltiga endpoints', async () => {
  const filePath = path.join(__dirname, '..', '..', 'public', 'cco-kalender-shell.js');
  const source = await fs.readFile(filePath, 'utf8');
  const targets = extractFetchTargets(source);

  const unknown = targets.filter((t) => !isAllowed(t));

  assert.deepEqual(
    unknown,
    [],
    `Hittade okanda endpoint-anrop som maste granskas: ${unknown.join(', ')}`
  );
});
