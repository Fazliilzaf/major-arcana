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

test('live registry covers all 60 live catalog types (pending excluded)', () => {
  const ids = listLiveRegistryIds();
  assert.equal(ids.length, 60);
  // hud-dokumenten inkopplade 2026-07-19 (ägarbeslut: allt ska vara kopplat)
  assert.ok(ids.includes('hyalase_info'));
  assert.ok(ids.includes('botulinum_info'));
  assert.ok(ids.includes('ordination_recept'));
  // ORD-133: Curatiio-beskrivningar + offerter
  assert.ok(ids.includes('curatiio_botox_info'));
  assert.ok(ids.includes('offert_botox'));
  assert.ok(ids.includes('offert_op'));
  // ORD-141 rad 1: fyra för-/eftervård live
  for (const id of ['forberedelse_tp', 'eftervard_tp', 'forberedelse_curatiio', 'eftervard_curatiio']) {
    assert.ok(ids.includes(id), `${id} ska vara live`);
  }
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
  assert.equal(manifest.length, 60);
  const missing = manifest.filter((row) => !row.exists);
  assert.deepEqual(missing, []);
});

test('ORD-141 rad 1: per-rad sökväg — public-rad löser till public/, plain string faller tillbaka på PREVIEW_ROOT', () => {
  const { resolveLiveDocumentAbsolutePath, PREVIEW_ROOT } = require('../../src/ops/patientDocumentLiveRegistry');
  const path = require('node:path');
  const ROOT = path.resolve(__dirname, '../..');

  // Fallback: en rad utan sökväg (plain string) löser till PREVIEW_ROOT.
  assert.equal(
    resolveLiveDocumentAbsolutePath('haelso_tp_sve'),
    path.join(PREVIEW_ROOT, 'steg3-halsodeklaration-final-demo.html')
  );
  // Per-rad sökväg: för-/eftervård löser till public/ (INTE PREVIEW_ROOT).
  assert.equal(
    resolveLiveDocumentAbsolutePath('forberedelse_tp'),
    path.join(ROOT, 'public', 'patientinformation-hartransplantation-dhi-prp-minimal.html')
  );
  assert.equal(
    resolveLiveDocumentAbsolutePath('eftervard_curatiio'),
    path.join(ROOT, 'public', 'patientinformation-ogonlocksplastik-curatiio.html')
  );
});

test('pending-varianter (ORD-137 §1 / ORD-139 §1) är inte live ännu', () => {
  const ids = listLiveRegistryIds();
  for (const pendingId of ['auto_medical_finance_curatiio', 'journal_estetik_follow']) {
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
