'use strict';

/**
 * Saker patientId-uppslag for legacy bokningsarenden.
 *
 * Samma princip som for Cliento-bokningarna: tvetydig identitet ger null,
 * aldrig en gissning. Det ar grunden for att /calendar-bundle?patientId
 * inte ska laka en patient till en annan.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPatientLookupMaps,
  resolvePatientIdFromClientoBooking,
} = require('../../src/ops/ccoKunderBookingEnrichment');

function patient(id, emails) {
  return {
    id,
    primaryEmail: emails[0] || '',
    emails: emails.slice(),
    phones: [],
    cliento: {},
  };
}

test('unik e-post resolvar till ratt patient', () => {
  const lookup = buildPatientLookupMaps([
    patient('pat-anna', ['anna@example.se']),
    patient('pat-bertil', ['bertil@example.se']),
  ]);
  const resolved = resolvePatientIdFromClientoBooking(
    { customerEmail: 'anna@example.se' },
    lookup
  );
  assert.equal(resolved, 'pat-anna');
});

test('tvetydig e-post resolvar inte till nagon patient', () => {
  const lookup = buildPatientLookupMaps([
    patient('pat-anna', ['anna@example.se', 'shared@example.se']),
    patient('pat-bertil', ['bertil@example.se', 'shared@example.se']),
  ]);
  const resolved = resolvePatientIdFromClientoBooking(
    { customerEmail: 'shared@example.se' },
    lookup
  );
  assert.equal(resolved, null);
});

test('saknad e-post resolvar inte till nagon patient', () => {
  const lookup = buildPatientLookupMaps([patient('pat-anna', ['anna@example.se'])]);
  const resolved = resolvePatientIdFromClientoBooking({ customerEmail: '' }, lookup);
  assert.equal(resolved, null);
});

test('clientoCustomerId anvands nar e-post saknas', () => {
  const lookup = buildPatientLookupMaps([
    { id: 'pat-anna', primaryEmail: '', emails: [], phones: [], cliento: { sourceId: 'cliento-1' } },
  ]);
  const resolved = resolvePatientIdFromClientoBooking(
    { customerEmail: '', clientoCustomerId: 'cliento-1' },
    lookup
  );
  assert.equal(resolved, 'pat-anna');
});
