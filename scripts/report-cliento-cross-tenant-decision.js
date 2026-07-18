#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  CORE_FIELDS,
  NOTE_FIELDS,
  buildClientoCrossTenantCoverageReport,
  classifyPair,
  payloadChecksums,
} = require(path.join(process.cwd(), 'src', 'ops', 'clientoCrossTenantCoverage'));
const { createClientoBookingStore } = require(
  path.join(process.cwd(), 'src', 'ops', 'clientoBookingStore')
);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function groupUniqueBookings(bookings) {
  const groups = new Map();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const bookingId = bookingIdOf(booking);
    if (!bookingId) continue;
    if (!groups.has(bookingId)) groups.set(bookingId, []);
    groups.get(bookingId).push(payloadChecksums(booking));
  }
  return groups;
}

function emptyNoteDirection() {
  return { leftOnly: 0, rightOnly: 0, differentNonEmpty: 0 };
}

function incrementMap(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedCountObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (leftCount !== rightCount) return rightCount - leftCount;
      return leftKey.localeCompare(rightKey);
    })
  );
}

function minuteDelta(leftValue, rightValue) {
  const left = Date.parse(leftValue);
  const right = Date.parse(rightValue);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((right - left) / 60000);
}

function deltaBucket(delta) {
  if (!Number.isFinite(delta)) return 'invalid';
  const absolute = Math.abs(delta);
  if (absolute <= 5) return 'abs_0_5_min';
  if (absolute <= 30) return 'abs_6_30_min';
  if (absolute <= 60) return 'abs_31_60_min';
  if (absolute <= 1440) return 'abs_61_1440_min';
  return 'abs_over_1440_min';
}

function analyzeNoteDifferences(leftPayload, rightPayload) {
  const byField = {};
  let hasDifferentNonEmpty = false;
  let hasDirectionalDifference = false;
  for (const field of NOTE_FIELDS) {
    const left = leftPayload[field];
    const right = rightPayload[field];
    if (left === right) continue;
    if (left && right) {
      byField[field] = 'differentNonEmpty';
      hasDifferentNonEmpty = true;
    } else if (left) {
      byField[field] = 'leftOnly';
      hasDirectionalDifference = true;
    } else {
      byField[field] = 'rightOnly';
      hasDirectionalDifference = true;
    }
  }
  return { byField, hasDifferentNonEmpty, hasDirectionalDifference };
}

function buildClientoCrossTenantDecisionReport({
  leftBookings = [],
  rightBookings = [],
  expectedTotal = 55221,
  expectedConflicts = 308,
  expectedComplementaryNotes = 15190,
} = {}) {
  const coverage = buildClientoCrossTenantCoverageReport({
    leftBookings,
    rightBookings,
    expectedTotal,
    expectedUnlinkedReviewCount: 11472,
    sampleLimit: 0,
  });
  const left = groupUniqueBookings(leftBookings);
  const right = groupUniqueBookings(rightBookings);
  const conflictTypes = {
    core_only: 0,
    note_only: 0,
    core_and_note: 0,
    intra_tenant_duplicate: 0,
  };
  const coreFields = Object.fromEntries(CORE_FIELDS.map((field) => [field, 0]));
  const conflictNoteFields = Object.fromEntries(
    NOTE_FIELDS.map((field) => [field, emptyNoteDirection()])
  );
  const complementaryNoteFields = Object.fromEntries(
    NOTE_FIELDS.map((field) => [field, emptyNoteDirection()])
  );
  const corePatterns = new Map();
  const noteConflictPatterns = new Map();
  const statusTransitions = new Map();
  const timeDeltas = {
    startsAt: {},
    endsAt: {},
  };

  for (const bookingId of new Set([...left.keys(), ...right.keys()])) {
    const leftEntries = left.get(bookingId) || [];
    const rightEntries = right.get(bookingId) || [];
    if (!leftEntries.length || !rightEntries.length) continue;
    if (leftEntries.length !== 1 || rightEntries.length !== 1) {
      conflictTypes.intra_tenant_duplicate += 1;
      continue;
    }

    const leftEntry = leftEntries[0];
    const rightEntry = rightEntries[0];
    const comparison = classifyPair(leftEntry, rightEntry);
    const noteDifferences = analyzeNoteDifferences(leftEntry.payload, rightEntry.payload);

    if (comparison.classification === 'complementary_notes') {
      for (const [field, direction] of Object.entries(noteDifferences.byField)) {
        complementaryNoteFields[field][direction] += 1;
      }
      continue;
    }
    if (comparison.classification !== 'conflict') continue;

    const differingCoreFields = CORE_FIELDS.filter((field) => comparison.differences[field]);
    const differingNonEmptyNoteFields = Object.entries(noteDifferences.byField)
      .filter(([, direction]) => direction === 'differentNonEmpty')
      .map(([field]) => field);
    if (differingCoreFields.length && differingNonEmptyNoteFields.length) {
      conflictTypes.core_and_note += 1;
    } else if (differingCoreFields.length) {
      conflictTypes.core_only += 1;
    } else {
      conflictTypes.note_only += 1;
    }

    const corePattern = differingCoreFields.length ? differingCoreFields.join('+') : 'none';
    incrementMap(corePatterns, corePattern);
    const notePattern = differingNonEmptyNoteFields.length
      ? differingNonEmptyNoteFields.join('+')
      : 'none';
    incrementMap(noteConflictPatterns, notePattern);

    for (const field of differingCoreFields) coreFields[field] += 1;
    for (const [field, direction] of Object.entries(noteDifferences.byField)) {
      conflictNoteFields[field][direction] += 1;
    }

    if (comparison.differences.status) {
      incrementMap(
        statusTransitions,
        `${leftEntry.payload.status || '(blank)'} -> ${rightEntry.payload.status || '(blank)'}`
      );
    }
    for (const field of ['startsAt', 'endsAt']) {
      if (!comparison.differences[field]) continue;
      const bucket = deltaBucket(minuteDelta(leftEntry.payload[field], rightEntry.payload[field]));
      timeDeltas[field][bucket] = (timeDeltas[field][bucket] || 0) + 1;
    }
  }

  const actualConflicts = coverage.bookingIdCoverage.classifications.conflict;
  const actualComplementary = coverage.bookingIdCoverage.classifications.complementary_notes;
  const expectationsMet =
    coverage.population.complete &&
    actualConflicts === Number(expectedConflicts) &&
    actualComplementary === Number(expectedComplementaryNotes);

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    zeroWrites: true,
    population: {
      totalOccurrences: coverage.population.totalOccurrences,
      complete: coverage.population.complete,
      intersectionBookingIds: coverage.bookingIdCoverage.intersectionBookingIds,
      conflictCount: actualConflicts,
      complementaryNotesCount: actualComplementary,
    },
    conflictAnalysis: {
      types: conflictTypes,
      coreFields,
      corePatterns: sortedCountObject(corePatterns),
      noteFields: conflictNoteFields,
      noteConflictPatterns: sortedCountObject(noteConflictPatterns),
      statusTransitions: sortedCountObject(statusTransitions),
      timeDeltaBuckets: timeDeltas,
    },
    complementaryNotesPreservation: {
      policy: 'preserve_both_source_records_and_all_non_empty_note_segments',
      byField: complementaryNoteFields,
      rowWinnerAllowed: false,
      destructiveFieldSelectionAllowed: false,
    },
    safety: {
      bookingIdsEmitted: 0,
      noteTextEmitted: 0,
      deduplicated: false,
      patientIdWrites: 0,
      encounterIdWrites: 0,
      bookingWrites: 0,
      linkWrites: 0,
      journeyRestarted: false,
    },
    gate: {
      expectationsMet,
      status: expectationsMet ? 'review_plan_only' : 'blocked_population_drift',
      mergeAllowed: false,
      persistentLinkWriteAllowed: false,
    },
  };
}

function parseArgs(argv) {
  const args = {
    storePath: '',
    expectedTotal: 55221,
    expectedConflicts: 308,
    expectedComplementaryNotes: 15190,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') {
      const raw = argv[++index] || '';
      args.storePath = raw ? path.resolve(raw) : '';
    } else if (value === '--expected-total') args.expectedTotal = Number(argv[++index]);
    else if (value === '--expected-conflicts') args.expectedConflicts = Number(argv[++index]);
    else if (value === '--expected-complementary') {
      args.expectedComplementaryNotes = Number(argv[++index]);
    } else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.storePath) throw new Error('--store <explicit path> krävs.');
  if (!fs.existsSync(args.storePath) || !fs.statSync(args.storePath).isFile()) {
    throw new Error(`Store-filen finns inte: ${args.storePath}`);
  }
  for (const [key, value] of Object.entries(args).filter(([key]) => key !== 'storePath')) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${key} måste vara ett heltal.`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const report = buildClientoCrossTenantDecisionReport({
    leftBookings: store.listAllBookings({ tenantId: 'hair_tp', limit: 0 }),
    rightBookings: store.listAllBookings({ tenantId: 'hair-tp-clinic', limit: 0 }),
    expectedTotal: args.expectedTotal,
    expectedConflicts: args.expectedConflicts,
    expectedComplementaryNotes: args.expectedComplementaryNotes,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.gate.expectationsMet) process.exitCode = 2;
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  analyzeNoteDifferences,
  buildClientoCrossTenantDecisionReport,
  deltaBucket,
  minuteDelta,
};
