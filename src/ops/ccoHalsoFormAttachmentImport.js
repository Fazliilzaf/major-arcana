'use strict';

const { createCcoAssetImportPipeline } = require('./ccoAssetImportPipeline');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function attachmentSourceRecordId(rawMessage, attachment) {
  const messageId = normalizeText(rawMessage?.id);
  const attachmentId = normalizeText(attachment?.id);
  return messageId && attachmentId ? `${messageId}:${attachmentId}` : '';
}

function existingAttachments(assetStore, sourceRecordId) {
  if (!assetStore?.listItemsForEnrichment || !sourceRecordId) return [];
  return assetStore.listItemsForEnrichment().filter(
    (asset) => asset?.sourceSystem === 'm365_halso' && asset?.sourceRecordId === sourceRecordId
  );
}

async function promoteStoredAttachment(assetStore, asset, actor) {
  if (asset.status === 'DUPLICATE') {
    await assetStore.transitionStatus(asset.id, 'VERIFIED_IN_CCO', {
      actor,
      reason: 'halso_form_pdf_checksum_verified',
    });
  }
  await assetStore.markAsVisibleOnPatientCard(asset.id, { actor });
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

  const stats = { imported: 0, duplicate: 0, skipped: 0, failed: 0 };
  const resolvedActor = { ...actor, tenantId };
  const pending = [];
  for (const attachment of attachments) {
    const sourceRecordId = attachmentSourceRecordId(rawMessage, attachment);
    if (!sourceRecordId) {
      stats.skipped += 1;
      continue;
    }
    const existing = existingAttachments(stores.assetStore, sourceRecordId);
    if (existing.some((asset) => asset.status === 'VISIBLE_ON_PATIENT_CARD')) {
      stats.skipped += 1;
      continue;
    }
    const recoverable =
      existing.find((asset) => asset.status === 'VERIFIED_IN_CCO') ||
      existing.find((asset) => asset.status === 'DUPLICATE');
    if (recoverable) {
      await promoteStoredAttachment(stores.assetStore, recoverable, resolvedActor);
      if (recoverable.status === 'DUPLICATE') stats.duplicate += 1;
      else stats.imported += 1;
      continue;
    }
    pending.push({ attachment, sourceRecordId });
  }
  if (!pending.length) {
    return { ...stats, runId: null };
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
  try {
    for (const { attachment, sourceRecordId } of pending) {
      const result = await pipeline.importSingleAsset({
        sourceSystem: 'm365_halso',
        importRunId: runId,
        tenantId,
        actor: resolvedActor,
        sourceRecord: {
          sourceRecordId,
          patientId: formResult.patientId,
          originalFileName: normalizeText(attachment.name) || 'halso-form.pdf',
          mimeType: normalizeText(attachment.contentType) || 'application/pdf',
          documentDate: formResult.parsed?.signedAt || rawMessage.receivedAt || null,
          body: attachment.body,
        },
      });
      if (result?.status === 'DUPLICATE') {
        await promoteStoredAttachment(stores.assetStore, result.asset, resolvedActor);
        await stores.importRunStore.incrementCounter(runId, 'totalImported', 1);
        await stores.importRunStore.incrementCounter(runId, 'totalVerified', 1);
        stats.duplicate += 1;
      }
      else if (result?.ok) stats.imported += 1;
      else stats.failed += 1;
    }
  } finally {
    await stores.importRunStore.finishRun(runId, { actor: resolvedActor });
  }

  return { ...stats, runId };
}

module.exports = { importHalsoFormAttachments };
