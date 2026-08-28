'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listLiveRegistryIds,
  liveDocumentExists,
  resolveLiveDocumentRelativePath,
  buildLiveManifest,
  listStaffLiveRegistryIds,
  isStaffLiveRegistry,
  isPendingType,
  OFFERT_SLUG,
} = require('../../src/ops/patientDocumentLiveRegistry');

test('live registry covers all 56 live catalog types (pending excluded)', () => {
  const ids = listLiveRegistryIds();
  assert.equal(ids.length, 56);
  // hud-dokumenten inkopplade 2026-07-19 (ägarbeslut: allt ska vara kopplat)
  assert.ok(ids.includes('hyalase_info'));
  assert.ok(ids.includes('botulinum_info'));
  assert.ok(ids.includes('ordination_recept'));
  // ORD-133: Curatiio-beskrivningar + offerter
  assert.ok(ids.includes('curatiio_botox_info'));
  assert.ok(ids.includes('offert_botox'));
  assert.ok(ids.includes('offert_op'));
});

test('every registry resolves to an on-disk final-demo html', () => {
  const ids = listLiveRegistryIds();
  for (const registryId of ids) {
    if (OFFERT_SLUG[registryId]) {
      assert.ok(liveDocumentExists(registryId, { phase: 5 }), `${registryId} phase 5 saknas`);
      assert.ok(liveDocumentExists(registryId, { phase: 7 }), `${registryId} phase 7 saknas`);
      continue;
    }
    assert.ok(liveDocumentExists(registryId), `${registryId} saknar live HTML`);
    assert.ok(resolveLiveDocumentRelativePath(registryId), `${registryId} saknar mapping`);
  }
});

test('offert_tp steg7 uses v6 kundkort demo', () => {
  assert.equal(
    resolveLiveDocumentRelativePath('offert_tp', { phase: 7 }),
    'steg7-v6-kundkort-final-demo.html'
  );
});

test('buildLiveManifest marks all documents existing', () => {
  const manifest = buildLiveManifest();
  assert.equal(manifest.length, 56);
  const missing = manifest.filter((row) => !row.exists);
  assert.deepEqual(missing, []);
});

test('pending-varianter (ORD-137 §1/§5) är inte live ännu', () => {
  const ids = listLiveRegistryIds();
  for (const pendingId of [
    'auto_medical_finance_curatiio',
    'journal_estetik_follow_4',
    'journal_estetik_follow_8',
    'journal_estetik_follow_12',
  ]) {
    assert.ok(!ids.includes(pendingId), `${pendingId} ska vara exkluderad ur live-registret`);
  }
  assert.ok(isPendingType({ legalReviewStatus: 'pending' }));
  assert.ok(!isPendingType({ legalReviewStatus: 'approved' }));
  assert.ok(!isPendingType({}));
});

test('staff live registry covers B16–B24 + ordination_recept + estetik (15 types)', () => {
  const ids = listStaffLiveRegistryIds();
  assert.equal(ids.length, 15);
  assert.ok(isStaffLiveRegistry('journal_tp'));
  assert.ok(isStaffLiveRegistry('ordination_tp'));
  assert.ok(isStaffLiveRegistry('ordination_recept'));
  assert.ok(isStaffLiveRegistry('journal_estetik_botox'));
  assert.equal(isStaffLiveRegistry('haelso_tp_sve'), false);
  const manifest = buildLiveManifest();
  const staffRows = manifest.filter((row) => row.audience === 'staff');
  assert.equal(staffRows.length, 15);
});
