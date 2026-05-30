'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_PILOT_FILE = path.join(REPO_ROOT, 'data/p0-photo-review-fas2-pilot-patients.json');

function isPilotRestricted(pilotConfig = {}) {
  if (pilotConfig.fullCohort === true) return false;
  return resolvePilotPatientIds(pilotConfig).length > 0;
}

function loadPilotManifest(filePath = DEFAULT_PILOT_FILE) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolvePilotPatientIds(pilotConfig = {}) {
  if (pilotConfig.fullCohort === true) return [];
  const fromEnv = pilotConfig.patientIds || [];
  if (fromEnv.length) return fromEnv;
  const manifest = loadPilotManifest(pilotConfig.manifestPath);
  if (manifest?.patientIds?.length) return manifest.patientIds;
  return [];
}

function countPilotDecisions(auditLog) {
  if (!auditLog?.query) return 0;
  const items =
    auditLog.query({
      action: 'photo_review.decision',
      limit: 100000,
    }) || [];
  return items.length;
}

function aggregateDecisionStats(auditLog) {
  const stats = { approve: 0, reject: 0, reassign: 0, total: 0 };
  if (!auditLog?.query) return stats;
  const items = auditLog.query({ action: 'photo_review.decision', limit: 100000 }) || [];
  for (const entry of items) {
    const d = entry.detail?.decision;
    stats.total += 1;
    if (d === 'approve') stats.approve += 1;
    else if (d === 'reject') stats.reject += 1;
    else if (d === 'reassign') stats.reassign += 1;
  }
  return stats;
}

function assertPilotWriteAllowed({ asset, pilotConfig, auditLog }) {
  if (!isPilotRestricted(pilotConfig)) return;

  const patientIds = resolvePilotPatientIds(pilotConfig);
  if (!patientIds.includes(asset.patientId)) {
    const e = new Error('pilot_patient_not_allowed');
    e.statusCode = 403;
    e.detail = { patientId: asset.patientId, allowedPatients: patientIds.length };
    throw e;
  }

  const maxDecisions = Number(pilotConfig.maxDecisions) || 20;
  const used = countPilotDecisions(auditLog);
  if (used >= maxDecisions) {
    const e = new Error('pilot_decision_limit_reached');
    e.statusCode = 429;
    e.detail = { maxDecisions, used };
    throw e;
  }
}

function filterPatientsForPilot(patients, pilotConfig) {
  if (!isPilotRestricted(pilotConfig)) return patients;
  const ids = new Set(resolvePilotPatientIds(pilotConfig));
  return patients.filter((p) => ids.has(p.patientId));
}

function pilotSummary(pilotConfig, auditLog) {
  if (pilotConfig?.fullCohort === true) {
    const decisionsUsed = countPilotDecisions(auditLog);
    return {
      active: false,
      fullCohort: true,
      patientIds: [],
      maxDecisions: 0,
      decisionsUsed,
      decisionsRemaining: null,
    };
  }

  const patientIds = resolvePilotPatientIds(pilotConfig);
  if (!patientIds.length) {
    return {
      active: false,
      fullCohort: false,
      patientIds: [],
      maxDecisions: 0,
      decisionsUsed: countPilotDecisions(auditLog),
      decisionsRemaining: null,
    };
  }
  const maxDecisions = Number(pilotConfig.maxDecisions) || 20;
  const decisionsUsed = countPilotDecisions(auditLog);
  return {
    active: true,
    fullCohort: false,
    patientIds,
    maxPatients: Number(pilotConfig.maxPatients) || 5,
    maxDecisions,
    decisionsUsed,
    decisionsRemaining: Math.max(0, maxDecisions - decisionsUsed),
  };
}

module.exports = {
  isPilotRestricted,
  loadPilotManifest,
  resolvePilotPatientIds,
  countPilotDecisions,
  aggregateDecisionStats,
  assertPilotWriteAllowed,
  filterPatientsForPilot,
  pilotSummary,
  DEFAULT_PILOT_FILE,
};
