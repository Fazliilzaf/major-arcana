'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildClientoCrossTenantCoverageReport,
  normalizeComparisonPayload,
  payloadChecksums,
} = require('../../src/ops/clientoCrossTenantCoverage');

function booking(bookingId, overrides = {}) {
  return {
    bookingId,
    status: 'Completed',
    startsAt: '2026-07-01T08:00:00.000Z',
    endsAt: '2026-07-01T08:30:00.000Z',
    durationMinutes: 30,
    serviceId: 'consultation-physical',
    serviceLabel: 'Fysisk konsultation',
    bookingNotes: '',
    customerMessage: '',
    internalNotes: '',
    treatmentNotes: '',
    notes: '',
    patientId: null,
    encounterId: null,
    ...overrides,
  };
}

test('normaliserar payload deterministiskt och klassificerar exakt tenant-match', () => {
  const left = booking('booking-exact', {
    status: ' COMPLETED ',
    serviceLabel: 'Fysisk   konsultation',
    notes: 'rad 1\r\nrad 2',
  });
  const right = booking('booking-exact', {
    status: 'completed',
    serviceLabel: 'fysisk konsultation',
    notes: 'rad 1\nrad 2',
  });
  assert.deepEqual(normalizeComparisonPayload(left), normalizeComparisonPayload(right));
  assert.equal(payloadChecksums(left).fullChecksum, payloadChecksums(right).fullChecksum);

  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [left],
    rightBookings: [right],
    expectedTotal: 2,
  });
  assert.equal(report.population.complete, true);
  assert.equal(report.bookingIdCoverage.intersectionBookingIds, 1);
  assert.equal(report.bookingIdCoverage.matchingFullPayloadChecksums, 1);
  assert.equal(report.bookingIdCoverage.matchingCorePayloadChecksums, 1);
  assert.equal(report.bookingIdCoverage.classifications.exact_match, 1);
  assert.equal(report.safety.dataMutations, 0);
});

test('klassificerar kompletterande anteckningar utan att slå ihop posterna', () => {
  const left = booking('booking-notes', { bookingNotes: 'Ta med tidigare journal.' });
  const right = booking('booking-notes', { internalNotes: 'Endast för personal.' });
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [left],
    rightBookings: [right],
  });
  assert.equal(report.bookingIdCoverage.classifications.complementary_notes, 1);
  assert.equal(report.bookingIdCoverage.matchingFullPayloadChecksums, 0);
  assert.equal(report.bookingIdCoverage.matchingCorePayloadChecksums, 1);
  assert.equal(report.deviationsByField.bookingNotes, 1);
  assert.equal(report.deviationsByField.internalNotes, 1);
  assert.equal(report.samples.complementary_notes[0].patientId, null);
  assert.equal(report.samples.complementary_notes[0].encounterId, null);
  assert.equal(report.samples.complementary_notes[0].linkAllowed, false);
  assert.equal(left.internalNotes, '');
  assert.equal(right.bookingNotes, '');
});

test('utan explicit förväntad total bedöms en komplett, identifierbar population korrekt', () => {
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [booking('left')],
    rightBookings: [booking('right')],
  });
  assert.equal(report.population.expectedTotal, null);
  assert.equal(report.population.complete, true);
  assert.equal(report.gate.status, 'review_required');
});

test('klassificerar status-, tid-, behandlings- och notfältavvikelser som konflikt', () => {
  const left = booking('booking-conflict', {
    status: 'completed',
    startsAt: '2026-07-01T08:00:00.000Z',
    serviceLabel: 'Fysisk konsultation',
    treatmentNotes: 'Dos A',
  });
  const right = booking('booking-conflict', {
    status: 'cancelled',
    startsAt: '2026-07-01T09:00:00.000Z',
    serviceLabel: 'PRP Hår',
    treatmentNotes: 'Dos B',
  });
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [left],
    rightBookings: [right],
  });
  assert.equal(report.bookingIdCoverage.classifications.conflict, 1);
  assert.equal(report.deviationsByField.status, 1);
  assert.equal(report.deviationsByField.startsAt, 1);
  assert.equal(report.deviationsByField.serviceLabel, 1);
  assert.equal(report.deviationsByField.treatmentNotes, 1);
});

test('räknar ensidiga poster och gör intra-tenant bookingId-dubletter fail-closed', () => {
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [booking('left-only'), booking('duplicate'), booking('duplicate')],
    rightBookings: [booking('right-only'), booking('duplicate')],
  });
  assert.equal(report.population.left.occurrences, 3);
  assert.equal(report.population.left.uniqueBookingIds, 2);
  assert.equal(report.population.left.duplicateBookingIds, 1);
  assert.equal(report.bookingIdCoverage.classifications.one_sided_left, 1);
  assert.equal(report.bookingIdCoverage.classifications.one_sided_right, 1);
  assert.equal(report.bookingIdCoverage.classifications.conflict, 1);
  assert.equal(report.bookingIdCoverage.intraTenantDuplicateConflicts, 1);
});

test('läser hela populationen utan limit=50000 och ekar inte facit som verifierat reviewantal', () => {
  const leftBookings = Array.from({ length: 50001 }, (_, index) =>
    booking(`left-full-${index}`, { patientId: null, encounterId: null })
  );
  const rightBookings = [booking('right-full', { patientId: null, encounterId: null })];
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings,
    rightBookings,
    expectedTotal: 50002,
    expectedUnlinkedReviewCount: 11472,
    sampleLimit: 1,
  });
  assert.equal(report.population.limitApplied, null);
  assert.equal(report.population.totalOccurrences, 50002);
  assert.equal(report.population.left.occurrences, 50001);
  assert.equal(report.population.complete, true);
  assert.equal(report.safety.expectedUnlinkedReviewCount, 11472);
  assert.equal(report.safety.unlinkedReviewCount, null);
  assert.equal(report.safety.unlinkedReviewCountVerified, false);
  assert.equal(report.safety.patientIdWrites, 0);
  assert.equal(report.safety.encounterIdWrites, 0);
  assert.equal(report.safety.linkProposals, 0);
  assert.equal(leftBookings[0].patientId, null);
  assert.equal(leftBookings[0].encounterId, null);
});

test('blockerar beslutsgrinden när explicit förväntad population inte stämmer', () => {
  const report = buildClientoCrossTenantCoverageReport({
    leftBookings: [booking('a')],
    rightBookings: [booking('b')],
    expectedTotal: 55221,
  });
  assert.equal(report.population.complete, false);
  assert.equal(report.gate.status, 'blocked_incomplete_population');
  assert.equal(report.gate.persistentLinkPlanAllowed, false);
  assert.equal(report.gate.mergePlanAllowed, false);
});
