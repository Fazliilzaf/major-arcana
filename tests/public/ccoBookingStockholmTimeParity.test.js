'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
