'use strict';

/**
 * Integration tests for src/routes/reconciliation.js.
 *
 * Covers the 5 spec scenarios from the CCO reconciliation-merge fix:
 *   1. Successful merge (200 + journal+drive transferred + secondary archived)
 *   2. Failed transfer → auto-rollback (500 + status=rolled_back)
 *   3. Server-side verify (FAIL when counts mismatch + auto-rollback)
 *   4. Accessors return real data (not the dead `_state` stubs)
 *   5. mergePatients archives instead of deletes (direct store assertion)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createReconciliationRouter } = require('../../src/routes/reconciliation');
const { createSafeMergeService } = require('../../src/migration/safeMergeService');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { createCcoMigrationIndexStore } = require('../../src/ops/ccoMigrationIndexStore');

const TENANT = 'hair-tp-clinic';
const ACTOR = { userId: 'u-owner-1', role: 'OWNER', displayName: 'Owner' };

// ── Server harness ────────────────────────────────────────────────────────

function fakeAuthStore() {
  return {
    requireAuth(req, _res, next) {
      req.auth = { tenantId: TENANT, userId: ACTOR.userId, role: ACTOR.role };
      req.currentUser = { id: ACTOR.userId };
      req.currentMembership = { tenantId: TENANT, role: ACTOR.role };
      next();
    },
    requireRole() {
      return (_req, _res, next) => next();
    },
  };
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

async function jfetch(base, method, urlPath, body) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_e) { /* ignore */ }
  return { status: res.status, body: json, raw: text };
}

// ── Fixture builder ───────────────────────────────────────────────────────

async function fixture({ patchJournalStore } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `reconc-router-${crypto.randomUUID()}-`));

  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tmp, 'patient-master.json'),
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.join(tmp, 'journal.json'),
  });
  const migrationIndexStore = await createCcoMigrationIndexStore({
    filePath: path.join(tmp, 'migration-index.json'),
  });
  const mergeService = createSafeMergeService({
    filePath: path.join(tmp, 'merge-service.json'),
  });
  await mergeService.load();

  // ── seed: two patients with different personnummer ──
  const primary = await patientMasterStore.upsertPatient({
    tenantId: TENANT,
    displayName: 'Anna Primär',
    primaryEmail: 'anna@example.com',
    primaryPhone: '+46701111111',
    personnummer: '19800101-1111',
    matchStatus: 'matched',
  });
  const secondary = await patientMasterStore.upsertPatient({
    tenantId: TENANT,
    displayName: 'Anna Sekundär',
    primaryEmail: 'anna+alt@example.com',
    primaryPhone: '+46702222222',
    personnummer: '19800101-2222',
    matchStatus: 'needs_review',
  });

  // ── seed: two drive files, one for each pnr ──
  await migrationIndexStore.replaceScanResult({
    scanMeta: { completedAt: new Date().toISOString(), zipCount: 1, badZipCount: 0 },
    files: [
      {
        id: 'file-primary-1',
        personnummer: '19800101-1111',
        fileName: 'journal-primary.pdf',
        fileType: 'journal_pdf',
        mimeType: 'application/pdf',
      },
      {
        id: 'file-secondary-1',
        personnummer: '19800101-2222',
        fileName: 'journal-secondary.pdf',
        fileType: 'journal_pdf',
        mimeType: 'application/pdf',
      },
    ],
  });

  // ── seed: journal entries on each patient ──
  await journalStore.upsertEntry(
    {
      tenantId: TENANT,
      patientId: primary.id,
      journalType: 'historical_import',
      summary: 'primary note',
    },
    { actor: ACTOR }
  );
  await journalStore.upsertEntry(
    {
      tenantId: TENANT,
      patientId: secondary.id,
      journalType: 'historical_import',
      summary: 'secondary note',
    },
    { actor: ACTOR }
  );

  // Allow tests to wrap journalStore.transferEntriesToPatient with a thrower.
  const originalTransfer = journalStore.transferEntriesToPatient;
  if (typeof patchJournalStore === 'function') {
    patchJournalStore(journalStore, { originalTransfer });
  }

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createReconciliationRouter({
      authStore: fakeAuthStore(),
      patientMasterStore,
      migrationIndexStore,
      journalStore,
      mergeService,
    })
  );

  return {
    app,
    tmp,
    stores: { patientMasterStore, journalStore, migrationIndexStore, mergeService },
    seed: { primary, secondary },
  };
}

async function previewApproveExecute(base, primary, secondary) {
  const prev = await jfetch(base, 'POST', '/api/v1/reconciliation/merge/preview', {
    primaryPatientId: primary.id,
    secondaryPatientId: secondary.id,
    primaryData: {
      patientId: primary.id,
      name: primary.displayName,
      personnummer: primary.personnummer,
      fileCount: 1,
    },
    secondaryData: {
      patientId: secondary.id,
      name: secondary.displayName,
      personnummer: secondary.personnummer,
      fileCount: 1,
    },
    filesToMove: [{ type: 'drive_file', id: 'file-secondary-1', fileName: 'journal-secondary.pdf' }],
    journalsToMove: [],
    reason: 'duplicate by email',
    confidence: 95,
  });
  assert.equal(prev.status, 200, `preview failed: ${prev.raw}`);
  const mergeId = prev.body.preview.mergeId;

  const apr = await jfetch(base, 'POST', `/api/v1/reconciliation/merge/${mergeId}/approve`);
  assert.equal(apr.status, 200, `approve failed: ${apr.raw}`);

  const exec = await jfetch(base, 'POST', `/api/v1/reconciliation/merge/${mergeId}/execute`);
  return { mergeId, exec };
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('1. successful merge: 200, journal+drive transferred, secondary archived', async () => {
  const f = await fixture();
  await withServer(f.app, async (base) => {
    const { mergeId, exec } = await previewApproveExecute(base, f.seed.primary, f.seed.secondary);
    assert.equal(exec.status, 200, `execute failed: ${exec.raw}`);
    assert.equal(exec.body.merge.status, 'completed');
    assert.equal(exec.body.merge.after.secondaryArchived, true);
    assert.equal(exec.body.merge.after.filesMovedFromSecondary, 1);
    assert.equal(exec.body.merge.after.totalFilesAfter, 2);

    // Journal entries on primary should now be 2 (was 1, +1 transferred).
    const primaryEntries = await f.stores.journalStore.listEntries({
      tenantId: TENANT,
      patientId: f.seed.primary.id,
    });
    assert.equal(primaryEntries.length, 2);

    // Drive files on primary's pnr should now be 2.
    const driveFiles = await f.stores.migrationIndexStore.getFilesForPersonnummer(
      f.seed.primary.personnummer
    );
    assert.equal(driveFiles.length, 2);

    // Secondary should NOT be deleted — must still exist, archived.
    const sec = await f.stores.patientMasterStore.getPatient({
      tenantId: TENANT,
      patientId: f.seed.secondary.id,
    });
    assert.ok(sec, 'secondary must still exist after merge');
    assert.equal(sec.matchStatus, 'merged');
    assert.equal(sec.mergedInto, f.seed.primary.id);

    // listPatients (active view) must hide it.
    const active = await f.stores.patientMasterStore.listPatients({ tenantId: TENANT });
    const stillVisible = active.patients.some((p) => p.id === f.seed.secondary.id);
    assert.equal(stillVisible, false);

    // Server-side verify should PASS now.
    const ver = await jfetch(base, 'POST', `/api/v1/reconciliation/merge/${mergeId}/verify`);
    assert.equal(ver.status, 200, `verify failed: ${ver.raw}`);
    assert.equal(ver.body.verification.status, 'PASS');
  });
});

test('2. failed transfer → auto-rollback, status=rolled_back, secondary un-archived', async () => {
  const f = await fixture({
    patchJournalStore(js, { originalTransfer }) {
      let calls = 0;
      js.transferEntriesToPatient = async (args) => {
        calls += 1;
        // First call (forward): throw to force rollback. Subsequent calls
        // (rollback's own transferBack) should succeed via the original impl.
        if (calls === 1) throw new Error('simulated transfer failure');
        return originalTransfer(args);
      };
    },
  });

  await withServer(f.app, async (base) => {
    const { mergeId, exec } = await previewApproveExecute(base, f.seed.primary, f.seed.secondary);
    assert.equal(exec.status, 500, `expected 500 on transfer fail, got ${exec.raw}`);
    assert.equal(exec.body.ok, false);
    assert.equal(exec.body.autoRollback, 'completed');
    assert.equal(exec.body.merge.status, 'rolled_back');

    // Secondary must still exist and NOT be archived (rollback un-archived).
    const sec = await f.stores.patientMasterStore.getPatient({
      tenantId: TENANT,
      patientId: f.seed.secondary.id,
    });
    assert.ok(sec, 'secondary must still exist');
    assert.notEqual(sec.matchStatus, 'merged');

    // Merge object should record the failure cleanly.
    const merge = f.stores.mergeService.getMerge(mergeId);
    assert.equal(merge.status, 'rolled_back');
    assert.equal(merge.autoRollback, 'completed');
    assert.ok(merge.failureReason);
  });
});

test('3. server-side verify recounts (does not trust client body)', async () => {
  const f = await fixture();
  await withServer(f.app, async (base) => {
    const { mergeId, exec } = await previewApproveExecute(base, f.seed.primary, f.seed.secondary);
    assert.equal(exec.status, 200);

    // Even if a malicious/buggy client sends huge counts in the body, the
    // server must ignore them and recount from the stores.
    const ver = await jfetch(base, 'POST', `/api/v1/reconciliation/merge/${mergeId}/verify`, {
      actualFileCount: 9999,
      expectedFileCount: 0,
      orphanFiles: 0,
    });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.verification.actualFileCount, 2); // real count, not 9999
    assert.equal(ver.body.verification.expectedFileCount, 2); // sum of before.primary+secondary
    assert.equal(ver.body.verification.orphanFilesAfterMerge, 0);
    assert.equal(ver.body.verification.status, 'PASS');
  });
});

test('3b. verify FAIL → 409 + auto-rollback', async () => {
  const f = await fixture();
  await withServer(f.app, async (base) => {
    const { mergeId, exec } = await previewApproveExecute(base, f.seed.primary, f.seed.secondary);
    assert.equal(exec.status, 200);

    // Simulate: a drive file gets re-pointed back to secondary's pnr behind
    // our back BEFORE verify runs (e.g. concurrent rescan). orphanFiles > 0
    // should make verify FAIL and trigger rollback.
    await f.stores.migrationIndexStore.reassignPersonnummer({
      from: f.seed.primary.personnummer,
      to: f.seed.secondary.personnummer,
    });

    const ver = await jfetch(base, 'POST', `/api/v1/reconciliation/merge/${mergeId}/verify`);
    assert.equal(ver.status, 409, `expected 409 on FAIL, got ${ver.raw}`);
    assert.equal(ver.body.ok, false);
    assert.equal(ver.body.error, 'verify_failed_rolled_back');
    assert.equal(ver.body.verification.status, 'FAIL');
    assert.equal(ver.body.rollback.ok, true);

    const merge = f.stores.mergeService.getMerge(mergeId);
    assert.equal(merge.status, 'rolled_back');
  });
});

test('4. accessors return real data (overview + duplicates + completeness)', async () => {
  const f = await fixture();
  await withServer(f.app, async (base) => {
    const overview = await jfetch(base, 'GET', '/api/v1/reconciliation/overview');
    assert.equal(overview.status, 200, overview.raw);
    assert.equal(overview.body.tenantId, TENANT);
    // The two seeded patients must appear (the old stubs returned 0). The
    // engine returns one completenessResult per patient.
    assert.ok(
      Array.isArray(overview.body.completenessResults),
      'completenessResults must be present'
    );
    assert.ok(
      overview.body.completenessResults.length >= 2,
      `expected >=2 patient results, got ${overview.body.completenessResults.length}`
    );

    const driveAudit = await jfetch(base, 'GET', '/api/v1/reconciliation/drive-audit');
    assert.equal(driveAudit.status, 200);
    assert.ok(driveAudit.body.totalFiles >= 2);

    const completeness = await jfetch(base, 'GET', '/api/v1/reconciliation/completeness');
    assert.equal(completeness.status, 200);
    // Field must reflect the real seed count, not 0.
    assert.equal(completeness.body.totalPatients, 2);
  });
});

test('5. patientMasterStore.mergePatients archives (not deletes) — direct store', async () => {
  const f = await fixture();
  const beforeBucket = await f.stores.patientMasterStore.getTenantStats({ tenantId: TENANT });
  assert.equal(beforeBucket.totalPatients, 2);

  const result = await f.stores.patientMasterStore.mergePatients({
    tenantId: TENANT,
    primaryPatientId: f.seed.primary.id,
    secondaryPatientIds: [f.seed.secondary.id],
  });
  assert.deepEqual(result.archivedPatientIds, [f.seed.secondary.id]);
  assert.deepEqual(result.removedPatientIds, [f.seed.secondary.id]); // legacy alias

  // Secondary must STILL exist (archive, not delete) — required for audit + rollback.
  const sec = await f.stores.patientMasterStore.getPatient({
    tenantId: TENANT,
    patientId: f.seed.secondary.id,
  });
  assert.ok(sec, 'secondary must remain in bucket after merge');
  assert.equal(sec.matchStatus, 'merged');
  assert.equal(sec.mergedInto, f.seed.primary.id);
  assert.ok(sec.archivedAt);

  // Active stats reflect the archive.
  const afterStats = await f.stores.patientMasterStore.getTenantStats({ tenantId: TENANT });
  assert.equal(afterStats.totalPatients, 1);
  assert.equal(afterStats.archivedPatients, 1);
});
