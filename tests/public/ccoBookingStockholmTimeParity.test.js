'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

function loadBrowserModule(relativePath, exportName) {
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
  const sandbox = { window: {}, console, Date, Intl, setTimeout, clearTimeout };
  vm.runInNewContext(`${source}\n;this.result = window.${exportName};`, sandbox);
  return sandbox.result;
}

const parity = loadBrowserModule(
  'public/major-arcana-preview/app/cco-v9-customers-parity.js',
  'CcoV9CustomersParity'
);
const adapters = loadBrowserModule(
  'public/major-arcana-preview/app/cco-v11-rail-adapters.js',
  'CcoV11RailAdapters'
);
const railSource = fs.readFileSync(
  path.resolve(__dirname, '../..', 'public/major-arcana-preview/app/cco-v11-rk.js'),
  'utf8'
);
const patientMasterSource = fs.readFileSync(
  path.resolve(__dirname, '../..', 'public/major-arcana-preview/app/patient-master-ui.js'),
  'utf8'
);

function loadV12RailClickInference() {
  const functionSource = patientMasterSource.match(
    /function inferV12ModuleFromRailClick\(target\) \{[\s\S]*?\n  \}(?=\n\n  function scrollV12WorkspaceModule)/
  );
  assert.ok(functionSource, 'V11/V12 handoff inference should remain discoverable');
  const sandbox = {
    usesV12Workspace: () => true,
    V12_RAIL_SECTION_MODULES: { upcoming: 'booking' },
    V12_RAIL_CLASS_MODULES: [],
  };
  vm.runInNewContext(`${functionSource[0]}\nthis.infer = inferV12ModuleFromRailClick;`, sandbox);
  return sandbox.infer;
}

test('Kalender och Kunder/V11/V12 visar samma Europe/Stockholm-tid', () => {
  const startsAt = '2026-07-17T10:00:00.000Z';
  const parityRow = parity.buildUpcomingBookings(
    { hasUpcomingBooking: true, nextBookingAt: startsAt, nextBookingType: 'PRP' },
    []
  )[0];
  const dossierRow = adapters.buildBookingsFromExtras(
    { patientId: 'patient-canonical', upcomingBookings: [{ startsAt, title: 'PRP' }] },
    {},
    {},
    []
  ).items[0];

  assert.equal(parityRow.whenLong, '17 jul');
  assert.equal(parityRow.whenShort, 'Fre 12:00');
  assert.equal(dossierRow.whenLong, '17 jul');
  assert.equal(dossierRow.whenShort, 'fre 12:00');
});

test('canonical timestamp vinner över en förformaterad UTC-etikett', () => {
  const row = adapters.buildBookingsFromExtras(
    {
      patientId: 'patient-canonical',
      upcomingBookings: [
        {
          startsAt: '2026-07-17T10:00:00.000Z',
          whenLong: '17 jul',
          whenShort: 'fre 10:00',
          title: 'PRP',
        },
      ],
    },
    {},
    {},
    []
  ).items[0];

  assert.equal(row.whenShort, 'fre 12:00');
});

test('Stockholm-datum används när UTC-tiden passerar lokal midnatt', () => {
  const startsAt = '2026-07-17T23:30:00.000Z';
  const parityRow = parity.buildUpcomingBookings(
    { hasUpcomingBooking: true, nextBookingAt: startsAt, nextBookingType: 'PRP' },
    []
  )[0];
  const dossierRow = adapters.buildBookingsFromExtras(
    { patientId: 'patient-canonical', upcomingBookings: [{ startsAt, title: 'PRP' }] },
    {},
    {},
    []
  ).items[0];

  assert.equal(parityRow.whenLong, '18 jul');
  assert.equal(parityRow.whenShort, 'Lör 01:30');
  assert.equal(dossierRow.whenLong, '18 jul');
  assert.equal(dossierRow.whenShort, 'lör 01:30');
});

test('patienthistoriken behåller canonical displayName och bookingId för audit', () => {
  const startsAt = '2026-07-25T10:00:00.000Z';
  const card = {
    patientId: 'cco-active-visit-uat-20260713',
    hasUpcomingBooking: true,
    nextBookingAt: startsAt,
    nextBookingType: 'Konsultation',
    upcomingBookings: [
      {
        bookingId: 'da2d26af-7c5b-4249-ac63-623d1f1464f4',
        patientId: 'cco-active-visit-uat-20260713',
        startsAt,
        serviceId: 'consultation-physical',
        serviceDisplayName: 'Fysisk konsultation',
        resourceLabel: 'Fazli Krasniqi',
        status: 'confirmed',
        source: 'cco_booking_engine',
      },
    ],
  };

  const parityRow = parity.buildUpcomingBookings(card, [])[0];
  const dossierRow = adapters.buildBookingsFromExtras(card, {}, {}, []).items[0];
  assert.equal(parityRow.title, 'Fysisk konsultation');
  assert.equal(dossierRow.title, 'Fysisk konsultation');
  assert.equal(dossierRow.bookingId, 'da2d26af-7c5b-4249-ac63-623d1f1464f4');
  assert.equal(dossierRow.patientId, 'cco-active-visit-uat-20260713');
  assert.equal(dossierRow.auditAvailable, true);
});

test('V11 audit-readout är strikt GET/read-only och visar create-livscykeln', () => {
  assert.match(railSource, /data-v11-booking-audit/);
  assert.match(railSource, /\/api\/v1\/cco-audit\/booking\//);
  assert.match(railSource, /method:\s*'GET'/);
  assert.match(railSource, /payload\.readOnly !== true \|\| payload\.zeroWrites !== true/);
  assert.match(railSource, /create-händelser/);
  assert.doesNotMatch(railSource, /cco-booking-engine\/create\/(?:preflight|confirm)/);
});

test('Visa audit öppnar readout utan att trigga V11/V12-handoff eller rerender', async () => {
  const { window } = parseHTML('<html><body><div id="mount"></div></body></html>');
  const requests = [];
  window.localStorage = {
    getItem(key) {
      return key === 'ARCANA_ADMIN_TOKEN' ? 'verified-owner-token' : '';
    },
  };
  window.sessionStorage = { getItem: () => '' };
  window.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          readOnly: true,
          zeroWrites: true,
          items: [
            { action: 'bookings.create_requested', occurredAt: '2026-07-17T10:00:00.000Z' },
            { action: 'bookings.create_committed', occurredAt: '2026-07-17T10:00:01.000Z' },
          ],
        };
      },
    };
  };

  vm.runInNewContext(railSource, {
    window,
    console,
    Date,
    Intl,
    Promise,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
  });

  const mount = window.document.getElementById('mount');
  mount.innerHTML = `
    <div data-v9-section-link="upcoming">
      <details data-v11-booking-audit
        data-booking-id="booking-uat"
        data-patient-id="patient-uat">
        <summary>Visa audit</summary>
        <div data-v11-booking-audit-readout>Read-only</div>
      </details>
    </div>`;
  await Promise.resolve();

  const section = mount.querySelector('[data-v9-section-link]');
  const details = mount.querySelector('[data-v11-booking-audit]');
  const summary = details.querySelector('summary');
  let handoffCount = 0;
  let rerenderCount = 0;
  section.addEventListener('click', () => {
    handoffCount += 1;
    rerenderCount += 1;
  });
  // linkedom saknar webbläsarens inbyggda details-toggle. Simulera endast
  // standardbeteendet; produktens stopPropagation-handler testas oförändrad.
  summary.addEventListener('click', () => {
    details.open = true;
    details.dispatchEvent(new window.Event('toggle', { bubbles: true }));
  });

  summary.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(details.open, true);
  assert.equal(handoffCount, 0);
  assert.equal(rerenderCount, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer verified-owner-token');
  assert.equal('x-tenant-id' in requests[0].options.headers, false);
  assert.match(requests[0].url, /\/api\/v1\/cco-audit\/booking\/booking-uat/);
  assert.match(details.textContent, /bookings\.create_requested/);
  assert.match(details.textContent, /bookings\.create_committed/);
});

test('capture-handoff ignorerar auditkontrollen men behåller vanliga bokningsradsklick', () => {
  const { window } = parseHTML('<html><body><div id="rail"></div></body></html>');
  const inferV12ModuleFromRailClick = loadV12RailClickInference();
  const rail = window.document.getElementById('rail');
  rail.innerHTML = `
    <div data-v9-section-link="upcoming">
      <button type="button" data-booking-row>Vanlig bokningsrad</button>
      <details data-v11-booking-audit>
        <summary>Visa audit</summary>
        <div data-v11-booking-audit-readout>Read-only</div>
      </details>
    </div>`;

  const handoffs = [];
  rail.addEventListener(
    'click',
    (event) => {
      const moduleName = inferV12ModuleFromRailClick(event.target);
      if (!moduleName) return;
      event.preventDefault();
      event.stopPropagation();
      handoffs.push(moduleName);
    },
    true
  );

  const details = rail.querySelector('[data-v11-booking-audit]');
  details.addEventListener('click', (event) => event.stopPropagation());
  const summary = details.querySelector('summary');
  summary.addEventListener('click', () => {
    details.open = true;
  });

  summary.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.equal(details.open, true);
  assert.deepEqual(handoffs, []);

  rail
    .querySelector('[data-booking-row]')
    .dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  assert.deepEqual(handoffs, ['booking']);
});
