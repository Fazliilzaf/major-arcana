'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST = path.join(REPO_ROOT, 'data/drive-journal-native-pilot-patients.json');

const RENDERABLE = new Set(['VERIFIED_IN_CCO', 'VISIBLE_ON_PATIENT_CARD']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadPilotManifest(filePath = DEFAULT_MANIFEST) {
  const target = normalizeText(filePath) || DEFAULT_MANIFEST;
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return null;
  }
}

function resolvePilotConfig(config = {}) {
  const enabled = config.enableDriveJournalNativePilot === true;
  const fromEnv = Array.isArray(config.driveJournalNativePilotPatientIds)
    ? config.driveJournalNativePilotPatientIds.filter(Boolean)
    : [];
  const manifestPath =
    normalizeText(config.driveJournalNativePilotManifestPath) || DEFAULT_MANIFEST;
  const manifest = loadPilotManifest(manifestPath);
  const fromManifest = Array.isArray(manifest?.patientIds)
    ? manifest.patientIds.filter(Boolean)
    : [];
  const patientIds = fromEnv.length ? fromEnv : fromManifest;
  return {
    enabled,
    manifestPath,
    maxPatients: Number(manifest?.maxPatients || config.driveJournalNativePilotMaxPatients) || 50,
    patientIds,
    selection: manifest?.selection || null,
    generatedAt: manifest?.generatedAt || null,
  };
}

function isPilotActive(pilotConfig = {}) {
  return pilotConfig.enabled === true && pilotConfig.patientIds.length > 0;
}

function isPilotPatient(patientId, pilotConfig = {}) {
  if (!isPilotActive(pilotConfig)) return false;
  return pilotConfig.patientIds.includes(normalizeText(patientId));
}

function pilotSummary(pilotConfig = {}) {
  const active = isPilotActive(pilotConfig);
  return {
    enabled: pilotConfig.enabled === true,
    active,
    maxPatients: pilotConfig.maxPatients || 50,
    patientCount: pilotConfig.patientIds?.length || 0,
    patientIds: active ? pilotConfig.patientIds : [],
    manifestPath: pilotConfig.manifestPath || DEFAULT_MANIFEST,
    generatedAt: pilotConfig.generatedAt || null,
    selection: pilotConfig.selection || null,
  };
}

function listRenderableDriveImportJournals(assetStore, patientId) {
  if (!assetStore?.listAssetsForPatient) return [];
  const rows = assetStore.listAssetsForPatient(patientId, {}, { actor: { role: 'system' } }) || [];
  return rows.filter((asset) => {
    if (asset.category !== 'journal') return false;
    if (asset.sourceSystem !== 'drive_import') return false;
    if (!RENDERABLE.has(asset.status)) return false;
    if (!asset.storageKey || !asset.checksum) return false;
    return true;
  });
}

/**
 * For pilot patients: prefer CCO storage for journal-PDF (match on driveFileId).
 * Non-journal index rows unchanged. Unmatched native journals appended.
 */
function applyNativeJournalFilesForPilot({ driveFiles = [], patientId, assetStore, pilotConfig }) {
  if (!isPilotPatient(patientId, pilotConfig)) {
    return { files: driveFiles, nativeCount: 0, replacedCount: 0 };
  }

  const nativeAssets = listRenderableDriveImportJournals(assetStore, patientId);
  if (!nativeAssets.length) {
    return { files: driveFiles, nativeCount: 0, replacedCount: 0 };
  }

  const byDriveFileId = new Map();
  for (const asset of nativeAssets) {
    const driveFileId = normalizeText(asset.originalDriveFileId);
    if (driveFileId && !byDriveFileId.has(driveFileId)) {
      byDriveFileId.set(driveFileId, asset);
    }
  }

  const usedAssetIds = new Set();
  let replacedCount = 0;
  const files = driveFiles.map((file) => {
    const driveFileId = normalizeText(file.driveFileId);
    const asset = driveFileId ? byDriveFileId.get(driveFileId) : null;
    const isJournal =
      file.fileType === 'journal_pdf' ||
      /journal/i.test(String(file.relativePath || file.originalFileName || ''));
    if (!isJournal || !asset) return file;
    usedAssetIds.add(asset.id);
    replacedCount += 1;
    return {
      ...file,
      ccoNative: true,
      ccoAssetId: asset.id,
      viewUrl: `/api/v1/cco/assets/${encodeURIComponent(asset.id)}/download?inline=1`,
      sourceSystem: 'drive_import',
      assetStatus: asset.status,
    };
  });

  for (const asset of nativeAssets) {
    if (usedAssetIds.has(asset.id)) continue;
    files.push({
      id: `cco-asset:${asset.id}`,
      fileType: 'journal_pdf',
      relativePath: asset.originalFileName || 'journal.pdf',
      originalFileName: asset.originalFileName || 'Historisk journal (PDF)',
      driveFileId: asset.originalDriveFileId || null,
      ccoNative: true,
      ccoAssetId: asset.id,
      viewUrl: `/api/v1/cco/assets/${encodeURIComponent(asset.id)}/download?inline=1`,
      sourceSystem: 'drive_import',
      assetStatus: asset.status,
      occasionContext: {},
    });
  }

  return { files, nativeCount: nativeAssets.length, replacedCount };
}

module.exports = {
  DEFAULT_MANIFEST,
  loadPilotManifest,
  resolvePilotConfig,
  isPilotActive,
  isPilotPatient,
  pilotSummary,
  listRenderableDriveImportJournals,
  applyNativeJournalFilesForPilot,
};
