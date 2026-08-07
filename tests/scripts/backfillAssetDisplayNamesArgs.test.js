'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  needsBackfill,
  looksTechnical,
  isAutoSafeNamingPatch,
  backfillAssetDisplayNames,
} = require('../../scripts/backfill-asset-display-names');

test('parseArgs defaults to dry-run', () => {
  const args = parseArgs([]);
  assert.equal(args.dryRun, true);
  assert.equal(args.commit, false);
  assert.equal(args.limit, 0);
  assert.equal(args.offset, 0);
  assert.equal(args.batchSize, 100);
});

test('parseArgs parses commit and limits', () => {
  const args = parseArgs([
    '--commit',
    '--limit',
    '250',
    '--offset',
    '10',
    '--batch-size',
    '50',
    '--patient-ids',
    'p1,p2',
    '--categories',
    'journal,consent',
  ]);
  assert.equal(args.dryRun, false);
  assert.equal(args.commit, true);
  assert.equal(args.limit, 250);
  assert.equal(args.offset, 10);
  assert.equal(args.batchSize, 50);
  assert.deepEqual([...args.patientIds], ['p1', 'p2']);
  assert.deepEqual([...args.categories], ['journal', 'consent']);
});

test('looksTechnical detects raw filenames', () => {
  assert.equal(looksTechnical('', 'foo.pdf'), true);
  assert.equal(looksTechnical('Journal-PRP-Anna-1234.pdf', 'Journal-PRP-Anna-1234.pdf'), true);
  assert.equal(looksTechnical('IMG_20240524_001.jpg', 'IMG_20240524_001.jpg'), true);
  assert.equal(looksTechnical('Friskfo??rsa??kran-Anna-1234.pdf', null), true);
  assert.equal(looksTechnical('2024-05-24 · FUE Operation · Journal · signerad', null), false);
  assert.equal(looksTechnical('Hälsodeklaration', null), false);
});

test('needsBackfill respects manual naming', () => {
  assert.equal(needsBackfill({ displayName: 'Journal-Anna-1234.pdf', patientId: 'p1' }, {}), true);
  assert.equal(
    needsBackfill({ displayName: 'Hälsodeklaration', namingStatus: 'manual', patientId: 'p1' }, {}),
    false
  );
  assert.equal(needsBackfill({ displayName: '', patientId: 'p1' }, {}), true);
  assert.equal(
    needsBackfill({ displayName: '', deletedAt: '2024-01-01', patientId: 'p1' }, {}),
    false
  );
});

test('isAutoSafeNamingPatch haller tillbaka lagkonfidenta gissningar', () => {
  assert.equal(isAutoSafeNamingPatch({ namingStatus: 'needs_review_for_naming' }), false);
  assert.equal(isAutoSafeNamingPatch({ namingStatus: 'resolved' }), true);
  assert.equal(isAutoSafeNamingPatch({ namingStatus: 'manual' }), true);
  assert.equal(isAutoSafeNamingPatch({}), true);
  assert.equal(isAutoSafeNamingPatch(null), true);
});

function makeFakeAssetStore(assets) {
  const patched = [];
  return {
    listItemsForEnrichment: () => assets,
    beginBatch: () => {},
    checkpointBatch: async () => {},
    flushBatch: async () => {},
    patchAssetNamingMetadata: async (assetId, namingPatch) => {
      patched.push({ assetId, namingPatch });
    },
    _patched: patched,
  };
}

// 2026-08-07: prod-dry-run gav "FUE Operation 23/25/26/30" for fyra foton
// fran SAMMA patient, SAMMA dag — sessionNumber-grupperingen hade inte
// deduplicerat ratt. namingStatus needs_review_for_naming fangade det, men
// --commit skrev anda over displayName ovillkorligt fore den har fixen.
test('backfillAssetDisplayNames skriver INTE lagkonfidenta gissningar vid --commit', async () => {
  const safeAsset = {
    id: 'asset-safe',
    patientId: 'p1',
    category: 'journal',
    displayName: 'journal-raw.pdf',
    originalFileName: 'journal-raw.pdf',
    documentDate: '2026-01-01',
  };
  const riskyAsset = {
    id: 'asset-risky',
    patientId: 'p1',
    category: 'oklassificerad_kategori_xyz',
    displayName: 'IMG_9999.jpg',
    originalFileName: 'IMG_9999.jpg',
  };
  const assetStore = makeFakeAssetStore([safeAsset, riskyAsset]);

  const report = await backfillAssetDisplayNames({
    assetStore,
    args: { dryRun: false, commit: true, limit: 0, offset: 0, batchSize: 100, force: false },
  });

  assert.equal(report.stats.failed, 0, JSON.stringify(report.errors));
  // Den lagkonfidenta gissningen far INTE synas i den skrivna listan.
  assert.deepEqual(
    assetStore._patched.map((p) => p.assetId),
    ['asset-safe']
  );
  assert.equal(report.stats.patched, 1);
  assert.equal(report.stats.skippedNeedsReview, 1);
  assert.equal(report.needsReviewSamples.length, 1);
  assert.equal(report.needsReviewSamples[0].assetId, 'asset-risky');
  assert.equal(report.needsReviewSamples[0].namingStatus, 'needs_review_for_naming');
});

test('backfillAssetDisplayNames dry-run forhandsvisar samma haller-tillbaka-beteende', async () => {
  const riskyAsset = {
    id: 'asset-risky',
    patientId: 'p1',
    category: 'oklassificerad_kategori_xyz',
    displayName: 'IMG_9999.jpg',
    originalFileName: 'IMG_9999.jpg',
  };
  const assetStore = makeFakeAssetStore([riskyAsset]);

  const report = await backfillAssetDisplayNames({
    assetStore,
    args: { dryRun: true, commit: false, limit: 0, offset: 0, batchSize: 100, force: false },
  });

  assert.equal(assetStore._patched.length, 0, 'dry-run ska aldrig skriva');
  assert.equal(report.stats.patched, 0);
  assert.equal(report.stats.skippedNeedsReview, 1);
  assert.equal(report.needsReviewSamples[0].assetId, 'asset-risky');
});
