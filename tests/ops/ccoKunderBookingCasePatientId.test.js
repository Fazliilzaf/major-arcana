'use strict';

/**
 * Bokningsarendets patientId ska anvandas — inte bara e-posten.
 *
 * Migreringen 2026-08-20 skrev patientId pa legacy-bokningsarenden. Men
 * collectBookingReadouts slog fortfarande bara upp patienten via
 * customerEmail, sa det faltet kastades bort vid varje kortbygge.
 *
 * Foljden var tyst: ett arende vars kund har en annan mejladress an den
 * registrerade forsvann helt fran kundkortet, trots korrekt patientkoppling.
 * Exakt samma bugg var redan fixad for engine-poster (canonicalPatientId) —
 * kommentaren om det star kvar i koden pa rad ~607.
 *
 * Testet gar via collectBookingReadouts eftersom det ar den funktion som
 * bygger kundkortets bokningslista.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { collectBookingReadouts } = require('../../src/ops/ccoKunderBookingEnrichment');

const PATIENT = {
  id: 'pat-anna',
  primaryEmail: 'anna@klinik.se',
  emails: ['anna@klinik.se'],
  phones: [],
  cliento: {},
};

function arendeMed(overrides = {}) {
  return {
    bookingCaseId: 'case-1',
    customerEmail: 'anna@klinik.se',
    status: 'slots_ready',
    selectedSlots: [
      {
        slotId: 'slot-1',
        startsAt: '2099-09-01T09:00:00.000Z',
        endsAt: '2099-09-01T10:00:00.000Z',
        serviceLabel: 'Konsultation',
      },
    ],
    events: [{ type: 'case_created' }],
    ...overrides,
  };
}

function readoutsFor(bookingCase) {
  return collectBookingReadouts({
    patients: [PATIENT],
    bookingCases: [bookingCase],
    engineBookings: [],
    clientoBookings: [],
    encounters: [],
    services: [],
  });
}

test('arende hittas via e-post nar den matchar', () => {
  const ut = readoutsFor(arendeMed());
  const bucket = ut.get('pat-anna');
  assert.ok(bucket, 'patienten ska ha en bokningslista');
  assert.equal(bucket.upcomingBookings.length, 1);
});

test('arende med ANNAN e-post hittas via patientId', () => {
  // Kunden skrev fran en privat adress, men arendet ar kopplat till ratt
  // patient. Utan patientId-lasningen forsvinner bokningen fran kundkortet.
  const ut = readoutsFor(
    arendeMed({ customerEmail: 'anna.privat@gmail.com', patientId: 'pat-anna' })
  );
  const bucket = ut.get('pat-anna');
  assert.ok(bucket, 'arendet ska hamna pa patienten anda');
  assert.equal(bucket.upcomingBookings.length, 1);
});

test('okant patientId gissar inte fram en patient', () => {
  // Fail-closed: ett patientId som inte finns i patient-master far inte
  // anvandas, och e-posten matchar inte heller. Da ska arendet falla bort.
  const ut = readoutsFor(
    arendeMed({ customerEmail: 'okand@gmail.com', patientId: 'pat-finns-inte' })
  );
  assert.equal(ut.get('pat-finns-inte'), undefined);
  assert.equal(ut.get('pat-anna'), undefined);
});

test('patientId vinner over e-post nar bada finns', () => {
  const annan = {
    ...PATIENT,
    id: 'pat-bertil',
    primaryEmail: 'bertil@klinik.se',
    emails: ['bertil@klinik.se'],
  };
  const ut = collectBookingReadouts({
    patients: [PATIENT, annan],
    bookingCases: [arendeMed({ customerEmail: 'bertil@klinik.se', patientId: 'pat-anna' })],
    engineBookings: [],
    clientoBookings: [],
    encounters: [],
    services: [],
  });
  assert.ok(ut.get('pat-anna'), 'det explicita patientId:t ska styra');
  assert.equal(ut.get('pat-bertil'), undefined);
});
