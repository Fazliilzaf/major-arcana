'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConflictOutcomeReport,
  hasLaterBooking,
  outcomeOf,
} = require('../../scripts/report-cliento-conflict-outcome.js');

function booking(fields) {
  return {
    bookingId: fields.id,
    clientoCustomerId: fields.cid ?? '',
    status: fields.status,
    startsAt: fields.startsAt,
    endsAt: fields.startsAt,
    customerName: fields.name ?? '',
    customerEmail: fields.email ?? '',
    customerPhone: fields.phone ?? '',
    serviceLabel: 'Tjänst',
    durationMinutes: 30,
  };
}

test('outcomeOf normaliserar svenska/engelska statusar', () => {
  assert.equal(outcomeOf('Show'), 'show');
  assert.equal(outcomeOf('Done'), 'done');
  assert.equal(outcomeOf('completed'), 'done');
  assert.equal(outcomeOf('no_show'), 'noshow');
  assert.equal(outcomeOf('NoShow'), 'noshow');
  assert.equal(outcomeOf('Cancelled'), 'cancelled');
  assert.equal(outcomeOf('avbokad'), 'cancelled');
  assert.equal(outcomeOf('Booked'), 'booked');
  assert.equal(outcomeOf(''), 'blank');
  assert.equal(outcomeOf('konstig-status'), 'other');
});

test('klassificerar Show/Done som säkra, no_show/cancelled som historik', () => {
  const canonical = [
    booking({ id: 'B1', cid: '1001', status: 'Show', startsAt: '2026-06-01T10:00:00Z' }),
    booking({ id: 'B2', cid: '1002', status: 'no_show', startsAt: '2026-05-01T10:00:00Z' }),
    booking({ id: 'B3', cid: '1002', status: 'Booked', startsAt: '2026-06-15T10:00:00Z' }),
    booking({ id: 'B4', cid: '1003', status: 'cancelled', startsAt: '2026-04-01T10:00:00Z' }),
    booking({ id: 'B5', cid: '', status: 'NoShow', startsAt: '2026-03-01T10:00:00Z' }),
    booking({ id: 'B6', cid: '1004', status: 'Done', startsAt: '2026-02-01T10:00:00Z' }),
  ];
  const legacy = [
    booking({ id: 'B1', cid: '1001', status: 'Booked', startsAt: '2026-06-01T10:00:00Z' }),
    booking({ id: 'B2', cid: '1002', status: 'Booked', startsAt: '2026-05-01T10:00:00Z' }),
    booking({ id: 'B4', cid: '1003', status: 'Booked', startsAt: '2026-04-01T10:00:00Z' }),
    booking({ id: 'B5', cid: '', status: 'Booked', startsAt: '2026-03-01T10:00:00Z' }),
    booking({ id: 'B6', cid: '1004', status: 'Booked', startsAt: '2026-02-01T10:00:00Z' }),
    booking({ id: 'B7', cid: '1005', status: 'cancelled', startsAt: '2026-01-01T10:00:00Z' }),
  ];
  const report = buildConflictOutcomeReport({
    canonicalBookings: canonical,
    legacyBookings: legacy,
    allBookings: [...canonical, ...legacy],
    identifiers: true,
    details: 10,
  });
  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.summary.safeToPreserveOutcome, 2); // B1, B6
  assert.equal(report.summary.needsHistory, 3); // B2, B4, B5
  assert.equal(report.summary.rebooked, 1); // B2 → senare B3
  assert.equal(report.summary.lost, 1); // B4 → ingen senare bokning
  assert.equal(report.summary.unknown, 1); // B5 → saknar kund-ID
  assert.equal(report.summary.manualReview, 0);
});

test('maskar identifierare som standard', () => {
  const canonical = [
    booking({
      id: 'B1',
      cid: '1001',
      status: 'no_show',
      startsAt: '2026-05-01T10:00:00Z',
      email: 'a@x.se',
    }),
  ];
  const legacy = [
    booking({
      id: 'B1',
      cid: '1001',
      status: 'Booked',
      startsAt: '2026-05-01T10:00:00Z',
      email: 'a@x.se',
    }),
  ];
  const masked = buildConflictOutcomeReport({
    canonicalBookings: canonical,
    legacyBookings: legacy,
    allBookings: [...canonical, ...legacy],
    identifiers: false,
    details: 5,
  });
  assert.equal(masked.identifiersIncluded, false);
  assert.ok(masked.details[0].customerRef, 'customerRef ska finnas');
  assert.ok(masked.details[0].bookingRef, 'bookingRef ska finnas');
  assert.equal(masked.details[0].customerEmail, undefined);
  assert.equal(masked.details[0].clientoCustomerId, undefined);
});

test('hasLaterBooking skiljer rebooked/lost/unknown', () => {
  const history = [
    { bookingId: 'X', startsAtMs: Date.parse('2026-05-01T10:00:00Z'), outcome: 'noshow' },
    { bookingId: 'Y', startsAtMs: Date.parse('2026-06-15T10:00:00Z'), outcome: 'booked' },
  ];
  assert.equal(hasLaterBooking(history, 'X', Date.parse('2026-05-01T10:00:00Z')), true);
  assert.equal(hasLaterBooking(history, 'Y', Date.parse('2026-06-15T10:00:00Z')), false);
  assert.equal(hasLaterBooking(null, 'X', 0), null);
});
