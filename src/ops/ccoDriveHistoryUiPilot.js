'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MANIFEST = path.join(REPO_ROOT, 'migration/cco/drive-history-ui-pilot-patient.json');

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
  const enabled = config.enableDriveHistoryUiPilot === true;
  const fromEnv = Array.isArray(config.driveHistoryUiPilotPatientIds)
    ? config.driveHistoryUiPilotPatientIds.filter(Boolean)
    : [];
  const manifestPath = normalizeText(config.driveHistoryUiPilotManifestPath) || DEFAULT_MANIFEST;
  const manifest = loadPilotManifest(manifestPath);
  const fromManifest = Array.isArray(manifest?.patientIds)
    ? manifest.patientIds.filter(Boolean)
    : [];
  const patientIds = fromEnv.length ? fromEnv : fromManifest;
  return {
    enabled,
    manifestPath,
    patientIds,
    patients: Array.isArray(manifest?.patients) ? manifest.patients : [],
    generatedAt: manifest?.generatedAt || null,
    description: manifest?.description || null,
  };
}

function isPilotActive(pilotConfig = {}) {
  return pilotConfig.enabled === true && pilotConfig.patientIds.length > 0;
}

function isPilotPatient(patientId, pilotConfig = {}) {
  if (!isPilotActive(pilotConfig)) return true;
  return pilotConfig.patientIds.includes(normalizeText(patientId));
}

function filterDrivePayloadForPilot({
  patientId,
  driveFiles = [],
  occasionTimeline = [],
  pilotConfig,
}) {
  if (!isPilotActive(pilotConfig) || isPilotPatient(patientId, pilotConfig)) {
    return { driveFiles, occasionTimeline, gated: false };
  }
  return { driveFiles: [], occasionTimeline: [], gated: true };
}

function pilotSummary(pilotConfig = {}) {
  const active = isPilotActive(pilotConfig);
  return {
    enabled: pilotConfig.enabled === true,
    active,
    patientCount: pilotConfig.patientIds?.length || 0,
    patientIds: active ? pilotConfig.patientIds : [],
    patients: active ? pilotConfig.patients || [] : [],
    manifestPath: pilotConfig.manifestPath || DEFAULT_MANIFEST,
    generatedAt: pilotConfig.generatedAt || null,
    description: pilotConfig.description || null,
  };
}

module.exports = {
  DEFAULT_MANIFEST,
  loadPilotManifest,
  resolvePilotConfig,
  isPilotActive,
  isPilotPatient,
  filterDrivePayloadForPilot,
  pilotSummary,
};
