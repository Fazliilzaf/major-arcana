'use strict';

const crypto = require('node:crypto');

const NOTE_FIELDS = Object.freeze([
  'bookingNotes',
  'customerMessage',
  'internalNotes',
  'treatmentNotes',
  'notes',
]);
const CORE_FIELDS = Object.freeze([
  'status',
  'startsAt',
  'endsAt',
  'durationMinutes',
  'serviceId',
  'serviceLabel',
]);
const ALL_COMPARE_FIELDS = Object.freeze([...CORE_FIELDS, ...NOTE_FIELDS]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\r\n?/g, '\n') : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeInstant(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : text;
}

function normalizeDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : normalizeText(String(value));
}

function normalizeComparisonPayload(booking = {}) {
  return {
    status: normalizeKey(booking.status),
    startsAt: normalizeInstant(booking.startsAt),
    endsAt: normalizeInstant(booking.endsAt),
    durationMinutes: normalizeDuration(booking.durationMinutes),
    serviceId: normalizeKey(booking.serviceId),
    serviceLabel: normalizeKey(booking.serviceLabel || booking.service),
    bookingNotes: normalizeText(booking.bookingNotes),
    customerMessage: normalizeText(booking.customerMessage),
    internalNotes: normalizeText(booking.internalNotes),
    treatmentNotes: normalizeText(booking.treatmentNotes),
    notes: normalizeText(booking.notes),
  };
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function payloadChecksums(booking = {}) {
  const payload = normalizeComparisonPayload(booking);
  const core = Object.fromEntries(CORE_FIELDS.map((field) => [field, payload[field]]));
  const notes = Object.fromEntries(NOTE_FIELDS.map((field) => [field, payload[field]]));
  return {
    payload,
    fullChecksum: checksum(payload),
    coreChecksum: checksum(core),
    notesChecksum: checksum(notes),
  };
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function groupByBookingId(bookings = []) {
  const groups = new Map();
  let missingBookingId = 0;
  for (const booking of asArray(bookings)) {
    const bookingId = bookingIdOf(booking);
    if (!bookingId) {
      missingBookingId += 1;
      continue;
    }
    if (!groups.has(bookingId)) groups.set(bookingId, []);
    groups.get(bookingId).push({ booking, ...payloadChecksums(booking) });
  }
  return { groups, missingBookingId };
}

function fieldDifferences(leftPayload, rightPayload) {
  return Object.fromEntries(
    ALL_COMPARE_FIELDS.map((field) => [field, leftPayload[field] !== rightPayload[field]])
  );
}

function notesAreComplementary(leftPayload, rightPayload) {
  let hasDifference = false;
  for (const field of NOTE_FIELDS) {
    const left = leftPayload[field];
    const right = rightPayload[field];
    if (left === right) continue;
    hasDifference = true;
    if (left && right) return false;
  }
  return hasDifference;
}

function classifyPair(leftEntry, rightEntry) {
  const differences = fieldDifferences(leftEntry.payload, rightEntry.payload);
  if (leftEntry.fullChecksum === rightEntry.fullChecksum) {
    return { classification: 'exact_match', differences };
  }
  if (
    leftEntry.coreChecksum === rightEntry.coreChecksum &&
    notesAreComplementary(leftEntry.payload, rightEntry.payload)
  ) {
    return { classification: 'complementary_notes', differences };
  }
  return { classification: 'conflict', differences };
}

function maskedBookingRef(bookingId) {
  return `sha256:${crypto.createHash('sha256').update(bookingId).digest('hex').slice(0, 16)}`;
}

function tenantPopulation(bookings, grouped) {
  const fullChecksums = new Set();
  const coreChecksums = new Set();
  for (const entries of grouped.groups.values()) {
    for (const entry of entries) {
      fullChecksums.add(entry.fullChecksum);
      coreChecksums.add(entry.coreChecksum);
    }
  }
  return {
    occurrences: asArray(bookings).length,
    uniqueBookingIds: grouped.groups.size,
    missingBookingId: grouped.missingBookingId,
    duplicateBookingIds: [...grouped.groups.values()].filter((entries) => entries.length > 1)
      .length,
    uniqueFullPayloadChecksums: fullChecksums.size,
    uniqueCorePayloadChecksums: coreChecksums.size,
  };
}

function addDifferences(target, differences) {
  for (const field of ALL_COMPARE_FIELDS) {
    if (differences[field]) target[field] += 1;
  }
}

function buildClientoCrossTenantCoverageReport({
  leftTenant = 'hair_tp',
  rightTenant = 'hair-tp-clinic',
  leftBookings = [],
  rightBookings = [],
  expectedTotal = null,
  expectedUnlinkedReviewCount = 11472,
  sampleLimit = 20,
} = {}) {
  const leftId = normalizeText(leftTenant);
  const rightId = normalizeText(rightTenant);
  if (!leftId || !rightId || leftId === rightId) {
    throw new Error('Två olika tenant-id krävs för cross-tenant-rapporten.');
  }

  const left = groupByBookingId(leftBookings);
  const right = groupByBookingId(rightBookings);
  const bookingIds = new Set([...left.groups.keys(), ...right.groups.keys()]);
  const counts = {
    exact_match: 0,
    complementary_notes: 0,
    conflict: 0,
    one_sided_left: 0,
    one_sided_right: 0,
  };
  const deviationsByField = Object.fromEntries(ALL_COMPARE_FIELDS.map((field) => [field, 0]));
  const samples = {
    complementary_notes: [],
    conflict: [],
    one_sided_left: [],
    one_sided_right: [],
  };
  let intersectionBookingIds = 0;
  let intraTenantDuplicateConflicts = 0;
  let matchingFullPayloadChecksums = 0;
  let matchingCorePayloadChecksums = 0;

  const pushSample = (classification, bookingId, detail = {}) => {
    if (!samples[classification] || samples[classification].length >= Math.max(0, sampleLimit)) {
      return;
    }
    samples[classification].push({
      bookingRef: maskedBookingRef(bookingId),
      patientId: null,
      encounterId: null,
      linkAllowed: false,
      ...detail,
    });
  };

  for (const bookingId of [...bookingIds].sort()) {
    const leftEntries = left.groups.get(bookingId) || [];
    const rightEntries = right.groups.get(bookingId) || [];
    if (!leftEntries.length) {
      counts.one_sided_right += 1;
      pushSample('one_sided_right', bookingId, { rightOccurrences: rightEntries.length });
      continue;
    }
    if (!rightEntries.length) {
      counts.one_sided_left += 1;
      pushSample('one_sided_left', bookingId, { leftOccurrences: leftEntries.length });
      continue;
    }
    intersectionBookingIds += 1;

    if (leftEntries.length !== 1 || rightEntries.length !== 1) {
      counts.conflict += 1;
      intraTenantDuplicateConflicts += 1;
      pushSample('conflict', bookingId, {
        reason: 'intra_tenant_duplicate_booking_id',
        leftOccurrences: leftEntries.length,
        rightOccurrences: rightEntries.length,
        leftChecksums: [...new Set(leftEntries.map((entry) => entry.fullChecksum))],
        rightChecksums: [...new Set(rightEntries.map((entry) => entry.fullChecksum))],
      });
      continue;
    }

    const comparison = classifyPair(leftEntries[0], rightEntries[0]);
    if (leftEntries[0].fullChecksum === rightEntries[0].fullChecksum) {
      matchingFullPayloadChecksums += 1;
    }
    if (leftEntries[0].coreChecksum === rightEntries[0].coreChecksum) {
      matchingCorePayloadChecksums += 1;
    }
    counts[comparison.classification] += 1;
    addDifferences(deviationsByField, comparison.differences);
    if (comparison.classification !== 'exact_match') {
      pushSample(comparison.classification, bookingId, {
        differingFields: ALL_COMPARE_FIELDS.filter((field) => comparison.differences[field]),
        leftChecksum: leftEntries[0].fullChecksum,
        rightChecksum: rightEntries[0].fullChecksum,
        leftCoreChecksum: leftEntries[0].coreChecksum,
        rightCoreChecksum: rightEntries[0].coreChecksum,
      });
    }
  }

  const leftPopulation = tenantPopulation(leftBookings, left);
  const rightPopulation = tenantPopulation(rightBookings, right);
  const totalOccurrences = leftPopulation.occurrences + rightPopulation.occurrences;
  const hasExpectedTotal =
    expectedTotal !== null && expectedTotal !== undefined && expectedTotal !== '';
  const expected =
    hasExpectedTotal && Number.isFinite(Number(expectedTotal)) ? Number(expectedTotal) : null;
  const populationComplete =
    leftPopulation.missingBookingId === 0 &&
    rightPopulation.missingBookingId === 0 &&
    (expected === null || totalOccurrences === expected);

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    zeroWrites: true,
    comparison: {
      leftTenant: leftId,
      rightTenant: rightId,
      payloadFields: ALL_COMPARE_FIELDS,
      noteFields: NOTE_FIELDS,
      checksumAlgorithm: 'sha256(normalized-json)',
      bookingIdsMaskedInSamples: true,
    },
    population: {
      limitApplied: null,
      expectedTotal: expected,
      totalOccurrences,
      complete: populationComplete,
      left: leftPopulation,
      right: rightPopulation,
    },
    bookingIdCoverage: {
      unionBookingIds: bookingIds.size,
      intersectionBookingIds,
      matchingFullPayloadChecksums,
      matchingCorePayloadChecksums,
      classifications: counts,
      intraTenantDuplicateConflicts,
    },
    deviationsByField,
    samples,
    safety: {
      deduplicated: false,
      dataMutations: 0,
      patientIdWrites: 0,
      encounterIdWrites: 0,
      linkProposals: 0,
      expectedUnlinkedReviewCount: Number(expectedUnlinkedReviewCount) || 0,
      unlinkedReviewCount: null,
      unlinkedReviewCountVerified: false,
      unlinkedHandling: 'patientId:null; encounterId:null; linkAllowed:false',
    },
    gate: {
      status: populationComplete ? 'review_required' : 'blocked_incomplete_population',
      persistentLinkPlanAllowed: false,
      mergePlanAllowed: false,
    },
  };
}

module.exports = {
  ALL_COMPARE_FIELDS,
  CORE_FIELDS,
  NOTE_FIELDS,
  buildClientoCrossTenantCoverageReport,
  classifyPair,
  normalizeComparisonPayload,
  payloadChecksums,
};
