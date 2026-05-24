'use strict';

const path = require('node:path');

function normalizeDriveMatchKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '');
}

function buildDriveLookup(driveFiles) {
  const byExact = new Map();
  const byLoose = new Map();
  const byFileName = new Map();

  for (const item of driveFiles) {
    const fileName = String(item.fileName || path.basename(item.relativePath || '')).trim();
    const pnr = String(item.personnummer || '').trim();
    const records = {
      driveFileId: item.driveFileId,
      mimeType: item.mimeType || '',
      webViewLink: item.webViewLink || '',
    };
    const exactKey = `${pnr}::${fileName.toLowerCase()}`;
    const looseName = normalizeDriveMatchKey(fileName);
    if (pnr && fileName && !byExact.has(exactKey)) {
      byExact.set(exactKey, records);
    }
    if (looseName && !byLoose.has(looseName)) {
      byLoose.set(looseName, records);
    }
    if (looseName) {
      const bucket = byFileName.get(looseName) || [];
      bucket.push(records);
      byFileName.set(looseName, bucket);
    }
  }

  return { byExact, byLoose, byFileName };
}

function lookupDriveFile({ lookup, personnummer, fileName, relativePath }) {
  const baseName = String(fileName || path.basename(relativePath || '')).trim();
  const pnr = String(personnummer || '').trim();
  const exactKey = `${pnr}::${baseName.toLowerCase()}`;
  if (pnr && lookup.byExact.has(exactKey)) {
    return lookup.byExact.get(exactKey);
  }
  const looseKey = normalizeDriveMatchKey(baseName);
  if (lookup.byLoose.has(looseKey)) {
    return lookup.byLoose.get(looseKey);
  }
  const candidates = lookup.byFileName.get(looseKey) || [];
  if (candidates.length === 1) {
    return candidates[0];
  }
  return null;
}

module.exports = {
  buildDriveLookup,
  lookupDriveFile,
  normalizeDriveMatchKey,
};
