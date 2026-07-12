'use strict';

const {
  assetEncounterDate,
  buildEncounterRegistry,
  mapAssetsToEncounters,
} = require('./ccoAssetNaming/encounterMapper');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function maskValue(value = '', { keepStart = 3, keepEnd = 3 } = {}) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= keepStart + keepEnd) return '*'.repeat(text.length);
  return `${text.slice(0, keepStart)}***${text.slice(-keepEnd)}`;
}

function isMediaAsset(asset = {}) {
  const category = normalizeText(asset.category).toLowerCase();
  const mime = normalizeText(asset.mimeType).toLowerCase();
  const name = normalizeText(asset.originalFileName || asset.displayName).toLowerCase();
  return (
    category.startsWith('photo_') ||
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    /\.(heic|heif|jpe?g|png|webp|gif|mp4|mov|m4v|webm)$/i.test(name)
  );
}

function maskCandidates(candidates = []) {
  return asArray(candidates).map((id) => maskValue(id, { keepStart: 5, keepEnd: 4 }));
}

function buildPreviewCase(asset = {}, mapping = {}) {
  const date = assetEncounterDate(asset);
  const currentEncounterId = normalizeText(asset.encounterId);
  return {
    patientId: maskValue(asset.canonicalPatientId || asset.patientId),
    assetPatientId: maskValue(asset.assetPatientId || asset.patientId),
    assetId: maskValue(asset.id, { keepStart: 4, keepEnd: 4 }),
    fileName: maskValue(asset.originalFileName || asset.displayName, { keepStart: 1, keepEnd: 1 }),
    date: date || null,
    currentEncounterId: currentEncounterId
      ? maskValue(currentEncounterId, { keepStart: 6, keepEnd: 4 })
      : null,
    proposedEncounterId: mapping.encounterId
      ? maskValue(mapping.encounterId, { keepStart: 6, keepEnd: 4 })
      : null,
    confidence: mapping.confidence || 'review',
    reason: mapping.reason || 'unclassified',
    encounterType: mapping.encounterType || null,
    visitLabel: mapping.visitLabel || null,
    candidates: maskCandidates(mapping.candidates),
  };
}

/**
 * Read-only preview for existing media assets without encounterId.
 * patientInputs must already be canonicalized by the route; this module never
 * guesses patient identity and never writes to the asset store.
 */
function buildEncounterLinkRepairPlan({ patientInputs = [] } = {}) {
  const canonicalAssets = [];
  const registryInputs = [];

  for (const input of asArray(patientInputs)) {
    const canonicalPatientId = normalizeText(input.patientId);
    if (!canonicalPatientId) continue;
    const assets = asArray(input.assets)
      .filter((asset) => ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status))
      .map((asset) => ({
        ...asset,
        patientId: canonicalPatientId,
        canonicalPatientId,
        assetPatientId: normalizeText(asset.patientId),
      }));
    canonicalAssets.push(...assets);
    registryInputs.push({
      patientId: canonicalPatientId,
      assets,
      journalEntries: asArray(input.journalEntries),
      bookings: asArray(input.bookings),
    });
  }

  const registry = buildEncounterRegistry({
    journalEntries: registryInputs.flatMap((input) => input.journalEntries),
    bookings: registryInputs.flatMap((input) => input.bookings),
    assets: canonicalAssets,
  });
  const mappings = mapAssetsToEncounters(canonicalAssets, registry);
  const assetById = new Map(canonicalAssets.map((asset) => [asset.id, asset]));
  const mediaMappings = mappings.filter((mapping) => isMediaAsset(assetById.get(mapping.assetId)));
  const missingMappings = mediaMappings.filter(
    (mapping) => !assetById.get(mapping.assetId)?.encounterId
  );
  const linkable = missingMappings.filter((mapping) =>
    ['high', 'medium'].includes(mapping.confidence)
  );
  const review = missingMappings.filter((mapping) => mapping.confidence === 'review');
  const noDate = missingMappings.filter((mapping) => mapping.reason === 'missing_date');
  return {
    canonicalAssets,
    registryInputs,
    mediaMappings,
    missingMappings,
    linkable,
    review,
    noDate,
    assetById,
  };
}

function previewEncounterLinkRepair({ patientInputs = [], sampleSize = 25 } = {}) {
  const plan = buildEncounterLinkRepairPlan({ patientInputs });
  const {
    canonicalAssets,
    registryInputs,
    mediaMappings,
    missingMappings,
    linkable,
    review,
    noDate,
    assetById,
  } = plan;
  const samples = [];
  for (const mapping of [...linkable, ...review]) {
    if (samples.length >= Math.max(1, Number(sampleSize) || 25)) break;
    const asset = assetById.get(mapping.assetId);
    if (asset) samples.push(buildPreviewCase(asset, mapping));
  }

  return {
    generatedAt: new Date().toISOString(),
    zeroWrites: true,
    dryRun: true,
    model: 'Read-only encounter-link preview · canonical patient IDs · no writes',
    stats: {
      patientsScanned: registryInputs.length,
      assetsScanned: canonicalAssets.length,
      mediaAssets: mediaMappings.length,
      alreadyLinked: mediaMappings.length - missingMappings.length,
      missingEncounterId: missingMappings.length,
      linkable: linkable.length,
      linkableHigh: linkable.filter((mapping) => mapping.confidence === 'high').length,
      linkableMedium: linkable.filter((mapping) => mapping.confidence === 'medium').length,
      review: review.length,
      missingDate: noDate.length,
    },
    samples,
  };
}

module.exports = {
  buildEncounterLinkRepairPlan,
  isMediaAsset,
  previewEncounterLinkRepair,
};
