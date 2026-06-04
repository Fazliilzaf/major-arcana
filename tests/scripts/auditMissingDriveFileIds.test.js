'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildReport,
  classifyMissingFile,
  summarizeFile,
} = require('../../scripts/audit-missing-drive-file-ids');

async function withTempIndex(fixture, run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-drive-'));
  try {
    const indexPath = path.join(tempDir, 'migration-index.json');
    await fs.writeFile(indexPath, JSON.stringify(fixture, null, 2), 'utf8');
    await run(indexPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('classifyMissingFile bucketar saknade filer korrekt', () => {
  // Saknar både pnr och relativePath
  assert.equal(
    classifyMissingFile({}).bucket,
    'no_personnummer_no_path'
  );
  // Saknar pnr men har path
  assert.equal(
    classifyMissingFile({ relativePath: 'foo/bar.pdf' }).bucket,
    'no_personnummer'
  );
  // Cliento-export ska inte ha driveFileId
  assert.equal(
    classifyMissingFile({
      personnummer: '198001011234',
      source: 'cliento_export',
      fileType: 'document',
    }).bucket,
    'non_drive_source'
  );
  // Bild utan match
  assert.equal(
    classifyMissingFile({
      personnummer: '198001011234',
      source: 'drive_zip',
      fileType: 'image',
      relativePath: 'foo/bar.jpg',
    }).bucket,
    'media_no_match'
  );
  // Journal-PDF utan match
  assert.equal(
    classifyMissingFile({
      personnummer: '198001011234',
      source: 'drive_zip',
      fileType: 'journal_pdf',
      relativePath: 'foo/journal.pdf',
    }).bucket,
    'journal_pdf_no_match'
  );
  // Dokument utan match (före partial metadata-check)
  assert.equal(
    classifyMissingFile({
      personnummer: '198001011234',
      source: 'drive_zip',
      fileType: 'document',
      relativePath: 'foo.pdf',
      mimeType: 'application/pdf',
    }).bucket,
    'document_no_match'
  );
  // Partial drive metadata (fileType som inte triggade tidigare buckets)
  assert.equal(
    classifyMissingFile({
      personnummer: '198001011234',
      source: 'drive_zip',
      fileType: 'unknown',
      relativePath: 'foo.bin',
      mimeType: 'application/octet-stream',
    }).bucket,
    'partial_drive_metadata'
  );
});

test('summarizeFile plockar relevanta fält', () => {
  const summary = summarizeFile({
    id: 'file-1',
    fileName: 'journal.pdf',
    fileType: 'journal_pdf',
    personnummer: '198001011234',
    relativePath: '198001011234/journal.pdf',
    source: 'drive_zip',
    secret: 'hidden',
  });
  assert.equal(summary.id, 'file-1');
  assert.equal(summary.fileName, 'journal.pdf');
  assert.equal(summary.fileType, 'journal_pdf');
  assert.ok(!('secret' in summary));
});

test('buildReport räknar rätt totals och buckets', async () => {
  const fixture = {
    version: 1,
    generatedAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T01:00:00.000Z',
    files: [
      {
        id: 'a',
        driveFileId: 'drive-1',
        personnummer: '198001011234',
        fileType: 'journal_pdf',
        source: 'drive_zip',
        fileName: 'a.pdf',
        relativePath: '198001011234/a.pdf',
      },
      {
        id: 'b',
        driveFileId: '',
        personnummer: '198001011234',
        fileType: 'journal_pdf',
        source: 'drive_zip',
        fileName: 'b.pdf',
        relativePath: '198001011234/b.pdf',
      },
      {
        id: 'c',
        driveFileId: '',
        personnummer: '',
        fileType: 'document',
        source: 'drive_zip',
        fileName: 'c.pdf',
        relativePath: 'unknown/c.pdf',
      },
      {
        id: 'd',
        driveFileId: '',
        personnummer: '198001011234',
        fileType: 'image',
        source: 'drive_zip',
        fileName: 'photo.jpg',
        relativePath: '198001011234/photo.jpg',
      },
      {
        id: 'e',
        driveFileId: '',
        personnummer: '198001011234',
        fileType: 'document',
        source: 'cliento_export',
        fileName: 'cliento.csv',
        relativePath: 'export/cliento.csv',
      },
    ],
  };
  await withTempIndex(fixture, async (indexPath) => {
    const report = buildReport({ indexPath, sampleSize: 2 });
    assert.equal(report.totalFiles, 5);
    assert.equal(report.totalWithDriveFileId, 1);
    assert.equal(report.totalMissingDriveFileId, 4);
    const bucketsByName = Object.fromEntries(
      report.buckets.map((bucket) => [bucket.bucket, bucket])
    );
    assert.equal(bucketsByName.journal_pdf_no_match.count, 1);
    assert.equal(bucketsByName.no_personnummer.count, 1);
    assert.equal(bucketsByName.media_no_match.count, 1);
    assert.equal(bucketsByName.non_drive_source.count, 1);
    for (const bucket of report.buckets) {
      assert.ok(bucket.samples.length <= 2);
    }
    assert.match(report.coveragePercent, /^[0-9]+\.[0-9]{2}$/);
  });
});

test('buildReport kastar tydligt fel vid saknat index', () => {
  assert.throws(
    () => buildReport({ indexPath: '/tmp/this-file-should-not-exist-arcana.json' }),
    /migration-index saknas/
  );
});
