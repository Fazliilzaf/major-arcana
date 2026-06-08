'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  normalizePersonnummer,
  normalizeText,
  buildFileRecord,
} = require('../../scripts/migration/lib/migrationUtils');

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    scans: [],
    files: [],
    profilesByPersonnummer: {},
    stats: {},
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function buildFilesByPersonnummer(files) {
  const index = new Map();
  for (const file of asArray(files)) {
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!index.has(pnr)) index.set(pnr, []);
    index.get(pnr).push(file);
  }
  return index;
}

function aggregateProfiles(files) {
  const profiles = {};
  for (const file of files) {
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!profiles[pnr]) {
      profiles[pnr] = {
        personnummer: pnr,
        displayName: file.displayName || '',
        fileCount: 0,
        journalPdfCount: 0,
        imageCount: 0,
        documentCount: 0,
        files: [],
      };
    }
    const profile = profiles[pnr];
    profile.fileCount += 1;
    if (file.fileType === 'journal_pdf') profile.journalPdfCount += 1;
    if (file.fileType === 'image') profile.imageCount += 1;
    if (file.fileType.startsWith('document')) profile.documentCount += 1;
    if (!profile.displayName && file.displayName) profile.displayName = file.displayName;
    profile.files.push(file.id);
  }
  return profiles;
}

async function createCcoMigrationIndexStore({ filePath }) {
  const state = await readJson(filePath, emptyState());
  let filesByPersonnummer = buildFilesByPersonnummer(state.files);

  function rebuildFileIndex() {
    filesByPersonnummer = buildFilesByPersonnummer(state.files);
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function replaceScanResult({ scanMeta, files }) {
    state.scans = [scanMeta, ...asArray(state.scans).slice(0, 9)];
    state.files = asArray(files);
    state.profilesByPersonnummer = aggregateProfiles(state.files);
    state.stats = {
      totalFiles: state.files.length,
      totalProfiles: Object.keys(state.profilesByPersonnummer).length,
      journalPdfs: state.files.filter((item) => item.fileType === 'journal_pdf').length,
      images: state.files.filter((item) => item.fileType === 'image').length,
      scannedAt: scanMeta.completedAt,
      zipCount: scanMeta.zipCount,
      badZipCount: scanMeta.badZipCount,
    };
    rebuildFileIndex();
    await save();
    return state.stats;
  }

  async function getStats() {
    return state.stats || {};
  }

  async function listProfiles({ limit = 200, offset = 0 } = {}) {
    const rows = Object.values(state.profilesByPersonnummer || {});
    rows.sort((a, b) =>
      normalizeText(a.displayName).localeCompare(normalizeText(b.displayName), 'sv')
    );
    const start = Math.max(0, Number(offset) || 0);
    const max = Math.max(1, Math.min(1000, Number(limit) || 200));
    return {
      total: rows.length,
      offset: start,
      limit: max,
      profiles: rows.slice(start, start + max),
    };
  }

  async function getFilesForPersonnummer(personnummer) {
    const pnr = normalizePersonnummer(personnummer);
    if (!pnr) return [];
    return filesByPersonnummer.get(pnr) || [];
  }

  async function getProfile(personnummer) {
    const pnr = normalizePersonnummer(personnummer);
    if (!pnr) return null;
    return state.profilesByPersonnummer[pnr] || null;
  }

  async function getFileById(fileId) {
    const id = normalizeText(fileId);
    if (!id) return null;
    return state.files.find((item) => item.id === id) || null;
  }

  function listAllFiles() {
    return asArray(state.files);
  }

  // Re-point every file from one personnummer to another. Used when merging a
  // secondary patient (different/blank personnummer) into a primary so that the
  // secondary's Drive files follow the patient. No-op when the personnummer are
  // equal (files already resolve to the same profile).
  async function reassignPersonnummer({ from, to } = {}) {
    const fromPnr = normalizePersonnummer(from);
    const toPnr = normalizePersonnummer(to);
    if (!fromPnr || !toPnr || fromPnr === toPnr) return { moved: 0 };
    let moved = 0;
    for (const file of asArray(state.files)) {
      if (normalizePersonnummer(file.personnummer) === fromPnr) {
        file.personnummer = toPnr;
        moved += 1;
      }
    }
    if (moved > 0) {
      state.profilesByPersonnummer = aggregateProfiles(state.files);
      rebuildFileIndex();
      await save();
    }
    return { moved };
  }

  async function bulkUpdateFileNames(deltas = []) {
    const rollback = [];
    let changed = 0;
    let skipped = 0;
    for (const delta of asArray(deltas)) {
      const id = normalizeText(delta?.fileId);
      const nextName = normalizeText(delta?.name);
      if (!id || !nextName) {
        skipped += 1;
        continue;
      }
      const file = state.files.find((item) => item.id === id);
      if (!file) {
        skipped += 1;
        continue;
      }
      const oldName = normalizeText(file.fileName || file.relativePath);
      if (oldName === nextName) {
        skipped += 1;
        continue;
      }
      rollback.push({ fileId: id, oldName, newName: nextName });
      file.fileName = nextName;
      changed += 1;
    }
    if (changed > 0) {
      await save();
    }
    return { changed, skipped, rollback };
  }

  async function updateFileName({ fileId, name }) {
    const id = normalizeText(fileId);
    const nextName = normalizeText(name);
    if (!id || !nextName) {
      return { changed: false, file: null, notFound: false, oldName: null, newName: nextName };
    }
    const file = state.files.find((item) => item.id === id);
    if (!file) {
      return { changed: false, file: null, notFound: true, oldName: null, newName: nextName };
    }
    const oldName = normalizeText(file.fileName || file.relativePath);
    if (oldName === nextName) {
      return { changed: false, file, notFound: false, oldName, newName: nextName };
    }
    const result = await bulkUpdateFileNames([{ fileId: id, name: nextName }]);
    return {
      changed: result.changed > 0,
      file,
      notFound: false,
      oldName,
      newName: nextName,
      rollback: result.rollback,
    };
  }

  return {
    bulkUpdateFileNames,
    getFileById,
    getFilesForPersonnummer,
    getProfile,
    getStats,
    listAllFiles,
    listProfiles,
    reassignPersonnummer,
    replaceScanResult,
    updateFileName,
  };
}

module.exports = {
  aggregateProfiles,
  buildFileRecord,
  buildFilesByPersonnummer,
  createCcoMigrationIndexStore,
};
