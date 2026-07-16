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
  [
    'cco-v11-rail-adapters.js',
    'cco-v11-rail.js',
    'cco-v12-workspace.js',
  ].forEach((file) => vm.runInNewContext(fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app', file), 'utf8'), sandbox));
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

test('active admin calendar uses canonical bundle and the same strict patient handoff', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../public/cco-kalender-shell.js'), 'utf8'
  );
  assert.match(source, /\/api\/v1\/cco-bookings\/calendar-bundle/);
  assert.match(source, /type: 'arcana:cco-open-customer-dossier', patientId/);
  assert.match(source, /window\.location\.origin/);
  assert.match(source, /bookingNotes/);
  assert.match(source, /internalNotes/);
  assert.match(source, /treatmentNotes/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*['"]\/staff/);
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
  const calendarResult = calendar.mergeCalendarEvents([], [], visits, [], '2026-05-20', '2026-05-20');
  const dossierBundle = { visitSegments: visits.map((booking) => ({
    date: '2026-05-20', encounterId: booking.encounterId, booking,
  })) };
  const history = surfaces.CcoV11RailAdapters.buildHistoryFromExtras(
    { id: 'patient-canonical' }, {}, dossierBundle, []
  );
  const v11 = surfaces.CcoV11Rail.renderHistory(history);
  const v12 = surfaces.CcoV12Workspace.render({
    card: { id: 'patient-canonical' }, bcard: {}, dossierBundle,
    occasionTimeline: [], journalEntries: [], driveFiles: [],
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
