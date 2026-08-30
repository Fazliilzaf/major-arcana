'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listCatalogedRegistryIds,
  liveDocumentExists,
  resolveLiveDocumentRelativePath,
  buildCatalogedManifest,
  buildCatalogSummary,
  listStaffLiveRegistryIds,
  isStaffLiveRegistry,
  isPendingType,
  OFFERT_SLUG,
} = require('../../src/ops/patientDocumentLiveRegistry');

test('cataloged registry covers all 60 types with a file (62 i katalogen, 2 utan fil)', () => {
  const ids = listCatalogedRegistryIds();
  assert.equal(ids.length, 60);
  // hud-dokumenten inkopplade 2026-07-19 (ägarbeslut: allt ska vara kopplat)
  assert.ok(ids.includes('hyalase_info'));
  assert.ok(ids.includes('botulinum_info'));
  assert.ok(ids.includes('ordination_recept'));
  // ORD-133: Curatiio-beskrivningar + offerter
  assert.ok(ids.includes('curatiio_botox_info'));
  assert.ok(ids.includes('offert_botox'));
  assert.ok(ids.includes('offert_op'));
  // ORD-141 rad 1: fyra för-/eftervård ÄR cataloged (har fil via per-rad sökväg)
  // men är pending → inte sendable. En rad UTAN fil är inte cataloged alls.
  for (const id of ['auto_medical_finance_curatiio', 'journal_estetik_follow']) {
    assert.ok(!ids.includes(id), `${id} ska sakna fil och därmed inte vara cataloged`);
  }
});

test('buildCatalogSummary redovisar total/cataloged/sendable ärligt', () => {
  // total = katalogstorlek (62) · cataloged = har en fil på disk (60) ·
  // sendable = legalReviewStatus === 'approved' (0 — alla är pending).
  assert.deepEqual(buildCatalogSummary(), { total: 62, cataloged: 60, sendable: 0 });
});

test('every registry resolves to an on-disk final-demo html', () => {
  const ids = listCatalogedRegistryIds();
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

test('buildCatalogedManifest: alla 60 rader är cataloged, ingen är sendable (pending)', () => {
  const manifest = buildCatalogedManifest();
  assert.equal(manifest.length, 60);
  assert.deepEqual(
    manifest.filter((row) => !row.cataloged),
    [],
    'alla rader i manifestet ska ha en fil (cataloged)'
  );
  // ORD-141 rad 1: två oberoende egenskaper redovisas per rad.
  assert.ok(manifest.every((row) => row.legalReviewStatus === 'pending'));
  assert.ok(manifest.every((row) => row.sendable === false));
  assert.ok(manifest.every((row) => row.exists === true));
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

test('isPendingType är en ren predikat — saknat fält är varken pending eller approved', () => {
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
  const manifest = buildCatalogedManifest();
  const staffRows = manifest.filter((row) => row.audience === 'staff');
  assert.equal(staffRows.length, 15);
});
