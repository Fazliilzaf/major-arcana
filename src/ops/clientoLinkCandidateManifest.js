'use strict';

const crypto = require('node:crypto');

const {
  NOTE_FIELDS,
  payloadChecksums,
} = require('./clientoCrossTenantCoverage');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase().replace(/^mailto:/, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function maskedBookingRef(bookingId) {
  return `sha256:${crypto.createHash('sha256').update(bookingId).digest('hex').slice(0, 16)}`;
}

function sourceSnapshotChecksum(tenantId, booking) {
  const checksums = payloadChecksums(booking);
  const sourceIdentity = {
    bookingId: bookingIdOf(booking),
    customerEmail: normalizeEmail(booking?.customerEmail),
    customerPhone: normalizePhone(booking?.customerPhone || booking?.phone),
    clientoCustomerId: normalizeText(booking?.clientoCustomerId || booking?.customerId),
    patientId: normalizeText(booking?.patientId),
    encounterId: normalizeText(booking?.encounterId || booking?.treatmentEncounterId),
  };
  return sha256({
    tenantId: normalizeText(tenantId),
    sourceIdentity,
    normalizedPayload: checksums.payload,
  });
}

function groupBookings(bookings) {
  const groups = new Map();
  let missingBookingId = 0;
  for (const booking of asArray(bookings)) {
    const bookingId = bookingIdOf(booking);
    if (!bookingId) {
      missingBookingId += 1;
      continue;
    }
    if (!groups.has(bookingId)) groups.set(bookingId, []);
    groups.get(bookingId).push({ booking, checksums: payloadChecksums(booking) });
  }
  return { groups, missingBookingId };
}

function validateUnlinkedReview(report, expectedCount) {
  const rows = asArray(report?.rows);
  const reasons = [];
  const declaredTotal = Number(report?.total);
  if (report?.zeroWrites !== true) reasons.push('unlinked_review_not_zero_writes');
  if (!Number.isInteger(declaredTotal) || declaredTotal !== rows.length) {
    reasons.push('unlinked_review_total_mismatch');
  }
  if (rows.length !== expectedCount) reasons.push('unlinked_review_expected_count_mismatch');

  const bookingIds = new Set();
  for (const row of rows) {
    const bookingId = bookingIdOf(row);
    if (!bookingId) reasons.push('unlinked_review_booking_id_missing');
    else bookingIds.add(bookingId);
    if (normalizeText(row?.patientId) || normalizeText(row?.encounterId)) {
      reasons.push('unlinked_review_contains_canonical_link');
    }
    if (row?.linkAllowed !== false || row?.readOnly !== true) {
      reasons.push('unlinked_review_not_fail_closed');
    }
  }

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    declaredCount: Number.isInteger(declaredTotal) ? declaredTotal : null,
    rowCount: rows.length,
    uniqueBookingIds: bookingIds.size,
    bookingIds,
  };
}

function buildCandidateEntry({ bookingId, leftTenant, rightTenant, leftEntry, rightEntry }) {
  const leftSnapshotChecksum = sourceSnapshotChecksum(leftTenant, leftEntry.booking);
  const rightSnapshotChecksum = sourceSnapshotChecksum(rightTenant, rightEntry.booking);
  const pairChecksum = sha256({
    bookingId,
    leftTenant,
    leftSnapshotChecksum,
    rightTenant,
    rightSnapshotChecksum,
  });
  return {
    bookingRef: maskedBookingRef(bookingId),
    candidateState: 'review_only',
    patientId: null,
    encounterId: null,
    linkAllowed: false,
    compareAndSwap: {
      algorithm: 'sha256(normalized-source-snapshot-v1)',
      left: {
        tenantId: leftTenant,
        sourceSnapshotChecksum: leftSnapshotChecksum,
        coreChecksum: leftEntry.checksums.coreChecksum,
        notesChecksum: leftEntry.checksums.notesChecksum,
      },
      right: {
        tenantId: rightTenant,
        sourceSnapshotChecksum: rightSnapshotChecksum,
        coreChecksum: rightEntry.checksums.coreChecksum,
        notesChecksum: rightEntry.checksums.notesChecksum,
      },
      expectedPairChecksum: pairChecksum,
    },
  };
}

function buildClientoLinkCandidateManifest({
  leftTenant = 'hair_tp',
  rightTenant = 'hair-tp-clinic',
  leftBookings = [],
  rightBookings = [],
  unlinkedReview = null,
  expectedTotal = 55221,
  expectedUnlinkedReviewCount = 11283,
} = {}) {
  const leftId = normalizeText(leftTenant);
  const rightId = normalizeText(rightTenant);
  if (!leftId || !rightId || leftId === rightId) {
    throw new Error('Två olika tenant-id krävs för kandidatmanifestet.');
  }
  if (!Number.isInteger(expectedTotal) || expectedTotal < 0) {
    throw new Error('expectedTotal måste vara ett icke-negativt heltal.');
  }
  if (!Number.isInteger(expectedUnlinkedReviewCount) || expectedUnlinkedReviewCount < 0) {
    throw new Error('expectedUnlinkedReviewCount måste vara ett icke-negativt heltal.');
  }

  const left = groupBookings(leftBookings);
  const right = groupBookings(rightBookings);
  const unlinked = validateUnlinkedReview(unlinkedReview, expectedUnlinkedReviewCount);
  const totalOccurrences = asArray(leftBookings).length + asArray(rightBookings).length;
  const invariantFailures = [...unlinked.reasons];
  if (totalOccurrences !== expectedTotal) invariantFailures.push('population_total_mismatch');
  if (left.missingBookingId || right.missingBookingId) {
    invariantFailures.push('population_booking_id_missing');
  }

  const blocked = invariantFailures.length > 0;
  const exclusions = {
    oneSided: 0,
    intraTenantDuplicate: 0,
    coreChecksumMismatch: 0,
    noteSegmentMismatch: 0,
    unlinkedReview: 0,
  };
  const entries = [];
  const candidateBookingIds = new Set();
  const bookingIds = new Set([...left.groups.keys(), ...right.groups.keys()]);

  if (!blocked) {
    for (const bookingId of [...bookingIds].sort()) {
      const leftEntries = left.groups.get(bookingId) || [];
      const rightEntries = right.groups.get(bookingId) || [];
      if (!leftEntries.length || !rightEntries.length) {
        exclusions.oneSided += 1;
        continue;
      }
      if (leftEntries.length !== 1 || rightEntries.length !== 1) {
        exclusions.intraTenantDuplicate += 1;
        continue;
      }
      if (unlinked.bookingIds.has(bookingId)) {
        exclusions.unlinkedReview += 1;
        continue;
      }

      const leftEntry = leftEntries[0];
      const rightEntry = rightEntries[0];
      if (leftEntry.checksums.coreChecksum !== rightEntry.checksums.coreChecksum) {
        exclusions.coreChecksumMismatch += 1;
        continue;
      }
      if (leftEntry.checksums.notesChecksum !== rightEntry.checksums.notesChecksum) {
        exclusions.noteSegmentMismatch += 1;
        continue;
      }
      candidateBookingIds.add(bookingId);
      entries.push(
        buildCandidateEntry({
          bookingId,
          leftTenant: leftId,
          rightTenant: rightId,
          leftEntry,
          rightEntry,
        })
      );
    }
  }

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    zeroWrites: true,
    manifestPurpose: 'masked_first_link_package_candidate_review',
    selectionCriteria: {
      bookingId: 'exactly_one_occurrence_in_each_tenant',
      corePayload: 'normalized_core_checksum_must_match',
      noteSegments: `all_${NOTE_FIELDS.length}_normalized_note_fields_must_match`,
      unlinkedReview: `exclude_all_${expectedUnlinkedReviewCount}_review_rows`,
      conflictsAllowed: false,
      oneSidedAllowed: false,
      identityGuessingAllowed: false,
    },
    population: {
      expectedTotalOccurrences: expectedTotal,
      totalOccurrences,
      complete: totalOccurrences === expectedTotal,
      leftOccurrences: asArray(leftBookings).length,
      rightOccurrences: asArray(rightBookings).length,
      unionBookingIds: bookingIds.size,
      missingBookingId: left.missingBookingId + right.missingBookingId,
    },
    unlinkedReview: {
      expectedCount: expectedUnlinkedReviewCount,
      declaredCount: unlinked.declaredCount,
      rowCount: unlinked.rowCount,
      uniqueBookingIds: unlinked.uniqueBookingIds,
      valid: unlinked.valid,
      candidateOverlapCount: [...candidateBookingIds].filter((bookingId) => {
        return unlinked.bookingIds.has(bookingId);
      }).length,
      allExcludedFromCandidates:
        !blocked &&
        [...candidateBookingIds].every((bookingId) => !unlinked.bookingIds.has(bookingId)),
    },
    cohort: {
      candidateCount: entries.length,
      exclusions,
      entries,
    },
    safety: {
      bookingIdsMasked: true,
      bookingIdsEmitted: 0,
      patientIdsEmitted: 0,
      encounterIdsEmitted: 0,
      noteTextEmitted: 0,
      bookingWrites: 0,
      patientIdWrites: 0,
      encounterIdWrites: 0,
      linkWrites: 0,
      migrationWrites: 0,
      journeyRestarted: false,
    },
    gate: {
      status: blocked ? 'blocked_data_invariant' : 'review_candidates_only',
      invariantFailures: [...new Set(invariantFailures)].sort(),
      proposedWriteAllowed: false,
      approvalAllowed: false,
      activationAllowed: false,
      persistentLinkWriteAllowed: false,
      mergeRecordsAllowed: false,
    },
  };
}

module.exports = {
  buildClientoLinkCandidateManifest,
  maskedBookingRef,
  sourceSnapshotChecksum,
  validateUnlinkedReview,
};
