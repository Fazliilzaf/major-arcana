'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCalendarShell() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/cco-kalender-shell.js'),
    'utf8'
  );
  const sandbox = {
    window: { CCO_CALENDAR_READ_ONLY: true },
    document: { readyState: 'loading', addEventListener() {} },
    console,
    Date,
    Intl,
    Map,
    Set,
    URLSearchParams,
  };
  vm.runInNewContext(`${source}\n;this.exports = window.CcoKalenderShell;`, sandbox);
  return { shell: sandbox.exports, source };
}

function visit(overrides = {}) {
  return {
    id: 'booking-' + Math.random(),
    date: '2026-07-17',
    startsAt: '2026-07-17T08:00:00.000Z',
    endsAt: '2026-07-17T09:00:00.000Z',
    resourceId: 'Wendela',
    serviceLabel: 'PRP',
    status: 'upcoming',
    ...overrides,
  };
}

test('sidebar summary counts tomorrow, week, conflicts and return visits from canonical rows', () => {
  const { shell } = loadCalendarShell();
  const rows = [
    visit({ id: 'a' }),
    visit({
      id: 'b',
      startsAt: '2026-07-17T08:30:00.000Z',
      endsAt: '2026-07-17T09:30:00.000Z',
      serviceLabel: 'Uppföljning',
    }),
    visit({ id: 'cancelled', status: 'cancelled' }),
    visit({ id: 'tomorrow', date: '2026-07-18' }),
    visit({ id: 'monday', date: '2026-07-13' }),
  ];

  assert.deepEqual(
    { ...shell.buildCanonicalSidebarSummary('2026-07-17', rows) },
    { tomorrow: 1, week: 5, conflicts: 2, returnVisits: 1 }
  );
});

test('empty canonical result is zero while incomplete conflict fields are inga data', () => {
  const { shell } = loadCalendarShell();
  assert.deepEqual(
    { ...shell.buildCanonicalSidebarSummary('2026-07-17', []) },
    { tomorrow: 0, week: 0, conflicts: 0, returnVisits: 0 }
  );

  const incomplete = [visit({ id: 'a' }), visit({ id: 'b', resourceId: '_unassigned' })];
  assert.equal(shell.buildCanonicalSidebarSummary('2026-07-17', incomplete).conflicts, null);
});

test('Sunday tomorrow is counted but remains outside the selected canonical week', () => {
  const { shell } = loadCalendarShell();
  const rows = [
    visit({ id: 'sunday', date: '2026-07-19' }),
    visit({ id: 'next-monday', date: '2026-07-20' }),
  ];
  const summary = shell.buildCanonicalSidebarSummary('2026-07-19', rows);
  assert.equal(summary.tomorrow, 1);
  assert.equal(summary.week, 1);
});

test('read-only sidebar refresh reuses the canonical calendar bundle only', () => {
  const { source } = loadCalendarShell();
  const refresh = source.slice(
    source.indexOf('async function refreshCanonicalSidebarSummary'),
    source.indexOf('// ─── Main load')
  );
  assert.match(refresh, /loadCanonicalVisits/);
  assert.doesNotMatch(refresh, /\/api\/v1\/calendar\/week/);
  assert.match(refresh, /inga data/);
});
