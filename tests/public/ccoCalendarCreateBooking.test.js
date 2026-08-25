'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'public/cco-kalender-shell.js'), 'utf8');
const calendarHtml = fs.readFileSync(path.join(root, 'public/kalender.html'), 'utf8');

function loadShell(createEnabled = false) {
  const sandbox = {
    window: {
      CCO_CALENDAR_CREATE_BOOKING_ENABLED: createEnabled,
    },
    document: { readyState: 'loading', addEventListener() {} },
    console,
    Date,
    Intl,
    Map,
    Math,
    Set,
    URLSearchParams,
  };
  vm.runInNewContext(`${source}\n;this.exports = window.CcoKalenderShell;`, sandbox);
  return sandbox.exports;
}

test('create request keeps canonical patient and explicit Stockholm contract', () => {
  const payload = loadShell().createBookingPayload({
    patientId: ' patient-42 ',
    serviceId: 'service-prp',
    resourceId: 'room-2',
    practitionerId: 'provider-egzona',
    startsAt: '2026-07-20T08:00:00.000Z',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    patientId: 'patient-42',
    serviceId: 'service-prp',
    resourceId: 'room-2',
    practitionerId: 'provider-egzona',
    startsAt: '2026-07-20T08:00:00.000Z',
    roomId: '',
    roomLabel: '',
    timeZone: 'Europe/Stockholm',
    identityAmbiguous: false,
    linkAllowed: true,
  });
});

test('controlled UI is default-off and orders preflight before explicit confirm', () => {
  const block = source.slice(
    source.indexOf('async function openCreateBookingDrawer'),
    source.indexOf('// ─── Drawer rendering')
  );

  assert.match(source, /CCO_CALENDAR_CREATE_BOOKING_ENABLED === true/);
  assert.match(block, /\/create\/preflight/);
  assert.match(block, /\/create\/confirm/);
  assert.match(block, /catalog\.serviceVariants/);
  assert.match(block, /serviceVariantLabel/);
  assert.match(block, /parentServiceId/);
  assert.match(block, /srvIds: selectedServiceParentId\(\)/);
  assert.match(block, /serviceId: serviceSelect\.value/);
  assert.ok(block.indexOf('/create/preflight') < block.indexOf('/create/confirm'));
  assert.ok(
    block.indexOf('renderCreateServerPreflight') < block.indexOf('Bekräfta och skapa bokning')
  );
  assert.match(block, /confirmInput\.value !== 'SKAPA BOKNING'/);
  assert.match(block, /'x-idempotency-key': idempotencyKey/g);
  assert.doesNotMatch(block, /\/cancel|\/rebook|drag|voice|bulk/i);
  assert.doesNotMatch(block, /patientId[^\n]+type:\s*'text'/);
  assert.equal(typeof loadShell(false).openCreateBookingDrawer, 'function');
});

test('active calendar catalog/preflight headers reuse shared admin auth helper first', () => {
  const instrumented = source.replace(
    'createBookingPayload, openCreateBookingDrawer,\n  };',
    'createBookingPayload, openCreateBookingDrawer,\n    __testCalendarHeaders: calendarHeaders,\n  };'
  );
  const calls = [];
  const sandbox = {
    window: {
      CCO_CALENDAR_CREATE_BOOKING_ENABLED: true,
      ArcanaReviewAuth: {
        authHeaders(headers) {
          calls.push({ ...headers });
          return { ...headers, Authorization: 'Bearer verified-helper-token' };
        },
      },
      localStorage: {
        getItem(key) {
          return key === 'ARCANA_ADMIN_TOKEN' ? 'stale-storage-token' : '';
        },
      },
      sessionStorage: { getItem: () => '' },
    },
    document: { readyState: 'loading', addEventListener() {} },
    console,
    Date,
    Intl,
    Map,
    Math,
    Set,
    URLSearchParams,
  };
  vm.runInNewContext(`${instrumented}\n;this.exports = window.CcoKalenderShell;`, sandbox);

  const headers = sandbox.exports.__testCalendarHeaders({ json: true });

  assert.equal(headers.Authorization, 'Bearer verified-helper-token');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.deepEqual(calls, [{ 'Content-Type': 'application/json' }]);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9._-]{16,}/);
});

test('kalender.html loads the shared auth helper before the active calendar shell', () => {
  assert.match(calendarHtml, /<script src="\/cco-review-auth\.js\?v=20260720a" defer><\/script>/);
  assert.ok(
    calendarHtml.indexOf('/cco-review-auth.js') < calendarHtml.indexOf('/cco-kalender-shell.js'),
    'auth-helper måste laddas före shellen så calendarHeaders kan återanvända den'
  );
});

test('kalender.html enables create booking in the active calendar', () => {
  assert.match(calendarHtml, /window\.CCO_CALENDAR_CREATE_BOOKING_ENABLED\s*=\s*true/);
});

test('create drawer fails closed for missing or ambiguous canonical patient', async () => {
  const shell = loadShell(true);
  await assert.doesNotReject(shell.openCreateBookingDrawer({ patientId: '' }));
  await assert.doesNotReject(
    shell.openCreateBookingDrawer({
      patientId: 'patient-42',
      identityAmbiguous: true,
    })
  );
});
