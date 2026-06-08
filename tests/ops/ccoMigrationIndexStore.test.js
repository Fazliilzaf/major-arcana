'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildFilesByPersonnummer,
  createCcoMigrationIndexStore,
} = require('../../src/ops/ccoMigrationIndexStore');

test('buildFilesByPersonnummer indexes files without scanning full corpus per lookup', () => {
  const files = [
    { id: 'a', personnummer: '19900101-1234', fileType: 'image' },
    { id: 'b', personnummer: '19900101-1234', fileType: 'journal_pdf' },
    { id: 'c', personnummer: '19881212-5678', fileType: 'image' },
  ];
  const index = buildFilesByPersonnummer(files);
  assert.equal(index.get('19900101-1234').length, 2);
  assert.equal(index.get('19881212-5678').length, 1);
  assert.deepEqual(index.get('00000000-0000'), undefined);
});

test('updateFileName is idempotent and persists UTF-8 names (ORD-33)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-index-ord33-'));
  const store = await createCcoMigrationIndexStore({
    filePath: path.join(tmp, 'migration-index.json'),
  });
  await store.replaceScanResult({
    scanMeta: { completedAt: new Date().toISOString(), zipCount: 0, badZipCount: 0 },
    files: [
      {
        id: 'file-1',
        personnummer: '19900101-1234',
        driveFileId: 'drive-1',
        fileName: 'Friskf+?rs+?kran.pdf',
        relativePath: 'patient/Friskf+?rs+?kran.pdf',
        fileType: 'document',
      },
    ],
  });

  const first = await store.updateFileName({
    fileId: 'file-1',
    name: 'Friskförsäkran.pdf',
  });
  assert.equal(first.changed, true);
  assert.equal(first.oldName, 'Friskf+?rs+?kran.pdf');

  const second = await store.updateFileName({
    fileId: 'file-1',
    name: 'Friskförsäkran.pdf',
  });
  assert.equal(second.changed, false);

  const reloaded = await createCcoMigrationIndexStore({
    filePath: path.join(tmp, 'migration-index.json'),
  });
  const persisted = await reloaded.getFileById('file-1');
  assert.equal(persisted.fileName, 'Friskförsäkran.pdf');
});
