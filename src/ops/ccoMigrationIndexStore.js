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

  return {
    getFileById,
    getFilesForPersonnummer,
    getProfile,
    getStats,
    listProfiles,
    replaceScanResult,
  };
}

module.exports = {
  aggregateProfiles,
  buildFileRecord,
  buildFilesByPersonnummer,
  createCcoMigrationIndexStore,
};
