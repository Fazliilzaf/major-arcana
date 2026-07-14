'use strict';

const { createCcoAssetImportPipeline } = require('./ccoAssetImportPipeline');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function existingAttachment(assetStore, sourceRecordId) {
  if (!assetStore?.listItemsForEnrichment || !sourceRecordId) return null;
  return (
    assetStore
      .listItemsForEnrichment()
      .find(
        (asset) =>
          asset?.sourceSystem === 'm365_halso' && asset?.sourceRecordId === sourceRecordId
      ) || null
  );
}

async function importHalsoFormAttachments({
  attachments = [],
  rawMessage = {},
  formResult = {},
  tenantId,
  stores,
  actor = { role: 'system', userId: 'halso-hd-scheduler' },
  pipelineFactory = createCcoAssetImportPipeline,
} = {}) {
  if (!formResult?.patientId || formResult?.needsReview) {
    return { imported: 0, duplicate: 0, skipped: attachments.length, failed: 0, runId: null };
  }
  if (!stores?.assetStore || !stores?.importRunStore || !stores?.reviewQueueStore || !stores?.secureStorage) {
    return { imported: 0, duplicate: 0, skipped: attachments.length, failed: 0, runId: null };
  }

  const pending = attachments.filter((attachment) => {
    const sourceRecordId = `${normalizeText(rawMessage.id)}:${normalizeText(attachment.id)}`;
    return sourceRecordId && !existingAttachment(stores.assetStore, sourceRecordId);
  });
  if (!pending.length) {
    return { imported: 0, duplicate: 0, skipped: attachments.length, failed: 0, runId: null };
  }

  const runId = await stores.importRunStore.startRun(
    { sourceSystem: 'm365_halso', mode: 'incremental', createdBy: actor.userId },
    { actor }
  );
  const pipeline = pipelineFactory({
    assetStore: stores.assetStore,
    importRunStore: stores.importRunStore,
    reviewQueueStore: stores.reviewQueueStore,
    storage: stores.secureStorage,
  });
  const stats = { imported: 0, duplicate: 0, skipped: attachments.length - pending.length, failed: 0 };

  try {
    for (const attachment of pending) {
      const result = await pipeline.importSingleAsset({
        sourceSystem: 'm365_halso',
        importRunId: runId,
        tenantId,
        actor: { ...actor, tenantId },
        sourceRecord: {
          sourceRecordId: `${normalizeText(rawMessage.id)}:${normalizeText(attachment.id)}`,
          patientId: formResult.patientId,
          originalFileName: normalizeText(attachment.name) || 'halso-form.pdf',
          mimeType: normalizeText(attachment.contentType) || 'application/pdf',
          documentDate: formResult.parsed?.signedAt || rawMessage.receivedAt || null,
          body: attachment.body,
        },
      });
      if (result?.status === 'DUPLICATE') {
        await stores.assetStore.transitionStatus(result.asset.id, 'VERIFIED_IN_CCO', {
          actor: { ...actor, tenantId },
          reason: 'halso_form_pdf_checksum_verified',
        });
        await stores.assetStore.markAsVisibleOnPatientCard(result.asset.id, {
          actor: { ...actor, tenantId },
        });
        stats.duplicate += 1;
      }
      else if (result?.ok) stats.imported += 1;
      else stats.failed += 1;
    }
  } finally {
    await stores.importRunStore.finishRun(runId, { actor: { ...actor, tenantId } });
  }

  return { ...stats, runId };
}

module.exports = { importHalsoFormAttachments };
