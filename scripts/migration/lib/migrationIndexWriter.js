'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { aggregateProfiles } = require('../../../src/ops/ccoMigrationIndexStore');

function writeMigrationIndex({ outPath, scanMeta, files }) {
  const profilesByPersonnummer = aggregateProfiles(files);
  const payload = {
    version: 1,
    createdAt: scanMeta.startedAt,
    updatedAt: new Date().toISOString(),
    scans: [scanMeta],
    files,
    profilesByPersonnummer,
    stats: {
      totalFiles: files.length,
      totalProfiles: Object.keys(profilesByPersonnummer).length,
      journalPdfs: files.filter((item) => item.fileType === 'journal_pdf').length,
      images: files.filter((item) => item.fileType === 'image').length,
      scannedAt: scanMeta.completedAt,
      source: scanMeta.source,
      zipCount: scanMeta.zipCount || 0,
      badZipCount: scanMeta.badZipCount || 0,
      folderRoot: scanMeta.folderRoot || '',
      driveFolderId: scanMeta.driveFolderId || '',
    },
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

module.exports = {
  writeMigrationIndex,
};
