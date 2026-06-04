'use strict';

const path = require('node:path');

function normalizeDriveMatchKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '');
}

function normalizeRelativePathKey(relativePath = '') {
  const parts = String(relativePath || '')
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(-3).join('/').toLowerCase();
}

function normalizeFileNameForMatch(fileName = '') {
  let value = String(fileName || '').trim();
  value = value
    .replace(/&#039;?/g, "'")
    .replace(/&amp;?/g, '&')
    .replace(/&lt;?/g, '<')
    .replace(/&gt;?/g, '>');
  return value.replace(/\(\d+\)(?=\.[^.]+$)/i, '');
}

function buildDriveLookup(driveFiles) {
  const byExact = new Map();
  const byLoose = new Map();
  const byFileName = new Map();
  const byRelativePath = new Map();

  for (const item of driveFiles) {
    const fileName = String(item.fileName || path.basename(item.relativePath || '')).trim();
    const normalizedFileName = normalizeFileNameForMatch(fileName);
    const pnr = String(item.personnummer || '').trim();
    const records = {
      driveFileId: item.driveFileId,
      mimeType: item.mimeType || '',
      webViewLink: item.webViewLink || '',
    };
    const exactKey = `${pnr}::${normalizedFileName.toLowerCase()}`;
    const looseName = normalizeDriveMatchKey(normalizedFileName);
    if (pnr && normalizedFileName && !byExact.has(exactKey)) {
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
    const relativeKey = normalizeRelativePathKey(item.relativePath || fileName);
    if (relativeKey && !byRelativePath.has(relativeKey)) {
      byRelativePath.set(relativeKey, records);
    }
  }

  return { byExact, byLoose, byFileName, byRelativePath };
}

function lookupDriveFile({ lookup, personnummer, fileName, relativePath }) {
  const baseName = normalizeFileNameForMatch(
    String(fileName || path.basename(relativePath || '')).trim()
  );
  const pnr = String(personnummer || '').trim();
  const relativeKey = normalizeRelativePathKey(relativePath || fileName);
  if (relativeKey && lookup.byRelativePath?.has(relativeKey)) {
    return lookup.byRelativePath.get(relativeKey);
  }
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
  normalizeFileNameForMatch,
  normalizeRelativePathKey,
};
