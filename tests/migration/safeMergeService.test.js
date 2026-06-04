'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createSafeMergeService } = require('../../src/migration/safeMergeService');

function tmpFile() {
  return path.join(os.tmpdir(), `merge-svc-${crypto.randomUUID()}.json`);
}

async function freshService() {
  const svc = createSafeMergeService({ filePath: tmpFile() });
  await svc.load();
  return svc;
}

function preview(svc, overrides = {}) {
  return svc.createMergePreview({
    primaryPatientId: 'a',
    secondaryPatientId: 'b',
    primaryData: { patientId: 'a' },
    secondaryData: { patientId: 'b' },
    reason: 'test',
    confidence: 90,
    ...overrides,
  });
}

test('konflikt (olika telefon) blockerar approval; ren preview kan godkännas', async () => {
  const svc = await freshService();
  const conflicting = preview(svc, {
    primaryData: { patientId: 'a', phone: '0701111111' },
    secondaryData: { patientId: 'b', phone: '0702222222' },
  });
  assert.ok(conflicting.conflicts.length >= 1);
  const blocked = await svc.approveMerge(conflicting.mergeId, { approvedBy: 'owner' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'unresolved_conflicts');

  const clean = preview(svc, { secondaryPatientId: 'c', secondaryData: { patientId: 'c' } });
  const ok = await svc.approveMerge(clean.mergeId, { approvedBy: 'owner' });
  assert.equal(ok.ok, true);
  assert.equal(ok.merge.status, 'approved');
});

test('execute kräver approval först', async () => {
  const svc = await freshService();
  const p = preview(svc);
  const res = await svc.executeMerge(p.mergeId, { transferFn: async () => ({ ok: true }) });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'merge_not_approved');
});

test('lyckad execute → completed + manifest + after', async () => {
  const svc = await freshService();
  const p = preview(svc);
  await svc.approveMerge(p.mergeId, { approvedBy: 'owner' });
  const res = await svc.executeMerge(p.mergeId, {
    transferFn: async () => ({ ok: true, totalFilesAfter: 17, filesMovedFromSecondary: 7, secondaryArchived: true, redirectCreated: true }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.merge.status, 'completed');
  assert.ok(res.merge.manifest);
  assert.equal(res.merge.after.secondaryArchived, true);
  // manifest.moved must reflect ACTUAL moved counts (from transferFn), not the plan
  assert.equal(res.merge.manifest.moved.filesMovedFromSecondary, 7);
  assert.equal(res.merge.manifest.moved.totalFilesAfter, 17);
  // the plan is preserved separately for reference
  assert.ok(res.merge.manifest.planned);
});

test('misslyckad transfer MED rollbackFn → auto-rollback körs, status rolled_back', async () => {
  const svc = await freshService();
  const p = preview(svc);
  await svc.approveMerge(p.mergeId, { approvedBy: 'owner' });
  let rolledBack = false;
  const res = await svc.executeMerge(p.mergeId, {
    transferFn: async () => { throw new Error('transfer kraschade'); },
    rollbackFn: async () => { rolledBack = true; },
  });
  assert.equal(res.ok, false);
  assert.equal(rolledBack, true, 'rollbackFn ska köras automatiskt vid fel');
  assert.equal(res.autoRollback, 'completed');
  assert.equal(res.merge.status, 'rolled_back');
});

test('misslyckad transfer UTAN rollbackFn → status failed (partiellt döljs inte som success)', async () => {
  const svc = await freshService();
  const p = preview(svc);
  await svc.approveMerge(p.mergeId, { approvedBy: 'owner' });
  const res = await svc.executeMerge(p.mergeId, { transferFn: async () => { throw new Error('boom'); } });
  assert.equal(res.ok, false);
  assert.equal(res.merge.status, 'failed');
  assert.equal(res.autoRollback, 'not_attempted');
});

test('verifyMerge: PASS när counts stämmer, FAIL när filer saknas', async () => {
  const svc = await freshService();
  const p = preview(svc);
  await svc.approveMerge(p.mergeId, { approvedBy: 'owner' });
  await svc.executeMerge(p.mergeId, { transferFn: async () => ({ ok: true }) });
  assert.equal(svc.verifyMerge(p.mergeId, { expectedFileCount: 10, actualFileCount: 10, orphanFiles: 0 }).verification.status, 'PASS');
  assert.equal(svc.verifyMerge(p.mergeId, { expectedFileCount: 10, actualFileCount: 9, orphanFiles: 0 }).verification.status, 'FAIL');
});

test('audit-logg fångar preview, approve och completed', async () => {
  const svc = await freshService();
  const p = preview(svc);
  await svc.approveMerge(p.mergeId, { approvedBy: 'owner' });
  await svc.executeMerge(p.mergeId, { transferFn: async () => ({ ok: true }) });
  const actions = svc.getAuditLog({ mergeId: p.mergeId }).map((e) => e.action);
  assert.ok(actions.includes('merge_preview_created'));
  assert.ok(actions.includes('merge_approved'));
  assert.ok(actions.includes('merge_completed'));
});
