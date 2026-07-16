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
