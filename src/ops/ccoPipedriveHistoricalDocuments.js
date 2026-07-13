'use strict';

/**
 * Mata in pipedrive_import patient_assets i dossier document-bundle (§3 offert / §4 avtal).
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function inferDocumentKind(asset = {}) {
  const section = normalizeText(asset.patientCardSection).toLowerCase();
  const sub = normalizeText(asset.subCategory).toLowerCase();
  const category = normalizeText(asset.category).toLowerCase();
  const name = normalizeText(asset.originalFileName || asset.displayName).toLowerCase();
  if (section === 'offert' || sub.includes('offer') || /offert|quote|behandlingsplan/.test(name)) {
    return 'offer';
  }
  if (
    section === 'samtycken_avtal' ||
    category === 'agreement' ||
    sub.includes('agreement') ||
    /avtal|agreement|behandlingsavtal/.test(name)
  ) {
    return 'agreement';
  }
  return 'other';
}

function pipedriveAssetToDocumentRow(asset = {}) {
  const kind = inferDocumentKind(asset);
  const title =
    normalizeText(asset.displayName) ||
    normalizeText(asset.originalFileName) ||
    (kind === 'offer' ? 'Pipedrive-offert' : 'Pipedrive-dokument');
  const assetId = normalizeText(asset.id);
  const viewUrl = assetId
    ? `/api/v1/cco/assets/${encodeURIComponent(assetId)}/download?inline=1`
    : '';
  const docDate = normalizeText(asset.documentDate).slice(0, 10);

  if (kind === 'offer') {
    return {
      instanceId: assetId,
      documentTypeId: 'pipedrive_historical_offer',
      registryId: 'pipedrive_historical_offer',
      title,
      name: title,
      label: title,
      flow: 'tp',
      flowLabel: 'TP',
      filler: 'staff',
      journeyStep: '5',
      status: 'signed',
      statusLabel: 'Importerad (Pipedrive)',
      signedAt: docDate || normalizeText(asset.importedAt).slice(0, 10) || null,
      channel: 'pipedrive',
      previewable: Boolean(viewUrl),
      viewUrl,
      assetId,
      sourceSystem: 'pipedrive_import',
    };
  }

  if (kind === 'agreement') {
    return {
      instanceId: assetId,
      documentTypeId: 'pipedrive_historical_agreement',
      registryId: 'pipedrive_historical_agreement',
      title,
      name: title,
      label: title,
      flow: 'tp',
      flowLabel: 'TP',
      filler: 'patient',
      journeyStep: '7',
      status: 'signed',
      statusLabel: 'Signerad (Pipedrive)',
      signedAt: docDate || normalizeText(asset.importedAt).slice(0, 10) || null,
      channel: 'pipedrive',
      previewable: Boolean(viewUrl),
      viewUrl,
      assetId,
      sourceSystem: 'pipedrive_import',
    };
  }

  return null;
}

function mergePipedriveHistoricalDocuments(bundle = {}, pipedriveAssets = []) {
  const safeBundle = bundle && typeof bundle === 'object' ? bundle : { documents: {} };
  const documents = { ...(safeBundle.documents || {}) };
  const existingOffers = asArray(documents.offers || documents.offerter);
  const existingHealth = asArray(
    documents.healthForms || documents.haelsoSamtycke || documents.consents
  );

  const offerRows = [];
  const agreementRows = [];
  for (const asset of pipedriveAssets) {
    if (!asset || asset.sourceSystem !== 'pipedrive_import') continue;
    if (!['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset.status)) continue;
    const row = pipedriveAssetToDocumentRow(asset);
    if (!row) continue;
    if (inferDocumentKind(asset) === 'offer') offerRows.push(row);
    else if (inferDocumentKind(asset) === 'agreement') agreementRows.push(row);
  }

  if (!offerRows.length && !agreementRows.length) {
    return safeBundle;
  }

  const mergedOffers = [...offerRows, ...existingOffers];
  const mergedHealth = [...agreementRows, ...existingHealth];
  const counts = documents.counts || safeBundle.counts || {};
  const added = offerRows.length + agreementRows.length;

  return {
    ...safeBundle,
    pipedriveHistorical: {
      offerCount: offerRows.length,
      agreementCount: agreementRows.length,
    },
    counts: {
      ...counts,
      total: Number(counts.total || 0) + added,
      done: Number(counts.done || counts.klara || 0) + added,
    },
    documents: {
      ...documents,
      offers: mergedOffers,
      offerter: mergedOffers,
      healthForms: mergedHealth,
      haelsoSamtycke: mergedHealth,
      consents: mergedHealth,
      counts: {
        ...(documents.counts || {}),
        total: Number(documents.counts?.total || counts.total || 0) + added,
        done: Number(documents.counts?.done || counts.done || 0) + added,
      },
    },
  };
}

module.exports = {
  inferDocumentKind,
  pipedriveAssetToDocumentRow,
  mergePipedriveHistoricalDocuments,
};
