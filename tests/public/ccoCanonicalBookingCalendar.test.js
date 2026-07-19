'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCalendarShared() {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/booking-calendar-shared.js'),
    'utf8'
  );
  const sandbox = { window: {}, console, Date, Intl, Map, Set, URLSearchParams };
  vm.runInNewContext(`${source}\n;this.exports = window.ArcanaBookingCalendarShared;`, sandbox);
  return sandbox.exports;
}

function loadCustomerSurfaces() {
  const sandbox = { window: {}, console, Date, Intl, Map, Set, URLSearchParams };
  ['cco-v11-rail-adapters.js', 'cco-v11-rail.js', 'cco-v12-workspace.js'].forEach((file) =>
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../../public/major-arcana-preview/app', file), 'utf8'),
      sandbox
    )
  );
  return sandbox.window;
}

test('Kalender consumes canonical visit rows with patient, status, encounter and notes', () => {
  const calendar = loadCalendarShared();
  const visit = {
    id: 'booking-1',
    patientId: 'patient-canonical',
    patientName: 'Canonical Patient',
    encounterId: 'encounter-canonical',
    startsAt: '2026-05-20T09:00:00.000Z',
    endsAt: '2026-05-20T09:30:00.000Z',
    serviceName: 'PRP',
    resourceLabel: 'Egzona',
    status: 'no_show',
    bookingNotes: 'Bokningsanteckning',
    internalNotes: 'Intern anteckning',
    treatmentNotes: 'Behandlingsanteckning',
  };
  const result = calendar.mergeCalendarEvents([], [], [visit], [], '2026-05-20', '2026-05-20');
  assert.equal(result.bookedEvents.length, 1);
  const event = result.bookedEvents[0];
  assert.equal(event.patientId, 'patient-canonical');
  assert.equal(event.encounterId, 'encounter-canonical');
  assert.equal(event.status, 'Utebliven');
  assert.equal(event.bookingNotes, 'Bokningsanteckning');
  assert.equal(event.internalNotes, 'Intern anteckning');
  assert.equal(event.treatmentNotes, 'Behandlingsanteckning');
});

test('calendar V8 sends a strict parent message for the canonical V11/V12 patient', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-calendar-v8-shell.js'),
    'utf8'
  );
  assert.match(source, /data-v8-patient-id/);
  assert.match(source, /window\.parent\.postMessage\(/);
  assert.match(source, /type: 'arcana:cco-open-customer-dossier', patientId: id/);
  assert.match(source, /window\.location\.origin/);
  assert.doesNotMatch(source, /patientLink\.href\s*=\s*['"]\/staff/);
  assert.match(source, /Öppna kund i V11\/V12/);
  assert.match(source, /data-v8-notes/);
});

test('calendar V8 global search reads paginated canonical history instead of demo customers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-calendar-v8-shell.js'),
    'utf8'
  );
  assert.match(source, /\/api\/v1\/cco-bookings\/history-search/);
  assert.match(source, /Skriv minst 2 tecken för att söka i hela bokningshistoriken/);
  assert.match(source, /includeSeparate: 'true'/);
  assert.match(source, /ArcanaReviewAuth/);
  assert.match(source, /getItem\('ARCANA_ADMIN_TOKEN'\)/);
  assert.match(source, /headers\.Authorization = 'Bearer ' \+ token/);
  assert.match(source, /openCanonicalPatientInAdmin\(result\.dataset\.patientId\)/);
  assert.match(source, /Senaste canonical historik · read-only/);
  assert.doesNotMatch(source, /1 247 kunder totalt/);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9._-]{16,}/);
});

test('calendar V8 history search reuses runtime auth without exposing a hardcoded secret', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-calendar-v8-shell.js'),
    'utf8'
  );
  const instrumented = source.replace(
    'window.ArcanaCalendarV8 = { render: render };',
    'window.ArcanaCalendarV8 = { render: render, __testHistorySearchHeaders: historySearchHeaders };'
  );
  const sandbox = {
    window: {
      ArcanaReviewAuth: {
        getToken() {
          return 'verified-helper-token';
        },
      },
      localStorage: {
        getItem(key) {
          return key === 'ARCANA_ADMIN_TOKEN' ? 'stale-storage-token' : '';
        },
      },
      sessionStorage: { getItem: () => '' },
      addEventListener() {},
      innerWidth: 1200,
    },
    document: {
      readyState: 'loading',
      documentElement: { getAttribute: () => null },
      addEventListener() {},
      querySelector: () => null,
    },
    console,
  };
  vm.runInNewContext(instrumented, sandbox);
  const headers = sandbox.window.ArcanaCalendarV8.__testHistorySearchHeaders();
  assert.equal(headers.Accept, 'application/json');
  assert.equal(headers.Authorization, 'Bearer verified-helper-token');
  assert.equal(Object.keys(headers).length, 2);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9._-]{16,}/);
});

test('calendar V8 canonical handoff accepts only canonical patients and unlinked rows remain inert', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-calendar-v8-shell.js'),
    'utf8'
  );
  const instrumented = source.replace(
    'window.ArcanaCalendarV8 = { render: render };',
    'window.ArcanaCalendarV8 = { render: render, __testOpenCanonicalPatientInAdmin: openCanonicalPatientInAdmin };'
  );
  const messages = [];
  const sandbox = {
    window: {
      parent: {
        postMessage(payload, targetOrigin) {
          messages.push({ payload, targetOrigin });
        },
      },
      location: { origin: 'https://arcana.example' },
      addEventListener() {},
      innerWidth: 1200,
    },
    document: {
      readyState: 'loading',
      documentElement: { getAttribute: () => null },
      addEventListener() {},
      querySelector: () => null,
    },
    console,
  };
  vm.runInNewContext(instrumented, sandbox);
  const openCanonicalPatient = sandbox.window.ArcanaCalendarV8.__testOpenCanonicalPatientInAdmin;
  assert.equal(openCanonicalPatient('patient-canonical'), true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].targetOrigin, 'https://arcana.example');
  assert.equal(messages[0].payload.type, 'arcana:cco-open-customer-dossier');
  assert.equal(messages[0].payload.patientId, 'patient-canonical');

  assert.equal(openCanonicalPatient(''), false);
  assert.equal(openCanonicalPatient(null), false);
  assert.equal(openCanonicalPatient('../not-canonical'), false);
  assert.equal(messages.length, 1);

  assert.match(source, /const locked = row\.linkAllowed === false \|\| !row\.patientId/);
  assert.match(source, /data-read-only/);
  assert.match(source, /if \(result\.dataset\.patientId\)/);
  assert.match(source, /if \(result\.dataset\.readOnly === '1'\) return/);
});

test('active admin calendar uses canonical bundle and the same strict patient handoff', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/cco-kalender-shell.js'),
    'utf8'
  );
  assert.match(source, /\/api\/v1\/cco-bookings\/calendar-bundle/);
  assert.match(source, /type: 'arcana:cco-open-customer-dossier', patientId/);
  assert.match(source, /window\.location\.origin/);
  assert.match(source, /dataSet|dataset/);
  assert.match(source, /patientId: canonicalPatientId/);
  assert.match(source, /bookingId,/);
  assert.match(source, /readOnly: canonicalPatientId \? '0' : '1'/);
  assert.match(source, /if \(canonicalPatientId\) openCanonicalPatient\(canonicalPatientId\)/);
  assert.match(source, /Skriv minst 2 tecken för att söka i canonical bokningshistorik/);
  assert.match(source, /bookingNotes/);
  assert.match(source, /internalNotes/);
  assert.match(source, /treatmentNotes/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*['"]\/staff/);
});

test('active day and week cards expose canonical treatment and note indicators', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/cco-kalender-shell.js'),
    'utf8'
  );
  const dayRenderer = source.slice(
    source.indexOf('const renderResourceCol'),
    source.indexOf('// ─── Booking click')
  );
  const weekRenderer = source.slice(
    source.indexOf('function renderWeekGrid'),
    source.indexOf('async function loadWeek')
  );
  for (const renderer of [dayRenderer, weekRenderer]) {
    assert.match(renderer, /slot\.serviceLabel \|\| slot\.serviceId/);
    assert.match(renderer, /bookingNoteIndicator\(slot\)/);
    assert.match(renderer, /statusLabel\(slot\.status\)/);
    assert.match(renderer, /onBookingClick/);
  }
});

test('complete V11 rail consumes canonical booking adapters instead of raw UTC labels', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rk.js'),
    'utf8'
  );
  const calls = [];
  const sandbox = {
    window: {
      CcoV11RailAdapters: {
        buildBookingsFromExtras() {
          calls.push('upcoming');
          return {
            items: [
              {
                whenLong: '17 jul',
                whenShort: 'fre 12:00',
                title: 'PRP',
                sub: 'Wendela',
                state: 'upcoming',
                stateLabel: 'Bokad',
                notes: [{ label: 'Intern anteckning', text: 'Ring före besöket' }],
              },
            ],
          };
        },
        buildHistoryFromExtras() {
          calls.push('history');
          return {
            items: [
              {
                whenLong: '16 jul',
                whenShort: 'tors 12:00',
                title: 'PRP',
                state: 'no_show',
                stateLabel: 'Utebliven',
                notes: [{ label: 'Behandlingsanteckning', text: 'Ingen behandling' }],
              },
            ],
          };
        },
      },
    },
    console,
  };
  vm.runInNewContext(`${source}\n;this.renderer = window.CcoV11RailKomplett;`, sandbox);
  const html = sandbox.renderer.render({ card: { displayName: 'Canonical Patient' } });
  assert.deepEqual(calls, ['upcoming', 'history']);
  assert.match(html, /fre 12:00/);
  assert.match(html, /Intern anteckning:<\/strong> Ring före besöket/);
  assert.match(html, /Utebliven/);
  assert.match(html, /Behandlingsanteckning:<\/strong> Ingen behandling/);
  assert.doesNotMatch(html, /fre 10:00/);
});

test('canonical status and notes parity matrix is identical in Kalender, V11 and V12', () => {
  const calendar = loadCalendarShared();
  const surfaces = loadCustomerSurfaces();
  const matrix = [
    ['confirmed', 'Bokad'],
    ['completed', 'Genomförd'],
    ['cancelled', 'Avbokad'],
    ['no_show', 'Utebliven'],
  ];
  const visits = matrix.map(([status], index) => ({
    id: `booking-${status}`,
    patientId: 'patient-canonical',
    patientName: 'Canonical Patient',
    encounterId: `encounter-${status}`,
    startsAt: `2026-05-20T${String(8 + index).padStart(2, '0')}:00:00.000Z`,
    endsAt: `2026-05-20T${String(8 + index).padStart(2, '0')}:30:00.000Z`,
    serviceName: 'PRP',
    status,
    bookingNotes: `booking-note-${status}`,
    customerMessage: `customer-message-${status}`,
    internalNotes: `internal-note-${status}`,
    treatmentNotes: `treatment-note-${status}`,
  }));
  const calendarResult = calendar.mergeCalendarEvents(
    [],
    [],
    visits,
    [],
    '2026-05-20',
    '2026-05-20'
  );
  const dossierBundle = {
    visitSegments: visits.map((booking) => ({
      date: '2026-05-20',
      encounterId: booking.encounterId,
      booking,
    })),
  };
  const history = surfaces.CcoV11RailAdapters.buildHistoryFromExtras(
    { id: 'patient-canonical' },
    {},
    dossierBundle,
    []
  );
  const v11 = surfaces.CcoV11Rail.renderHistory(history);
  const v12 = surfaces.CcoV12Workspace.render({
    card: { id: 'patient-canonical' },
    bcard: {},
    dossierBundle,
    occasionTimeline: [],
    journalEntries: [],
    driveFiles: [],
  });

  matrix.forEach(([status, label]) => {
    const event = calendarResult.bookedEvents.find((row) => row.id === `booking-${status}`);
    const customerVisit = history.items.find((row) => row.encounterId === `encounter-${status}`);
    assert.equal(event.patientId, 'patient-canonical');
    assert.equal(event.encounterId, `encounter-${status}`);
    assert.equal(event.status, label);
    assert.equal(customerVisit.patientId, 'patient-canonical');
    assert.equal(customerVisit.stateLabel, label);
    assert.equal(customerVisit.notes.length, 4);
    assert.match(v11, new RegExp(label));
    assert.match(v11, new RegExp(`internal-note-${status}`));
    assert.match(v12, new RegExp(label));
    assert.match(v12, new RegExp(`treatment-note-${status}`));
  });
});
