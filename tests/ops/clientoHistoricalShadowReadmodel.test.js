'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { payloadChecksums } = require('../../src/ops/clientoCrossTenantCoverage');
const {
  buildClientoHistoricalShadowReadmodel,
} = require('../../src/ops/clientoHistoricalShadowReadmodel');

const checksum = (label) => crypto.createHash('sha256').update(`checksum:${label}`).digest('hex');

function booking(tenantId, overrides = {}) {
  return {
    tenantId,
    bookingId: 'booking-1',
    status: 'completed',
    startsAt: '2026-01-10T09:00:00.000Z',
    endsAt: '2026-01-10T09:30:00.000Z',
    durationMinutes: 30,
    serviceLabel: 'Fysisk konsultation',
    bookingNotes: 'booking note',
    customerMessage: 'customer message',
    internalNotes: 'internal note',
    treatmentNotes: 'treatment note',
    notes: 'general note',
    source: 'cliento_csv',
    ...overrides,
  };
}

function sourceRef(tenantId, sourceBooking) {
  const checksums = payloadChecksums(sourceBooking);
  return {
    tenantId,
    bookingId: sourceBooking.bookingId,
    sourceSnapshotChecksum: checksum(`${tenantId}:source`),
    coreChecksum: checksums.coreChecksum,
    notesChecksum: checksums.notesChecksum,
  };
}

function approvedEvent({ linkId = 'link-1', sourceBookings, state = 'approved' } = {}) {
  const [left, right] = sourceBookings;
  return {
    ledgerEventId: `${linkId}-approved-event`,
    linkId,
    state,
    sourceRefs: [sourceRef(left.tenantId, left), sourceRef(right.tenantId, right)],
    canonicalPatientId: 'patient-1',
    canonicalEncounterId: null,
    linkType: 'exact_booking_duplicate',
    reasonCode: 'historical_booking_without_encounter',
    eventHash: checksum(`${linkId}:event`),
    compareAndSwap: { sourceRefsChecksum: checksum(`${linkId}:source-refs`) },
    patientResolution: {
      verified: true,
      method: 'unique_identity_match',
      candidateCount: 1,
      canonicalPatientId: 'patient-1',
      evidenceChecksum: checksum(`${linkId}:patient-resolution`),
    },
  };
}

test('approved sidecar-link creates one read-only merged historical event with both source records', () => {
  const left = booking('hair_tp', { internalNotes: 'left internal' });
  const right = booking('hair-tp-clinic', { treatmentNotes: 'right treatment' });
  const model = buildClientoHistoricalShadowReadmodel({
    bookings: [left, right],
    ledgerEvents: [approvedEvent({ sourceBookings: [left, right] })],
  });

  assert.equal(model.readOnly, true);
  assert.equal(model.zeroWrites, true);
  assert.equal(model.activeProjectionUsed, false);
  assert.deepEqual(model.counts, {
    mergedApprovedLinks: 1,
    unmergedBookings: 0,
    skippedLinks: 0,
    totalEvents: 1,
  });
  const [event] = model.events;
  assert.equal(event.eventType, 'cliento_historical_booking_shadow_merge');
  assert.equal(event.canonicalPatientId, 'patient-1');
  assert.equal(event.canonicalEncounterId, null);
  assert.equal(event.linkAllowed, false);
  assert.equal(event.sourceRecords.length, 2);
  assert.equal(event.sourceRecords[0].noteSegments.internalNotes, 'left internal');
  assert.equal(event.sourceRecords[1].noteSegments.treatmentNotes, 'right treatment');
  assert.ok(event.sourceRecords.every((record) => record.provenance.coreChecksum));
  assert.ok(event.sourceRecords.every((record) => record.provenance.notesChecksum));
});

test('revoked and superseded latest link states are skipped and source bookings remain unmerged', () => {
  const left = booking('hair_tp');
  const right = booking('hair-tp-clinic');
  const revoked = {
    ...approvedEvent({ linkId: 'link-revoked', sourceBookings: [left, right] }),
    state: 'revoked',
    reasonCode: 'manual_revoke',
  };
  const superseded = {
    ...approvedEvent({
      linkId: 'link-superseded',
      sourceBookings: [
        booking('hair_tp', { bookingId: 'booking-2' }),
        booking('hair-tp-clinic', { bookingId: 'booking-2' }),
      ],
    }),
    state: 'superseded',
    reasonCode: 'manual_superseded',
  };
  const model = buildClientoHistoricalShadowReadmodel({
    bookings: [left, right],
    ledgerEvents: [revoked, superseded],
  });

  assert.equal(model.counts.mergedApprovedLinks, 0);
  assert.equal(model.counts.unmergedBookings, 2);
  assert.equal(model.counts.skippedLinks, 2);
  assert.ok(
    model.events.every((event) => event.eventType === 'cliento_historical_booking_unmerged')
  );
  assert.ok(model.events.every((event) => event.canonicalPatientId === null));
  assert.ok(model.events.every((event) => event.canonicalEncounterId === null));
});

test('unclear unlinked booking remains separate and cannot gain patient or encounter through shadow model', () => {
  const unclear = booking('hair_tp', {
    bookingId: 'unclear-1',
    customerEmail: '',
    customerPhone: '',
    clientoCustomerId: '',
  });
  const model = buildClientoHistoricalShadowReadmodel({
    bookings: [unclear],
    ledgerEvents: [],
  });

  assert.deepEqual(model.counts, {
    mergedApprovedLinks: 0,
    unmergedBookings: 1,
    skippedLinks: 0,
    totalEvents: 1,
  });
  const [event] = model.events;
  assert.equal(event.eventType, 'cliento_historical_booking_unmerged');
  assert.equal(event.linkAllowed, false);
  assert.equal(event.canonicalPatientId, null);
  assert.equal(event.canonicalEncounterId, null);
  assert.equal(event.sourceRecords.length, 1);
  assert.equal(event.sourceRecords[0].noteSegments.bookingNotes, 'booking note');
});
