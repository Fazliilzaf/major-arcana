'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  needsBackfill,
  looksTechnical,
  isAutoSafeNamingPatch,
  backfillAssetDisplayNames,
  groupByPatientId,
  resolveAliasKeyFn,
} = require('../../scripts/backfill-asset-display-names');

test('parseArgs defaults to dry-run', () => {
  const args = parseArgs(['--i-understand-the-collision-risk-skip-alias-resolution']);
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
    '--i-understand-the-collision-risk-skip-alias-resolution',
  ]);
  assert.equal(args.dryRun, false);
  assert.equal(args.commit, true);
  assert.equal(args.limit, 250);
  assert.equal(args.offset, 10);
  assert.equal(args.batchSize, 50);
  assert.deepEqual([...args.patientIds], ['p1', 'p2']);
  assert.deepEqual([...args.categories], ['journal', 'consent']);
});

// CCO-STATUS.md punkt 1 (bekräftad 2026-08-13): utan alias-upplösning
// grupperas syskon-assets på rå, ofta icke-unik asset.patientId — 519
// verifierade kollisionsgrupper i prod. parseArgs kräver därför
// --patients-store + --tenant, eller ett explicit medgivande.
test('parseArgs kräver --patients-store + --tenant, eller explicit skip-flagga', () => {
  assert.throws(() => parseArgs([]), /--patients-store/);
  assert.throws(() => parseArgs(['--patients-store', '/tmp/x.json']), /--tenant/);
  assert.doesNotThrow(() =>
    parseArgs(['--patients-store', '/tmp/x.json', '--tenant', 'hair-tp-clinic'])
  );
  assert.doesNotThrow(() => parseArgs(['--i-understand-the-collision-risk-skip-alias-resolution']));
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

test('groupByPatientId accepts a custom keyFn (default: rå asset.patientId, oförändrat)', () => {
  const groups = groupByPatientId([
    { id: 'a1', patientId: 'raw-alias' },
    { id: 'a2', patientId: 'raw-alias' },
  ]);
  assert.equal(groups.size, 1);
  assert.equal(groups.get('raw-alias').length, 2);

  const resolved = groupByPatientId(
    [
      { id: 'a1', patientId: 'raw-alias' },
      { id: 'a2', patientId: 'raw-alias' },
    ],
    (asset) => (asset.id === 'a1' ? 'canonical-1' : 'canonical-2')
  );
  assert.equal(resolved.size, 2);
});

// CCO-STATUS.md punkt 1, bug 1 (bekräftad 2026-08-13, PR #1364-#1371):
// 519 verifierade kors-patient-alias-kollisioner i prod. Samma
// personnummer-baserade upplösning som #1368 verifierade — se
// resolveCanonicalPatientsForAssets (ccoPatientAssetIdentity.js, ORD-85).
test('resolveAliasKeyFn löser upp ett delat alias-patientId till varje kanonisk patient via personnummer', () => {
  const patients = [
    { id: 'canon-1', personnummer: '199001011111', displayName: 'Patient One' },
    { id: 'canon-2', personnummer: '199002022222', displayName: 'Patient Two' },
  ];
  const assets = [
    { id: 'a1', patientId: 'shared-legacy-alias', originalFileName: '199001011111_FUE.pdf' },
    { id: 'a2', patientId: 'shared-legacy-alias', originalFileName: '199002022222_FUE.pdf' },
    { id: 'a3', patientId: 'never-resolves', originalFileName: 'unrelated.pdf' },
  ];
  const keyFn = resolveAliasKeyFn(assets, patients);
  assert.equal(keyFn(assets[0]), 'canon-1');
  assert.equal(keyFn(assets[1]), 'canon-2');
  // Olöst alias faller tillbaka på den råa asset.patientId — aldrig sämre
  // än det ursprungliga beteendet.
  assert.equal(keyFn(assets[2]), 'never-resolves');
});

test('backfillAssetDisplayNames + patients: tre patienter som delar ett alias-patientId grupperas nu korrekt, sessionNumber 1/2/3 i stället för 7/8/9 (bug 1)', async () => {
  const patients = [
    { id: 'canon-1', personnummer: '199001011111', displayName: 'Patient One' },
    { id: 'canon-2', personnummer: '199002022222', displayName: 'Patient Two' },
    { id: 'canon-3', personnummer: '199003033333', displayName: 'Patient Three' },
  ];
  const personnummers = ['199001011111', '199002022222', '199003033333'];
  const assets = [];
  for (let p = 0; p < 3; p += 1) {
    for (let i = 0; i < 3; i += 1) {
      assets.push({
        id: `p${p}-doc${i}`,
        patientId: 'shared-legacy-alias',
        category: 'journal',
        treatmentType: 'FUE',
        originalFileName: `${personnummers[p]}_FUE_avtal_${i}.pdf`,
        documentDate: `2026-0${i + 1}-1${p}`,
      });
    }
  }
  const assetStore = makeFakeAssetStore(assets);

  const report = await backfillAssetDisplayNames({
    assetStore,
    patients,
    args: { dryRun: true, commit: false, limit: 0, offset: 0, batchSize: 100, force: false },
  });

  assert.equal(report.stats.failed, 0, JSON.stringify(report.errors));
  // Tre kanoniska patienter, inte en enda uppblåst alias-grupp.
  assert.equal(report.stats.patients, 3);
  assert.equal(report.stats.patched, 9);
  assert.equal(report.stats.skippedNeedsReview, 0);
  const displayNames = report.samples.map((s) => s.newDisplayName).sort();
  // Varje patients tre dokument ska få sessionNumber 1, 2, 3 — aldrig
  // 7, 8, 9 (den gamla, kolliderande grupperingens resultat).
  for (const label of ['1', '2', '3']) {
    assert.ok(
      displayNames.some((name) => name.includes(`FUE ${label} ·`)),
      `saknar FUE ${label} bland ${JSON.stringify(displayNames)}`
    );
  }
  assert.ok(
    displayNames.every((name) => !/FUE [4-9] ·/.test(name)),
    `hittade ett uppblåst sessionNumber: ${JSON.stringify(displayNames)}`
  );
});

// CCO-STATUS.md punkt 1, bug 2 (bekräftad 2026-08-13): fallbackShare upp
// till 1.0, sessionNumber upp till 16 för dokument utan documentDate.
test('backfillAssetDisplayNames: ett sessionNumber byggt på importedAt-fallback hålls tillbaka som needs_review, skrivs aldrig vid --commit', async () => {
  const asset = {
    id: 'fallback-asset',
    patientId: 'p1',
    category: 'journal',
    treatmentType: 'FUE',
    originalFileName: 'FUE-avtal.pdf',
    importedAt: '2026-01-15T10:00:00.000Z',
    // Ingen documentDate — exakt bugg-scenariot.
  };
  const assetStore = makeFakeAssetStore([asset]);

  const report = await backfillAssetDisplayNames({
    assetStore,
    args: { dryRun: false, commit: true, limit: 0, offset: 0, batchSize: 100, force: false },
  });

  assert.equal(report.stats.failed, 0, JSON.stringify(report.errors));
  assert.equal(assetStore._patched.length, 0, 'ett fallback-daterat sessionNumber skrivs aldrig');
  assert.equal(report.stats.skippedNeedsReview, 1);
  assert.equal(report.needsReviewSamples[0].namingStatus, 'needs_review_for_naming');
});
