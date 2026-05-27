'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  skeletonName,
  nameSimilarity,
  extractDates,
  proposeDriveMatches,
} = require('../../scripts/migration/lib/mojibakeMatch');
const { applyProposals } = require('../../scripts/migration/proposeMojibakeDriveMatches');

test('skeletonName collapses lossy mojibake and diacritics to the same key', () => {
  const correct = skeletonName('Hälsodeklaration.pdf');
  assert.equal(correct, 'halsodeklaration');
  // "??" form keeps the surviving base letter -> identical skeleton.
  assert.equal(skeletonName('Ha??lsodeklaration.pdf'), correct);
  // HTML entity + dedupe suffix + extension all stripped.
  assert.equal(skeletonName('Carl&#039;en (1).pdf'), 'carlen');
});

test('nameSimilarity tolerates a single dropped character', () => {
  // "+?" form drops the base letter entirely; still highly similar.
  const score = nameSimilarity(skeletonName('H+?lsodeklaration.pdf'), skeletonName('Hälsodeklaration.pdf'));
  assert.ok(score >= 0.82, `expected >=0.82, got ${score}`);
  assert.equal(nameSimilarity('abc', 'abc'), 1);
  assert.equal(nameSimilarity('', 'abc'), 0);
});

test('proposeDriveMatches is gated on personnummer and proposes high-confidence name matches', () => {
  const result = proposeDriveMatches({
    missingFiles: [
      { id: 'm1', fileName: 'Ha??lsodeklaration.pdf', fileType: 'document_pdf', personnummer: '19671214-2626' },
      { id: 'm2', fileName: 'Journal Tedh Fritz+? 2023-11-11.pdf', fileType: 'journal_pdf', personnummer: '19960320-8679' },
    ],
    driveFiles: [
      { driveFileId: 'd1', fileName: 'Hälsodeklaration.pdf', fileType: 'document_pdf', personnummer: '19671214-2626' },
      { driveFileId: 'd2', fileName: 'Journal Tedh Fritz 2023-11-11.pdf', fileType: 'journal_pdf', personnummer: '19960320-8679' },
      // Same name but DIFFERENT patient -> must never match (pnr gate).
      { driveFileId: 'dX', fileName: 'Hälsodeklaration.pdf', fileType: 'document_pdf', personnummer: '19010101-0000' },
    ],
  });
  assert.equal(result.stats.proposedHigh, 2);
  const m1 = result.proposed.find((p) => p.file.id === 'm1');
  assert.equal(m1.match.driveFileId, 'd1');
  assert.equal(m1.confidence, 'high');
});

test('proposeDriveMatches falls back to sole-file-of-type as medium confidence', () => {
  const result = proposeDriveMatches({
    missingFiles: [
      { id: 'm1', fileName: 'totally unrelated name.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
    ],
    driveFiles: [
      { driveFileId: 'd1', fileName: 'Journal something else.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
      { driveFileId: 'd2', fileName: 'photo.jpg', fileType: 'image', personnummer: '19671214-2626' },
    ],
  });
  assert.equal(result.stats.proposedMedium, 1);
  assert.equal(result.proposed[0].confidence, 'medium');
  assert.equal(result.proposed[0].match.driveFileId, 'd1');
});

test('proposeDriveMatches flags ambiguous when multiple journals of the same type compete', () => {
  const result = proposeDriveMatches({
    missingFiles: [
      { id: 'm1', fileName: 'random.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
    ],
    driveFiles: [
      { driveFileId: 'd1', fileName: 'Journal A.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
      { driveFileId: 'd2', fileName: 'Journal B.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
    ],
  });
  assert.equal(result.stats.ambiguous, 1);
  assert.equal(result.stats.proposedHigh, 0);
});

test('extractDates finds encounter dates and excludes the patient birthdate', () => {
  const dates = extractDates('Journal ??? 2023-11-11.pdf', '19671214');
  assert.deepEqual([...dates], ['20231111']);
  // pnr birthdate present in the path is excluded.
  assert.deepEqual([...extractDates('19671214-2626/Journal 2023-11-11.pdf', '19671214')], ['20231111']);
});

test('proposeDriveMatches disambiguates competing journals by encounter date', () => {
  const result = proposeDriveMatches({
    missingFiles: [
      // Unreadable name, but the date survives — must pick the 2023-11-11 journal.
      { id: 'm1', fileName: 'Journal ??? +? 2023-11-11.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
    ],
    driveFiles: [
      { driveFileId: 'd1', fileName: 'Journal Anna 2023-11-11.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
      { driveFileId: 'd2', fileName: 'Journal Anna 2024-05-02.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' },
    ],
  });
  assert.equal(result.stats.proposedHigh, 1);
  assert.equal(result.proposed[0].match.driveFileId, 'd1');
  assert.equal(result.proposed[0].reason, 'date_match');
});

test('proposeDriveMatches marks no-personnummer and no-drive cases unresolved', () => {
  const result = proposeDriveMatches({
    missingFiles: [
      { id: 'm1', fileName: 'x.pdf', fileType: 'journal_pdf', personnummer: '' },
      { id: 'm2', fileName: 'y.pdf', fileType: 'journal_pdf', personnummer: '20000101-0000' },
    ],
    driveFiles: [{ driveFileId: 'd1', fileName: 'z.pdf', fileType: 'journal_pdf', personnummer: '19671214-2626' }],
  });
  assert.equal(result.stats.unresolved, 2);
  assert.deepEqual(
    result.unresolved.map((u) => u.reason).sort(),
    ['no_personnummer', 'no_unclaimed_drive_files_under_pnr']
  );
});

test('applyProposals writes only high confidence by default and never overwrites an existing driveFileId', () => {
  const indexData = {
    files: [
      { id: 'm1', driveFileId: '' },
      { id: 'm2', driveFileId: '' },
      { id: 'm3', driveFileId: 'already-linked' },
    ],
  };
  const proposed = [
    { file: { id: 'm1' }, match: { driveFileId: 'd1' }, confidence: 'high' },
    { file: { id: 'm2' }, match: { driveFileId: 'd2' }, confidence: 'medium' },
    { file: { id: 'm3' }, match: { driveFileId: 'd3' }, confidence: 'high' },
  ];

  const appliedHighOnly = applyProposals({ indexData, proposed, includeMedium: false });
  assert.equal(appliedHighOnly, 1);
  assert.equal(indexData.files[0].driveFileId, 'd1');
  assert.equal(indexData.files[1].driveFileId, ''); // medium skipped
  assert.equal(indexData.files[2].driveFileId, 'already-linked'); // not overwritten
});

test('applyProposals includes medium confidence when requested', () => {
  const indexData = { files: [{ id: 'm2', driveFileId: '' }] };
  const proposed = [{ file: { id: 'm2' }, match: { driveFileId: 'd2' }, confidence: 'medium' }];
  const applied = applyProposals({ indexData, proposed, includeMedium: true });
  assert.equal(applied, 1);
  assert.equal(indexData.files[0].driveFileId, 'd2');
});
