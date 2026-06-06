'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPhase1HalsoAsset,
  isPdfAsset,
  toCatalogEntry,
} = require('../../scripts/lib/halsoHdPhase1Catalog');
const { selectBatchSlice, emptyAssetStats } = require('../../scripts/lib/halsoHdAssetBatchIngest');
const {
  isHalsoHealthDeclarationSubject,
} = require('../../src/ops/ccoHalsoHealthDeclarationParser');
const { resolveSecureStorageRoot } = require('../../scripts/lib/halsoHdLocalPdfReader');

test('isPhase1HalsoAsset accepts m365_halso PDF form/other', () => {
  assert.equal(
    isPhase1HalsoAsset({
      sourceSystem: 'm365_halso',
      category: 'other',
      mimeType: 'application/pdf',
      originalFileName: 'Halso HD.pdf',
    }),
    true
  );
});

test('isPhase1HalsoAsset rejects injektions-journal filename', () => {
  assert.equal(
    isPhase1HalsoAsset({
      sourceSystem: 'm365_halso',
      category: 'other',
      mimeType: 'application/pdf',
      originalFileName: 'Injektions-journal patient.pdf',
    }),
    false
  );
});

test('isPhase1HalsoAsset rejects m365_halso journal category', () => {
  assert.equal(
    isPhase1HalsoAsset({
      sourceSystem: 'm365_halso',
      category: 'journal',
      mimeType: 'application/pdf',
    }),
    false
  );
});

test('isPdfAsset detects pdf mime and extension', () => {
  assert.equal(isPdfAsset({ mimeType: 'application/pdf' }), true);
  assert.equal(isPdfAsset({ originalFileName: 'x.PDF' }), true);
  assert.equal(isPdfAsset({ mimeType: 'image/jpeg' }), false);
});

test('toCatalogEntry strips to safe index fields', () => {
  const entry = toCatalogEntry({
    id: 'a1',
    patientId: 'p1',
    sourceSystem: 'm365_halso',
    checksum: 'abc',
    storageKey: 'k1',
  });
  assert.equal(entry.assetId, 'a1');
  assert.equal(entry.patientId, 'p1');
});

test('Phase 1 batch slice windows', () => {
  const entries = Array.from({ length: 120 }, (_, i) => ({ assetId: String(i) }));
  assert.equal(selectBatchSlice(entries, { batch: 2, batchSize: 50 }).length, 50);
  assert.equal(selectBatchSlice(entries, { batch: 3, batchSize: 50 })[0].assetId, '100');
});

test('emptyAssetStats starts at zero', () => {
  const stats = emptyAssetStats();
  assert.equal(stats.processed, 0);
  assert.equal(stats.pdfOk, 0);
});

test('HD parser excludes injektions-journal subject', () => {
  assert.equal(isHalsoHealthDeclarationSubject('[Injektions-journal/Webb] Test'), false);
  assert.equal(isHalsoHealthDeclarationSubject('[Hälsodeklaration/Webb] Test'), true);
});

test('resolveSecureStorageRoot honors explicit env override', () => {
  const prev = process.env.ARCANA_CCO_SECURE_STORAGE_ROOT;
  process.env.ARCANA_CCO_SECURE_STORAGE_ROOT = '/tmp/halso-secure-test';
  assert.equal(resolveSecureStorageRoot(), '/tmp/halso-secure-test');
  if (prev === undefined) delete process.env.ARCANA_CCO_SECURE_STORAGE_ROOT;
  else process.env.ARCANA_CCO_SECURE_STORAGE_ROOT = prev;
});
