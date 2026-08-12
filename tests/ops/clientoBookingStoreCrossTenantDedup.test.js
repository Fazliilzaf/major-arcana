'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createClientoBookingStore } = require('../../src/ops/clientoBookingStore');

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
    })),
  };
}

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cross-tenant-dedup-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  return { store, dir };
}

test('mergeCrossTenantDuplicateBookings dry-run reports without writing', async () => {
  const { store, dir } = await makeStore();
  const booking = {
    bookingId: 'B1',
    customerEmail: 'match@example.test',
    status: 'confirmed',
    startsAt: '2026-01-01T10:00:00Z',
  };
  await store.importBatch({ tenantId: 'hair_tp', bookings: [booking] });
  await store.importBatch({ tenantId: 'hair-tp-clinic', bookings: [booking] });

  const report = await store.mergeCrossTenantDuplicateBookings({
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    canonicalTenant: 'hair-tp-clinic',
    unlinkedReview: unlinkedReview([]),
    expectedTotal: 2,
    expectedUnlinkedReviewCount: 0,
    commit: false,
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.zeroWrites, true);
  assert.equal(report.gate.status, 'dry_run_ready');
  assert.equal(report.candidateCount, 1);
  assert.equal(report.mergedCount, 1);
  assert.equal(store.listAllBookings({ tenantId: 'hair_tp', exactTenant: true }).length, 1);
  assert.equal(store.listAllBookings({ tenantId: 'hair-tp-clinic', exactTenant: true }).length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('mergeCrossTenantDuplicateBookings commit merges into canonical tenant and removes the other copy', async () => {
  const { store, dir } = await makeStore();
  const shared = {
    bookingId: 'B1',
    customerEmail: 'match@example.test',
    status: 'confirmed',
    startsAt: '2026-01-01T10:00:00Z',
  };
  await store.importBatch({ tenantId: 'hair_tp', bookings: [shared] });
  await store.importBatch({ tenantId: 'hair-tp-clinic', bookings: [shared] });

  const report = await store.mergeCrossTenantDuplicateBookings({
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    canonicalTenant: 'hair-tp-clinic',
    unlinkedReview: unlinkedReview([]),
    expectedTotal: 2,
    expectedUnlinkedReviewCount: 0,
    commit: true,
  });

  assert.equal(report.gate.status, 'merged');
  assert.equal(report.mergedCount, 1);

  const canonical = store.listAllBookings({ tenantId: 'hair-tp-clinic', exactTenant: true });
  const other = store.listAllBookings({ tenantId: 'hair_tp', exactTenant: true });
  assert.equal(canonical.length, 1);
  assert.equal(other.length, 0);
  assert.equal(canonical[0].bookingId, 'B1');
  // ORD-101: aktivering rör aldrig patientId/encounterId.
  assert.equal(canonical[0].patientId, '');
  assert.equal(canonical[0].encounterId, '');

  await fs.rm(dir, { recursive: true, force: true });
});

test('mergeCrossTenantDuplicateBookings excludes one-sided, mismatched and unlinked-review bookings', async () => {
  const { store, dir } = await makeStore();
  const shared = {
    bookingId: 'MATCH',
    customerEmail: 'match@example.test',
    status: 'confirmed',
    startsAt: '2026-01-01T10:00:00Z',
  };
  await store.importBatch({ tenantId: 'hair_tp', bookings: [shared] });
  await store.importBatch({ tenantId: 'hair-tp-clinic', bookings: [shared] });

  // One-sided: only in hair_tp.
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'ONESIDED',
        customerEmail: 'only-left@example.test',
        status: 'confirmed',
        startsAt: '2026-01-02T10:00:00Z',
      },
    ],
  });

  // Core mismatch: different status on each side.
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'MISMATCH',
        customerEmail: 'mismatch@example.test',
        status: 'confirmed',
        startsAt: '2026-01-03T10:00:00Z',
      },
    ],
  });
  await store.importBatch({
    tenantId: 'hair-tp-clinic',
    bookings: [
      {
        bookingId: 'MISMATCH',
        customerEmail: 'mismatch@example.test',
        status: 'cancelled',
        startsAt: '2026-01-03T10:00:00Z',
      },
    ],
  });

  // In the fail-closed unlinked review — must never be merged even if it
  // otherwise qualifies.
  const flagged = {
    bookingId: 'FLAGGED',
    customerEmail: 'flagged@example.test',
    status: 'confirmed',
    startsAt: '2026-01-04T10:00:00Z',
  };
  await store.importBatch({ tenantId: 'hair_tp', bookings: [flagged] });
  await store.importBatch({ tenantId: 'hair-tp-clinic', bookings: [flagged] });

  const totalOccurrences =
    store.listAllBookings({ tenantId: 'hair_tp', exactTenant: true }).length +
    store.listAllBookings({ tenantId: 'hair-tp-clinic', exactTenant: true }).length;

  const report = await store.mergeCrossTenantDuplicateBookings({
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    canonicalTenant: 'hair-tp-clinic',
    unlinkedReview: unlinkedReview(['FLAGGED']),
    expectedTotal: totalOccurrences,
    expectedUnlinkedReviewCount: 1,
    commit: true,
  });

  assert.equal(report.gate.status, 'merged');
  assert.equal(report.mergedCount, 1);
  assert.equal(report.exclusions.oneSided, 1);
  assert.equal(report.exclusions.coreChecksumMismatch, 1);
  assert.equal(report.exclusions.unlinkedReview, 1);

  // FLAGGED must survive untouched in both tenants, exactly as before.
  assert.equal(
    store
      .listAllBookings({ tenantId: 'hair_tp', exactTenant: true })
      .some((b) => b.bookingId === 'FLAGGED'),
    true
  );
  assert.equal(
    store
      .listAllBookings({ tenantId: 'hair-tp-clinic', exactTenant: true })
      .some((b) => b.bookingId === 'FLAGGED'),
    true
  );
  // MISMATCH must survive untouched in both tenants.
  assert.equal(
    store
      .listAllBookings({ tenantId: 'hair_tp', exactTenant: true })
      .some((b) => b.bookingId === 'MISMATCH'),
    true
  );
  assert.equal(
    store
      .listAllBookings({ tenantId: 'hair-tp-clinic', exactTenant: true })
      .some((b) => b.bookingId === 'MISMATCH'),
    true
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('mergeCrossTenantDuplicateBookings blocks fail-closed on population mismatch', async () => {
  const { store, dir } = await makeStore();
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [{ bookingId: 'B1', customerEmail: 'a@example.test', status: 'confirmed' }],
  });

  const report = await store.mergeCrossTenantDuplicateBookings({
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    canonicalTenant: 'hair-tp-clinic',
    unlinkedReview: unlinkedReview([]),
    expectedTotal: 999,
    expectedUnlinkedReviewCount: 0,
    commit: true,
  });

  assert.equal(report.gate.status, 'blocked_data_invariant');
  assert.ok(report.gate.invariantFailures.includes('population_total_mismatch'));
  assert.equal(report.mergedCount, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('mergeCrossTenantDuplicateBookings rejects same tenant on both sides', async () => {
  const { store, dir } = await makeStore();
  await assert.rejects(() =>
    store.mergeCrossTenantDuplicateBookings({
      leftTenant: 'hair_tp',
      rightTenant: 'hair_tp',
      canonicalTenant: 'hair_tp',
      unlinkedReview: unlinkedReview([]),
      expectedTotal: 0,
      expectedUnlinkedReviewCount: 0,
      commit: true,
    })
  );
  await fs.rm(dir, { recursive: true, force: true });
});
