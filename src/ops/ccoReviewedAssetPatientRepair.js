'use strict';

const { isMediaAsset } = require('./ccoEncounterLinkRepair');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildReviewedAssetPatientRepairPlan({ assignments = [], assetStore, patients = [] } = {}) {
  const patientsById = new Map(asArray(patients).map((patient) => [text(patient?.id), patient]));
  const seenAssetIds = new Set();
  const rows = [];

  for (const assignment of asArray(assignments)) {
    const patientId = text(assignment?.patientId);
    const evidence = text(assignment?.evidence);
    if (!patientId || !patientsById.has(patientId)) {
      const error = new Error(`Okand canonical patientId: ${patientId || '(tom)'}.`);
      error.statusCode = 400;
      throw error;
    }
    if (!evidence) {
      const error = new Error(`evidence kravs for ${patientId}.`);
      error.statusCode = 400;
      throw error;
    }
    for (const rawAssetId of asArray(assignment?.assetIds)) {
      const assetId = text(rawAssetId);
      if (!assetId || seenAssetIds.has(assetId)) {
        const error = new Error(`Ogiltigt eller dubblerat assetId: ${assetId || '(tom)'}.`);
        error.statusCode = 400;
        throw error;
      }
      seenAssetIds.add(assetId);
      const asset = assetStore?.getAsset?.(assetId);
      if (!asset) {
        const error = new Error(`Asset hittades inte: ${assetId}.`);
        error.statusCode = 404;
        throw error;
      }
      if (
        !['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset.status) ||
        !isMediaAsset(asset) ||
        text(asset.encounterId)
      ) {
        const error = new Error(`Asset ar inte ett oppet mediafall: ${assetId}.`);
        error.statusCode = 409;
        throw error;
      }
      rows.push({
        assetId,
        fromPatientId: text(asset.patientId),
        patientId,
        evidence,
      });
    }
  }
  return rows;
}

async function repairReviewedAssetPatientLinks({
  assignments = [],
  assetStore,
  patients = [],
  dryRun = true,
  actor = {},
} = {}) {
  const plan = buildReviewedAssetPatientRepairPlan({ assignments, assetStore, patients });
  const results = [];
  if (!dryRun && typeof assetStore?.beginBatch === 'function') assetStore.beginBatch();
  try {
    for (const row of plan) {
      if (dryRun) {
        results.push({ ...row, status: 'would_link_patient' });
        continue;
      }
      const linked = await assetStore.linkAssetToPatient(row.assetId, row.patientId, { actor });
      results.push({ ...row, patientId: text(linked?.patientId) || row.patientId, status: 'linked_patient' });
    }
  } finally {
    if (!dryRun && typeof assetStore?.flushBatch === 'function') await assetStore.flushBatch();
  }
  return {
    dryRun,
    zeroWrites: dryRun,
    stats: { reviewed: plan.length, linked: dryRun ? 0 : results.length, failed: 0 },
    results,
  };
}

module.exports = { buildReviewedAssetPatientRepairPlan, repairReviewedAssetPatientLinks };
