'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { payloadChecksums } = require('../../src/ops/clientoCrossTenantCoverage');
const { createClientoLinkSidecarLedger } = require('../../src/ops/clientoLinkSidecarLedger');

const REPO_ROOT = path.resolve(__dirname, '../..');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileChecksum(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function booking(tenantId, bookingId, overrides = {}) {
  return {
    bookingId,
    customerEmail: `${bookingId}@example.test`,
    status: 'completed',
    startsAt: '2026-07-18T08:00:00.000Z',
    endsAt: '2026-07-18T08:30:00.000Z',
    durationMinutes: 30,
    serviceLabel: 'Fysisk konsultation',
    bookingNotes: 'booking note',
    customerMessage: '',
    internalNotes: '',
    treatmentNotes: '',
    notes: '',
    source: 'cliento_csv',
    ...overrides,
    tenantId,
  };
}

function sourceRef(tenantId, sourceBooking) {
  const checksums = payloadChecksums(sourceBooking);
  return {
    tenantId,
    bookingId: sourceBooking.bookingId,
    sourceSnapshotChecksum: sha256(`snapshot:${tenantId}:${sourceBooking.bookingId}`),
    coreChecksum: checksums.coreChecksum,
    notesChecksum: checksums.notesChecksum,
  };
}

async function writeStore(filePath, bookings) {
  const buckets = {};
  for (const item of bookings) {
    const key = `${item.tenantId}::${item.customerEmail || `unlinked:${item.bookingId}`}`;
    buckets[key] ||= [];
    const { tenantId: _tenantId, ...stored } = item;
    buckets[key].push(stored);
  }
  await fsPromises.writeFile(
    filePath,
    JSON.stringify({ version: 1, bookings: buckets, imports: {} }, null, 2)
  );
}

async function writeApprovedLedger(filePath, left, right) {
  const ledger = await createClientoLinkSidecarLedger({
    filePath,
    gates: { ledgerWriteAllowed: true, activationAllowed: false },
    clock: (() => {
      let tick = 0;
      return () => `2026-07-18T08:0${tick++}:00.000Z`;
    })(),
    randomUUID: (() => {
      let tick = 0;
      return () => `00000000-0000-4000-8000-${String(++tick).padStart(12, '0')}`;
    })(),
  });
  const refs = [sourceRef(left.tenantId, left), sourceRef(right.tenantId, right)];
  const actor = { staffId: 'owner-1', role: 'OWNER', tenantId: 'hair-tp-clinic' };
  const evidence = [{ type: 'test', ref: 'masked-fixture', checksum: sha256('evidence') }];
  const proposed = await ledger.propose({
    linkId: 'link-approved-1',
    sourceRefs: refs,
    evidence,
    actor,
    idempotencyKey: 'propose-1',
    reasonCode: 'exact_duplicate_candidate',
  });
  await ledger.transition(proposed.linkId, 'approved', {
    expectedPreviousEventId: proposed.ledgerEventId,
    currentSourceRefs: refs,
    canonicalPatientId: 'canonical-patient-1',
    canonicalEncounterId: null,
    linkType: 'exact_booking_duplicate',
    patientResolution: {
      verified: true,
      method: 'unique_identity_match',
      candidateCount: 1,
      canonicalPatientId: 'canonical-patient-1',
      evidenceChecksum: sha256('patient-resolution'),
    },
    evidence,
    actor,
    idempotencyKey: 'approve-1',
    reasonCode: 'historical_booking_without_encounter',
  });
}

test('historical shadow coverage CLI emits masked read-only totals and preserves inputs', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-shadow-coverage-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const bookingsPath = path.join(dir, 'cliento-bookings.json');
  const ledgerPath = path.join(dir, 'cliento-link-sidecar-ledger.jsonl');
  const reviewPath = path.join(dir, 'unlinked-review.json');

  const approvedLeft = booking('hair_tp', 'approved-1', {
    internalNotes: 'left internal',
    treatmentNotes: 'shared treatment',
    customerEmail: 'same@example.test',
  });
  const approvedRight = booking('hair-tp-clinic', 'approved-1', {
    internalNotes: 'left internal',
    treatmentNotes: 'shared treatment',
    customerEmail: 'same@example.test',
  });
  const exactUnapprovedLeft = booking('hair_tp', 'exact-unapproved');
  const exactUnapprovedRight = booking('hair-tp-clinic', 'exact-unapproved');
  const conflictLeft = booking('hair_tp', 'conflict-1', { status: 'completed' });
  const conflictRight = booking('hair-tp-clinic', 'conflict-1', { status: 'cancelled' });
  const oneSidedLeft = booking('hair_tp', 'left-only');

  await writeStore(bookingsPath, [
    approvedLeft,
    approvedRight,
    exactUnapprovedLeft,
    exactUnapprovedRight,
    conflictLeft,
    conflictRight,
    oneSidedLeft,
  ]);
  await writeApprovedLedger(ledgerPath, approvedLeft, approvedRight);
  await fsPromises.writeFile(
    reviewPath,
    JSON.stringify({
      rows: [
        { bookingId: 'masked-source-hidden', reasonCode: 'missing_identity' },
        { bookingId: 'another-hidden', reasonCode: 'identity_collision' },
      ],
    })
  );

  const beforeBookings = fileChecksum(bookingsPath);
  const beforeLedger = fileChecksum(ledgerPath);
  const beforeReview = fileChecksum(reviewPath);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-historical-shadow-coverage.js',
      '--bookings',
      bookingsPath,
      '--ledger',
      ledgerPath,
      '--unlinked-review',
      reviewPath,
      '--expected-bookings-sha256',
      beforeBookings,
      '--expected-ledger-sha256',
      beforeLedger,
      '--expected-unlinked-review-sha256',
      beforeReview,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.rawIdentifiersEmitted, false);
  assert.equal(report.approvedShadow.links, 1);
  assert.equal(report.approvedShadow.uniqueCustomers, 1);
  assert.equal(report.approvedShadow.sourceRecords.total, 2);
  assert.equal(report.approvedShadow.noteSegments.fields.internalNotes.sourceRecordsWithValue, 2);
  assert.equal(report.approvedShadow.noteSegments.fields.treatmentNotes.sourceRecordsWithValue, 2);
  assert.match(report.approvedShadow.perCustomerMasked[0].customerRef, /^sha256:[a-f0-9]{16}$/);
  assert.equal(report.remainingSeparate.bookingIds.exact_duplicate_unapproved, 1);
  assert.equal(report.remainingSeparate.bookingIds.conflict, 1);
  assert.equal(report.remainingSeparate.bookingIds.one_sided_left, 1);
  assert.equal(report.remainingSeparate.unlinkedReview.uniqueMaskedBookingRefs, 2);
  assert.equal(JSON.stringify(report).includes('canonical-patient-1'), false);
  assert.equal(JSON.stringify(report).includes('approved-1'), false);
  assert.equal(fileChecksum(bookingsPath), beforeBookings);
  assert.equal(fileChecksum(ledgerPath), beforeLedger);
  assert.equal(fileChecksum(reviewPath), beforeReview);
});

test('historical shadow coverage CLI fails closed without expected checksums', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-shadow-coverage-fail-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const bookingsPath = path.join(dir, 'cliento-bookings.json');
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  await writeStore(bookingsPath, [booking('hair_tp', 'left-only')]);
  await fsPromises.writeFile(ledgerPath, '');

  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-historical-shadow-coverage.js',
      '--bookings',
      bookingsPath,
      '--ledger',
      ledgerPath,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--expected-bookings-sha256 krävs/);
});

test('historical shadow coverage CLI rejects checksum drift before reading ledger semantics', async (t) => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'arcana-shadow-coverage-drift-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const bookingsPath = path.join(dir, 'cliento-bookings.json');
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  await writeStore(bookingsPath, [booking('hair_tp', 'left-only')]);
  await fsPromises.writeFile(ledgerPath, '');

  const result = spawnSync(
    process.execPath,
    [
      'scripts/report-cliento-historical-shadow-coverage.js',
      '--bookings',
      bookingsPath,
      '--ledger',
      ledgerPath,
      '--expected-bookings-sha256',
      '0'.repeat(64),
      '--expected-ledger-sha256',
      fileChecksum(ledgerPath),
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /bookings checksum mismatch/);
});
