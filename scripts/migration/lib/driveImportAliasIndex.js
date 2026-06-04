'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.join('data', 'drive-import-alias-index.json');

function emptyState() {
  return { driveFileIds: [], sourceRecordIds: [], updatedAt: null };
}

function loadDriveImportAliasIndex(filePath = DEFAULT_PATH) {
  if (!fs.existsSync(filePath)) return emptyState();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      driveFileIds: Array.isArray(raw.driveFileIds) ? raw.driveFileIds : [],
      sourceRecordIds: Array.isArray(raw.sourceRecordIds) ? raw.sourceRecordIds : [],
      updatedAt: raw.updatedAt || null,
    };
  } catch {
    return emptyState();
  }
}

function mergeAliasIntoCcoIndex(ccoIndex, aliasIndex) {
  for (const id of aliasIndex.driveFileIds || []) ccoIndex.driveIds.add(id);
  for (const id of aliasIndex.sourceRecordIds || []) ccoIndex.sourceRecordIds.add(id);
  return ccoIndex;
}

function recordDriveImportAlias({ filePath = DEFAULT_PATH, driveFileId, sourceRecordId } = {}) {
  const state = loadDriveImportAliasIndex(filePath);
  const driveSet = new Set(state.driveFileIds);
  const sourceSet = new Set(state.sourceRecordIds);
  if (driveFileId) driveSet.add(driveFileId);
  if (sourceRecordId) sourceSet.add(sourceRecordId);
  const next = {
    driveFileIds: [...driveSet],
    sourceRecordIds: [...sourceSet],
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

module.exports = {
  loadDriveImportAliasIndex,
  mergeAliasIntoCcoIndex,
  recordDriveImportAlias,
};
