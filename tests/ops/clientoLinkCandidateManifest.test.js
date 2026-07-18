'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  buildClientoLinkCandidateManifest,
  sourceSnapshotChecksum,
} = require('../../src/ops/clientoLinkCandidateManifest');

function booking(bookingId, overrides = {}) {
  return {
    bookingId,
    customerEmail: `${bookingId}@example.test`,
    customerPhone: '070 111 22 33',
    clientoCustomerId: `customer-${bookingId}`,
    status: 'completed',
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
    patientId: '',
    encounterId: '',
    source: 'cliento_csv',
    ...overrides,
  };
}

function unlinkedReview(rows = []) {
  return {
    zeroWrites: true,
    total: rows.length,
    rows: rows.map((bookingId) => ({
      bookingId,
      patientId: null,
      encounterId: null,
      readOnly: true,
      linkAllowed: false,
      reasonCode: 'no_canonical_match',
    })),
  };
}

test('emitterar endast maskerad exakt kandidat med deterministiska CAS-checksummor', () => {
  const left = booking('secret-booking-id', { notes: 'samma hemliga not' });
  const right = booking('secret-booking-id', {
    status: ' COMPLETED ',
    serviceLabel: 'fysisk konsultation',
    notes: 'samma hemliga not',
  });
  const report = buildClientoLinkCandidateManifest({
    leftBookings: [left],
    rightBookings: [right],
    unlinkedReview: unlinkedReview(),
    expectedTotal: 2,
    expectedUnlinkedReviewCount: 0,
  });

  assert.equal(report.gate.status, 'review_candidates_only');
  assert.equal(report.cohort.candidateCount, 1);
  assert.match(report.cohort.entries[0].bookingRef, /^sha256:[a-f0-9]{16}$/);
  assert.equal(report.cohort.entries[0].patientId, null);
  assert.equal(report.cohort.entries[0].encounterId, null);
  assert.equal(report.cohort.entries[0].linkAllowed, false);
  assert.equal(
    report.cohort.entries[0].compareAndSwap.left.coreChecksum,
    report.cohort.entries[0].compareAndSwap.right.coreChecksum
  );
  assert.equal(
    report.cohort.entries[0].compareAndSwap.left.notesChecksum,
    report.cohort.entries[0].compareAndSwap.right.notesChecksum
  );
  assert.equal(JSON.stringify(report).includes('secret-booking-id'), false);
  assert.equal(JSON.stringify(report).includes('samma hemliga not'), false);
  assert.equal(report.safety.linkWrites, 0);
  assert.equal(report.gate.activationAllowed, false);
});

test('exkluderar konflikt, ensidig post, notdelta, dubblett och hela reviewpopulationen', () => {
  const left = [
    booking('candidate'),
    booking('core-conflict'),
    booking('note-delta', { bookingNotes: 'vänster' }),
    booking('unlinked'),
    booking('left-only'),
    booking('duplicate'),
    booking('duplicate'),
  ];
  const right = [
    booking('candidate'),
    booking('core-conflict', { status: 'cancelled' }),
    booking('note-delta'),
    booking('unlinked'),
    booking('right-only'),
    booking('duplicate'),
  ];
  const report = buildClientoLinkCandidateManifest({
    leftBookings: left,
    rightBookings: right,
    unlinkedReview: unlinkedReview(['unlinked']),
    expectedTotal: left.length + right.length,
    expectedUnlinkedReviewCount: 1,
  });

  assert.equal(report.cohort.candidateCount, 1);
  assert.deepEqual(report.cohort.exclusions, {
    oneSided: 2,
    intraTenantDuplicate: 1,
    coreChecksumMismatch: 1,
    noteSegmentMismatch: 1,
    unlinkedReview: 1,
  });
  assert.equal(report.unlinkedReview.allExcludedFromCandidates, true);
  assert.equal(report.unlinkedReview.candidateOverlapCount, 0);
  assert.equal(report.selectionCriteria.identityGuessingAllowed, false);
});

test('populations- eller reviewdrift blockerar fail-closed och emitterar noll kandidater', () => {
  const invalidReview = unlinkedReview(['unclear']);
  invalidReview.rows[0].linkAllowed = true;
  const report = buildClientoLinkCandidateManifest({
    leftBookings: [booking('same')],
    rightBookings: [booking('same')],
    unlinkedReview: invalidReview,
    expectedTotal: 55221,
    expectedUnlinkedReviewCount: 11472,
  });

  assert.equal(report.gate.status, 'blocked_data_invariant');
  assert.equal(report.cohort.candidateCount, 0);
  assert.ok(report.gate.invariantFailures.includes('population_total_mismatch'));
  assert.ok(report.gate.invariantFailures.includes('unlinked_review_expected_count_mismatch'));
  assert.ok(report.gate.invariantFailures.includes('unlinked_review_not_fail_closed'));
  assert.equal(report.gate.persistentLinkWriteAllowed, false);
});

test('dubbla booking-id:n i reviewpopulationen blockerar kandidatmanifestet', () => {
  const duplicateReview = unlinkedReview(['unclear', 'unclear']);
  const report = buildClientoLinkCandidateManifest({
    leftBookings: [booking('same')],
    rightBookings: [booking('same')],
    unlinkedReview: duplicateReview,
    expectedTotal: 2,
    expectedUnlinkedReviewCount: 2,
  });

  assert.equal(report.gate.status, 'blocked_data_invariant');
  assert.equal(report.unlinkedReview.rowCount, 2);
  assert.equal(report.unlinkedReview.uniqueBookingIds, 1);
  assert.ok(report.gate.invariantFailures.includes('unlinked_review_duplicate_booking_id'));
  assert.equal(report.cohort.candidateCount, 0);
});

test('reviewpopulationen får en deterministisk maskerad mängdchecksumma', () => {
  const first = buildClientoLinkCandidateManifest({
    leftBookings: [],
    rightBookings: [],
    unlinkedReview: unlinkedReview(['review-b', 'review-a']),
    expectedTotal: 0,
    expectedUnlinkedReviewCount: 2,
  });
  const second = buildClientoLinkCandidateManifest({
    leftBookings: [],
    rightBookings: [],
    unlinkedReview: unlinkedReview(['review-a', 'review-b']),
    expectedTotal: 0,
    expectedUnlinkedReviewCount: 2,
  });

  assert.match(first.unlinkedReview.maskedBookingRefSetChecksum, /^[a-f0-9]{64}$/);
  assert.equal(
    first.unlinkedReview.maskedBookingRefSetChecksum,
    second.unlinkedReview.maskedBookingRefSetChecksum
  );
  assert.equal(first.unlinkedReview.setChecksumAlgorithm, 'sha256(sorted-masked-booking-refs-v1)');
});

test('source-snapshot-CAS ändras av identitets- eller notdrift', () => {
  const original = booking('same');
  const originalChecksum = sourceSnapshotChecksum('hair_tp', original);
  assert.notEqual(
    sourceSnapshotChecksum('hair_tp', { ...original, customerEmail: 'changed@example.test' }),
    originalChecksum
  );
  assert.notEqual(
    sourceSnapshotChecksum('hair_tp', { ...original, treatmentNotes: 'ny not' }),
    originalChecksum
  );
  assert.notEqual(sourceSnapshotChecksum('hair-tp-clinic', original), originalChecksum);
});

test('CLI lämnar båda inputfiler byte-identiska och läcker inga identifierare eller noter', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-link-candidates-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const storePath = path.join(dir, 'cliento-bookings.json');
  const reviewPath = path.join(dir, 'unlinked-review.json');
  await fsPromises.writeFile(
    storePath,
    JSON.stringify({
      version: 1,
      bookings: {
        'hair_tp::left@example.test': [
          booking('candidate-secret', { treatmentNotes: 'hemlig behandlingsnot' }),
        ],
        'hair-tp-clinic::right@example.test': [
          booking('candidate-secret', { treatmentNotes: 'hemlig behandlingsnot' }),
        ],
      },
      imports: {},
    })
  );
  await fsPromises.writeFile(reviewPath, JSON.stringify(unlinkedReview()));
  const checksum = (filePath) =>
    crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const beforeStore = checksum(storePath);
  const beforeReview = checksum(reviewPath);

  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-link-candidates.js',
      '--store',
      storePath,
      '--unlinked-review',
      reviewPath,
      '--expected-total',
      '2',
      '--expected-unlinked',
      '0',
    ],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(checksum(storePath), beforeStore);
  assert.equal(checksum(reviewPath), beforeReview);
  assert.equal(result.stdout.includes('candidate-secret'), false);
  assert.equal(result.stdout.includes('hemlig behandlingsnot'), false);
  const report = JSON.parse(result.stdout);
  assert.equal(report.cohort.candidateCount, 1);
  assert.equal(report.zeroWrites, true);
});

test('sidecar-ledgerkontraktet låser append-only tillståndskedja och alla nuvarande writes', () => {
  const contractPath = path.resolve(
    __dirname,
    '../../docs/strategy/cliento-link-sidecar-ledger-contract.v1.json'
  );
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  assert.deepEqual(contract.states, [
    'proposed',
    'approved',
    'active',
    'revoked',
    'superseded',
  ]);
  assert.deepEqual(contract.transitions.proposed, ['approved']);
  assert.deepEqual(contract.transitions.approved, ['active']);
  assert.deepEqual(contract.transitions.active, ['revoked', 'superseded']);
  assert.equal(contract.storage.mode, 'append_only_sidecar');
  assert.equal(contract.storage.deleteAllowed, false);
  assert.equal(contract.projection.active, true);
  assert.equal(contract.projection.approved, false);
  assert.equal(contract.failClosed.unlinkedReviewPopulation, 11472);
  assert.equal(contract.failClosed.identityGuessingAllowed, false);
  assert.deepEqual(contract.currentGate, {
    ledgerWriteAllowed: false,
    migrationAllowed: false,
    projectionAllowed: false,
    journeyRestartAllowed: false,
  });
});
