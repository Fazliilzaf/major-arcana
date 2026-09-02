'use strict';

const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const {
  backfillJournalDisplayNames,
  needsBackfill,
  buildAssetIndex,
  findAssetForJournal,
  parseArgs,
} = require('../../scripts/backfill-journal-display-names.js');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore.js');

function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'backfill-journal-display-names-'));
}

function makeAsset({ id, sourceRecordId, originalDriveFileId, displayName, category = 'journal' }) {
  return {
    id,
    patientId: 'p-1',
    category,
    sourceRecordId: sourceRecordId || null,
    originalDriveFileId: originalDriveFileId || null,
    originalFileName: 'raw.pdf',
    displayName,
    status: 'IMPORTED_TO_CCO',
  };
}

function makeAssetStore(assets = []) {
  return {
    listItemsForEnrichment: () => assets,
  };
}

test('parseArgs defaults to dry-run and tenant hair_tp', () => {
  const args = parseArgs([]);
  assert.strictEqual(args.dryRun, true);
  assert.strictEqual(args.commit, false);
  assert.strictEqual(args.tenantId, 'hair_tp');
  assert.strictEqual(args.limit, 0);
});

test('parseArgs handles --commit and --patient-ids', () => {
  const args = parseArgs(['--commit', '--patient-ids', 'p1,p2', '--limit', '50']);
  assert.strictEqual(args.dryRun, false);
  assert.strictEqual(args.commit, true);
  assert.deepStrictEqual([...args.patientIds], ['p1', 'p2']);
  assert.strictEqual(args.limit, 50);
});

test('needsBackfill flags historical entries with mojibake title and no displayName', () => {
  assert.strictEqual(
    needsBackfill({ journalType: 'historical_import', title: 'Friskfo??rsa??kran.pdf' }),
    true
  );
  assert.strictEqual(
    needsBackfill({ journalType: 'historical_import', title: 'FriskfÃ¶rsÃ¤kran.pdf' }),
    true
  );
  assert.strictEqual(
    needsBackfill({
      journalType: 'historical_import',
      title: 'Friskfo??rsa??kran.pdf',
      displayName: 'Friskförsäkran.pdf',
    }),
    false
  );
  assert.strictEqual(
    needsBackfill({ journalType: 'historical_import', title: 'Normal journal.pdf' }),
    false
  );
});

test('buildAssetIndex indexes assets by sourceRecordId and originalDriveFileId', () => {
  const assets = [
    makeAsset({ id: 'a-1', sourceRecordId: 'f-1', displayName: 'One.pdf' }),
    makeAsset({ id: 'a-2', originalDriveFileId: 'd-1', displayName: 'Two.pdf' }),
  ];
  const index = buildAssetIndex(makeAssetStore(assets));
  assert.strictEqual(index.byFileId.get('f-1').id, 'a-1');
  assert.strictEqual(index.byDriveFileId.get('d-1').id, 'a-2');
});

test('findAssetForJournal prefers fileId match', () => {
  const assets = [
    makeAsset({
      id: 'a-1',
      sourceRecordId: 'f-1',
      originalDriveFileId: 'd-1',
      displayName: 'One.pdf',
    }),
    makeAsset({
      id: 'a-2',
      sourceRecordId: 'f-2',
      originalDriveFileId: 'd-1',
      displayName: 'Two.pdf',
    }),
  ];
  const index = buildAssetIndex(makeAssetStore(assets));
  const entry = {
    importMeta: { fileId: 'f-2', driveFileId: 'd-1' },
  };
  const asset = findAssetForJournal(entry, index);
  assert.strictEqual(asset.id, 'a-2');
});

test('findAssetForJournal falls back to driveFileId', () => {
  const assets = [makeAsset({ id: 'a-1', originalDriveFileId: 'd-1', displayName: 'One.pdf' })];
  const index = buildAssetIndex(makeAssetStore(assets));
  const entry = { importMeta: { fileId: 'unknown', driveFileId: 'd-1' } };
  const asset = findAssetForJournal(entry, index);
  assert.strictEqual(asset.id, 'a-1');
});

test('backfillJournalDisplayNames dry-run reports matches without writing', async () => {
  const dir = await tmpDir();
  const journalStore = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
  });
  // Simulera gammal journal (innan displayName sparades) — mojibake-titel, inget displayName.
  await journalStore.upsertEntry(
    {
      tenantId: 'hair-tp-clinic',
      patientId: 'p-1',
      personnummer: '19900101-1234',
      journalType: 'historical_import',
      title: 'Friskfo??rsa??kran.pdf',
      source: 'drive_import',
      status: 'signed',
      locked: true,
      signedAt: '2024-04-22T10:00:00Z',
      signedByName: 'Drive-import',
      importMeta: {
        fileId: 'f-1',
        driveFileId: 'd-1',
      },
      attachments: [
        {
          type: 'historical_pdf',
          fileId: 'f-1',
          fileName: 'Friskfo??rsa??kran.pdf',
        },
      ],
    },
    { actor: { userId: 'u-1', displayName: 'Test' } }
  );

  const assetStore = makeAssetStore([
    makeAsset({
      id: 'a-1',
      sourceRecordId: 'f-1',
      originalDriveFileId: 'd-1',
      displayName: 'Friskförsäkran.pdf',
    }),
  ]);

  const report = await backfillJournalDisplayNames({
    journalStore,
    assetStore,
    args: {
      dryRun: true,
      limit: 0,
      offset: 0,
      batchSize: 100,
      patientIds: null,
      tenantId: 'hair-tp-clinic',
    },
  });

  assert.strictEqual(report.stats.candidates, 1);
  assert.strictEqual(report.stats.matched, 1);
  assert.strictEqual(report.stats.patched, 1);
  assert.strictEqual(report.samples.length, 1);
  assert.strictEqual(report.samples[0].newDisplayName, 'Friskförsäkran.pdf');

  // Dry-run ska INTE ha sparat displayName på journalposten.
  const entries = await journalStore.listAllEntries({ tenantId: 'hair-tp-clinic' });
  assert.strictEqual(entries[0].displayName, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('backfillJournalDisplayNames commit writes displayName to locked journal', async () => {
  const dir = await tmpDir();
  const journalStore = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
  });
  await journalStore.upsertEntry(
    {
      tenantId: 'hair-tp-clinic',
      patientId: 'p-1',
      personnummer: '19900101-1234',
      journalType: 'historical_import',
      title: 'FriskfÃ¶rsÃ¤kran.pdf',
      source: 'drive_import',
      status: 'signed',
      locked: true,
      signedAt: '2024-04-22T10:00:00Z',
      signedByName: 'Drive-import',
      importMeta: {
        fileId: 'f-1',
        driveFileId: 'd-1',
      },
      attachments: [
        {
          type: 'historical_pdf',
          fileId: 'f-1',
          fileName: 'FriskfÃ¶rsÃ¤kran.pdf',
        },
      ],
    },
    { actor: { userId: 'u-1', displayName: 'Test' } }
  );

  const assetStore = makeAssetStore([
    makeAsset({
      id: 'a-1',
      sourceRecordId: 'f-1',
      originalDriveFileId: 'd-1',
      displayName: 'Friskförsäkran.pdf',
    }),
  ]);

  const report = await backfillJournalDisplayNames({
    journalStore,
    assetStore,
    args: {
      dryRun: false,
      commit: true,
      limit: 0,
      offset: 0,
      batchSize: 100,
      patientIds: null,
      tenantId: 'hair-tp-clinic',
    },
  });

  assert.strictEqual(report.stats.patched, 1);

  const entries = await journalStore.listAllEntries({ tenantId: 'hair-tp-clinic' });
  assert.strictEqual(entries[0].displayName, 'Friskförsäkran.pdf');
  assert.ok(entries[0].events.some((e) => e.type === 'journal_display_name_backfilled'));
  assert.strictEqual(entries[0].locked, true);

  await fs.rm(dir, { recursive: true, force: true });
});
