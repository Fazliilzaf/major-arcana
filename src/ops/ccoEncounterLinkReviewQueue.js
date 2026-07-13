'use strict';

const { resolveCanonicalPatientsForAssetAliases } = require('./ccoPatientAssetIdentity');
const { isMediaAsset } = require('./ccoEncounterLinkRepair');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function mask(value) {
  const valueText = text(value);
  if (valueText.length < 9) return valueText;
  return `${valueText.slice(0, 4)}***${valueText.slice(-4)}`;
}

function buildEncounterLinkReviewQueue({ assets = [], patients = [], includeDetails = false } = {}) {
  const missing = assets.filter(
    (asset) =>
      ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status) &&
      isMediaAsset(asset) &&
      !text(asset?.encounterId)
  );
  const mappings = resolveCanonicalPatientsForAssetAliases({ patients, assets: missing });
  const patientsById = new Map(patients.map((patient) => [text(patient?.id), patient]));
  const assetsByPatientId = new Map();
  for (const asset of missing) {
    const patientId = text(asset?.patientId);
    if (!assetsByPatientId.has(patientId)) assetsByPatientId.set(patientId, []);
    assetsByPatientId.get(patientId).push(asset);
  }

  const groups = mappings
    .filter((mapping) => !text(mapping?.canonicalPatientId))
    .map((mapping) => {
      const groupAssets = assetsByPatientId.get(text(mapping.assetPatientId)) || [];
      return {
        assetPatientId: includeDetails ? text(mapping.assetPatientId) : mask(mapping.assetPatientId),
        reason: mapping.reason,
        status: 'AWAITING_MANUAL_IDENTITY_AND_ENCOUNTER',
        candidatePatients: (mapping.candidatePatientIds || []).map((patientId) => {
          const patient = patientsById.get(text(patientId));
          return {
            patientId: includeDetails ? text(patientId) : mask(patientId),
            displayName: includeDetails ? text(patient?.displayName) || null : null,
          };
        }),
        assets: groupAssets.map((asset) => ({
          assetId: includeDetails ? text(asset?.id) : mask(asset?.id),
          fileName: includeDetails ? text(asset?.originalFileName) || null : null,
          category: text(asset?.category) || null,
          mimeType: text(asset?.mimeType) || null,
          documentDate: text(asset?.documentDate) || null,
          path: includeDetails
            ? text(asset?.relativePath || asset?.originalDrivePath) || null
            : null,
        })),
        resolutionRequires: ['canonicalPatientId', 'encounterId'],
      };
    });

  return {
    zeroWrites: true,
    stats: {
      missingEncounterId: missing.length,
      reviewGroups: groups.length,
      reviewAssets: groups.reduce((sum, group) => sum + group.assets.length, 0),
      ambiguousGroups: groups.filter((group) => group.reason === 'ambiguous_path_identity').length,
      unresolvedGroups: groups.filter((group) => group.reason === 'unresolved_path_identity').length,
    },
    groups,
  };
}

module.exports = { buildEncounterLinkReviewQueue };
