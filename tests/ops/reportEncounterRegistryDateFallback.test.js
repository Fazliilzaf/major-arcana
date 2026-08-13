'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const {
  parseArgs,
  classifyAsset,
  maskPatientId,
} = require('../../scripts/report-encounter-registry-date-fallback');

const BASE_ASSET = Object.freeze({
  patientId: 'pat-fragmented-001',
  sourceSystem: 'drive',
  sourceRecordId: 'src-001',
  originalDriveFileId: 'abc123',
  originalDrivePath: '/Hair TP/2026/example.pdf',
  originalFileName: 'example.pdf',
  storageProvider: 'local',
  storageKey: 'data/cco-storage/pat-fragmented-001/example.pdf',
  mimeType: 'application/pdf',
  category: 'journal',
  fileSize: 1024,
  importedBy: 'system',
  importRunId: 'run-001',
});

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-encounter-fallback-'));
  const filePath = path.join(dir, 'assets.json');
  const store = await createCcoPatientAssetStore({ filePath });
  return { store, dir };
}

test('maskPatientId keeps only start/end of the id', () => {
  assert.equal(maskPatientId('patient-1234567890'), 'pati***7890');
  assert.equal(maskPatientId('short'), 'sh***');
  assert.equal(maskPatientId(''), '');
});

test('parseArgs requires an explicit --patient-assets-store path', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--patient-assets-store <explicit path>/);
});

test('classifyAsset: journal asset with a real documentDate is not flagged as fallback', () => {
  const classified = classifyAsset({
    category: 'journal',
    documentDate: '2026-01-15',
    importedAt: '2026-02-20T10:00:00.000Z',
    originalFileName: 'Journal-FUE.pdf',
  });
  assert.equal(classified.branch, 'journal_asset');
  assert.equal(classified.usedImportedAtFallback, false);
  assert.equal(classified.date, '2026-01-15');
});

test('classifyAsset: journal asset without documentDate falls back to importedAt', () => {
  const classified = classifyAsset({
    category: 'journal',
    importedAt: '2026-02-20T10:00:00.000Z',
    originalFileName: 'Journal-FUE.pdf',
  });
  assert.equal(classified.usedImportedAtFallback, true);
  assert.equal(classified.date, '2026-02-20');
});

test('classifyAsset: pipedrive smartdoc asset outside the qualifying status/section is not classified', () => {
  const classified = classifyAsset({
    sourceSystem: 'pipedrive_import',
    status: 'DISCOVERED',
    mimeType: 'application/pdf',
    importedAt: '2026-02-20T10:00:00.000Z',
  });
  assert.equal(classified, null);
});

test('end-to-end: 6 pipedrive smartdocs sharing one visit but importedAt-only fragment into 6 distinct dates', async () => {
  const { store, dir } = await makeStore();
  const importDates = [
    '2026-01-01T09:00:00.000Z',
    '2026-01-03T09:00:00.000Z',
    '2026-01-05T09:00:00.000Z',
    '2026-01-08T09:00:00.000Z',
    '2026-01-12T09:00:00.000Z',
    '2026-01-20T09:00:00.000Z',
  ];
  for (const [index, importedAt] of importDates.entries()) {
    await store.addAsset({
      ...BASE_ASSET,
      sourceSystem: 'pipedrive_import',
      sourceRecordId: `pd-${index}`,
      category: 'other',
      status: 'VISIBLE_ON_PATIENT_CARD',
      patientCardSection: 'journal',
      importedAt,
      originalFileName: `FUE Operation ${index}.pdf`,
    });
  }

  const items = store.listItemsForEnrichment();
  const groups = new Map();
  for (const asset of items) {
    const classified = classifyAsset(asset);
    if (!classified || !classified.date) continue;
    const key = `${asset.patientId}::${classified.encounterType}`;
    if (!groups.has(key)) {
      groups.set(key, { assetCount: 0, fallbackCount: 0, dates: new Set() });
    }
    const g = groups.get(key);
    g.assetCount += 1;
    if (classified.usedImportedAtFallback) g.fallbackCount += 1;
    g.dates.add(classified.date);
  }

  assert.equal(groups.size, 1);
  const [group] = groups.values();
  assert.equal(group.assetCount, 6);
  assert.equal(group.fallbackCount, 6);
  assert.equal(group.dates.size, 6, 'six different import timestamps fragment into six dates');

  await fs.rm(dir, { recursive: true, force: true });
});

test('end-to-end: assets sharing the same real documentDate collapse into a single date', async () => {
  const { store, dir } = await makeStore();
  for (let index = 0; index < 4; index += 1) {
    await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: `journal-${index}`,
      category: 'journal',
      documentDate: '2026-03-10',
      importedAt: `2026-03-1${index}T09:00:00.000Z`,
      originalFileName: `Journal-FUE-${index}.pdf`,
    });
  }

  const items = store.listItemsForEnrichment();
  const dates = new Set();
  let fallbackCount = 0;
  for (const asset of items) {
    const classified = classifyAsset(asset);
    if (!classified || !classified.date) continue;
    dates.add(classified.date);
    if (classified.usedImportedAtFallback) fallbackCount += 1;
  }

  assert.equal(dates.size, 1, 'a genuine single visit should not fragment');
  assert.equal(fallbackCount, 0);

  await fs.rm(dir, { recursive: true, force: true });
});
