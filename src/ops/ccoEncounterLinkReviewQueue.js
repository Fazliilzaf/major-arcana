'use strict';

const { resolveCanonicalPatientsForAssets } = require('./ccoPatientAssetIdentity');
const { isMediaAsset } = require('./ccoEncounterLinkRepair');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function mask(value) {
  const valueText = text(value);
  if (valueText.length < 9) return valueText;
  return `${valueText.slice(0, 4)}***${valueText.slice(-4)}`;
}

const STRONG_IDENTITY_REASONS = new Set([
  'direct_patient_id',
  'personnummer_path',
  'exact_name_path',
]);

function buildEncounterLinkReviewQueue({ assets = [], patients = [], includeDetails = false } = {}) {
  const missing = assets.filter(
    (asset) =>
      ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status) &&
      isMediaAsset(asset) &&
      !text(asset?.encounterId)
  );
  const mappings = resolveCanonicalPatientsForAssets({ patients, assets: missing });
  const patientsById = new Map(patients.map((patient) => [text(patient?.id), patient]));
  const assetsById = new Map(missing.map((asset) => [text(asset?.id), asset]));
  const reviewGroups = new Map();
  for (const mapping of mappings) {
    const key = [
      text(mapping.assetPatientId),
      text(mapping.canonicalPatientId),
      text(mapping.reason),
      ...(mapping.candidatePatientIds || []).map(text).sort(),
    ].join('|');
    if (!reviewGroups.has(key)) reviewGroups.set(key, { mapping, assets: [] });
    const asset = assetsById.get(text(mapping.assetId));
    if (asset) reviewGroups.get(key).assets.push(asset);
  }

  const groups = [...reviewGroups.values()].map(({ mapping, assets: groupAssets }) => {
      const canonicalPatientId = text(mapping.canonicalPatientId);
      const identityStrong = Boolean(canonicalPatientId) && STRONG_IDENTITY_REASONS.has(mapping.reason);
      return {
        assetPatientId: includeDetails ? text(mapping.assetPatientId) : mask(mapping.assetPatientId),
        canonicalPatientId: includeDetails ? canonicalPatientId || null : mask(canonicalPatientId) || null,
        reason: mapping.reason,
        status: identityStrong
          ? 'AWAITING_MANUAL_ENCOUNTER'
          : 'AWAITING_MANUAL_IDENTITY_AND_ENCOUNTER',
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
        resolutionRequires: identityStrong ? ['encounterId'] : ['canonicalPatientId', 'encounterId'],
      };
    });

  return {
    zeroWrites: true,
    stats: {
      missingEncounterId: missing.length,
      identityResolved: mappings.filter((mapping) => text(mapping?.canonicalPatientId)).length,
      reviewGroups: groups.length,
      reviewAssets: groups.reduce((sum, group) => sum + group.assets.length, 0),
      encounterOnlyGroups: groups.filter((group) => group.status === 'AWAITING_MANUAL_ENCOUNTER').length,
      encounterOnlyAssets: groups
        .filter((group) => group.status === 'AWAITING_MANUAL_ENCOUNTER')
        .reduce((sum, group) => sum + group.assets.length, 0),
      identityAndEncounterGroups: groups.filter(
        (group) => group.status === 'AWAITING_MANUAL_IDENTITY_AND_ENCOUNTER'
      ).length,
      identityAndEncounterAssets: groups
        .filter((group) => group.status === 'AWAITING_MANUAL_IDENTITY_AND_ENCOUNTER')
        .reduce((sum, group) => sum + group.assets.length, 0),
      ambiguousGroups: groups.filter((group) => group.reason === 'ambiguous_path_identity').length,
      unresolvedGroups: groups.filter((group) => group.reason === 'unresolved_path_identity').length,
    },
    groups,
  };
}

module.exports = { buildEncounterLinkReviewQueue };
