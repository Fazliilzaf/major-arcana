'use strict';

const { isMediaAsset } = require('./ccoEncounterLinkRepair');
const { resolveCanonicalPatientsForAssets } = require('./ccoPatientAssetIdentity');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const SAFE_REASONS = new Set(['personnummer_path', 'exact_name_path']);

function buildCanonicalAssetPatientRepairPlan({ assets = [], patients = [] } = {}) {
  const candidates = asArray(assets).filter(
    (asset) =>
      ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status) &&
      isMediaAsset(asset) &&
      !text(asset?.encounterId)
  );
  const assetById = new Map(candidates.map((asset) => [text(asset?.id), asset]));
  const mappings = resolveCanonicalPatientsForAssets({ patients, assets: candidates });
  const eligible = mappings.filter(
    (mapping) =>
      SAFE_REASONS.has(mapping.reason) &&
      text(mapping.canonicalPatientId) &&
      text(mapping.canonicalPatientId) !== text(mapping.assetPatientId)
  );
  return { candidates, mappings, eligible, assetById };
}

async function repairCanonicalAssetPatientLinks({
  assets = [],
  patients = [],
  assetStore,
  dryRun = true,
  limit = 200,
  offset = 0,
  actor = {},
} = {}) {
  const plan = buildCanonicalAssetPatientRepairPlan({ assets, patients });
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 200));
  const batch = plan.eligible.slice(safeOffset, safeOffset + safeLimit);
  const results = [];

  if (!dryRun && typeof assetStore?.beginBatch === 'function') assetStore.beginBatch();
  try {
    for (const mapping of batch) {
      if (dryRun) {
        results.push({
          assetId: mapping.assetId,
          fromPatientId: mapping.assetPatientId,
          patientId: mapping.canonicalPatientId,
          reason: mapping.reason,
          status: 'would_link_patient',
        });
        continue;
      }
      const linked = await assetStore.linkAssetToPatient(
        mapping.assetId,
        mapping.canonicalPatientId,
        { actor }
      );
      results.push({
        assetId: mapping.assetId,
        fromPatientId: mapping.assetPatientId,
        patientId: linked?.patientId || mapping.canonicalPatientId,
        reason: mapping.reason,
        status: 'linked_patient',
      });
    }
  } finally {
    if (!dryRun && typeof assetStore?.flushBatch === 'function') await assetStore.flushBatch();
  }

  return {
    dryRun,
    zeroWrites: dryRun,
    stats: {
      candidates: plan.candidates.length,
      identityResolved: plan.mappings.filter((row) => text(row.canonicalPatientId)).length,
      eligible: plan.eligible.length,
      batchSize: batch.length,
      linked: dryRun ? 0 : results.length,
      remainingEligible: Math.max(0, plan.eligible.length - safeOffset - batch.length),
    },
    results,
  };
}

module.exports = {
  SAFE_REASONS,
  buildCanonicalAssetPatientRepairPlan,
  repairCanonicalAssetPatientLinks,
};
