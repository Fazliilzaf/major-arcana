'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDriveLookup,
  lookupDriveFile,
  normalizeRelativePathKey,
  normalizeFileNameForMatch,
} = require('../../scripts/migration/lib/driveFileMatch');

describe('driveFileMatch', () => {
  it('normalizeRelativePathKey uses last three path segments', () => {
    assert.equal(
      normalizeRelativePathKey('Patient/2024/scan.pdf'),
      'patient/2024/scan.pdf'
    );
    assert.equal(normalizeRelativePathKey('Root/A/B/doc.pdf'), 'a/b/doc.pdf');
  });

  it('normalizeFileNameForMatch repairs html entities and duplicate suffix', () => {
    assert.equal(normalizeFileNameForMatch('IMG_3104(1).JPG'), 'IMG_3104.JPG');
    assert.doesNotMatch(normalizeFileNameForMatch('Carl&#039_en.pdf'), /&#039/);
  });

  it('lookupDriveFile matches by relative path when loose name misses', () => {
    const lookup = buildDriveLookup([
      {
        personnummer: '199001011234',
        fileName: 'report.pdf',
        relativePath: 'Clinic/PatientA/report.pdf',
        driveFileId: 'drive-a',
        mimeType: 'application/pdf',
        webViewLink: '',
      },
      {
        personnummer: '198002022345',
        fileName: 'summary.pdf',
        relativePath: 'Clinic/PatientB/summary.pdf',
        driveFileId: 'drive-b',
        mimeType: 'application/pdf',
        webViewLink: '',
      },
    ]);

    const hit = lookupDriveFile({
      lookup,
      personnummer: '',
      fileName: 'wrong-name.pdf',
      relativePath: 'Clinic/PatientB/summary.pdf',
    });
    assert.equal(hit?.driveFileId, 'drive-b');
  });

  it('lookupDriveFile matches duplicate-suffixed image names via pnr + loose key', () => {
    const lookup = buildDriveLookup([
      {
        personnummer: '19810314-4633',
        fileName: 'IMG_3104.JPG',
        relativePath: 'TP/Alexander Andersson - 19810314-4633/IMG_3104.JPG',
        driveFileId: 'drive-img',
        mimeType: 'image/jpeg',
        webViewLink: '',
      },
    ]);

    const hit = lookupDriveFile({
      lookup,
      personnummer: '19810314-4633',
      fileName: 'IMG_3104(1).JPG',
      relativePath: 'April 2026/Alexander Andersson - 19810314-4633/IMG_3104(1).JPG',
    });
    assert.equal(hit?.driveFileId, 'drive-img');
  });
});
