'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasBinary(asset = {}) {
  const key = normalizeText(asset.storageKey);
  return Boolean(key && key !== 'pending-no-binary');
}

function buildMetadataWithoutBinaryPlan({ assetStore, tenantId, importRunId }) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  const runId = normalizeText(importRunId);
  if (!runId) throw new Error('importRunId krävs.');
  const candidates = assetStore
    .listItemsForEnrichment(tenantId)
    .filter(
      (asset) =>
        normalizeText(asset.importRunId) === runId &&
        normalizeText(asset.status) === 'IMPORTED_TO_CCO' &&
        !hasBinary(asset)
    );
  return {
    importRunId: runId,
    candidates,
    stats: {
      candidates: candidates.length,
      bySourceSystem: candidates.reduce((counts, asset) => {
        const source = normalizeText(asset.sourceSystem) || 'unknown';
        counts[source] = (counts[source] || 0) + 1;
        return counts;
      }, {}),
    },
  };
}

async function quarantineMetadataWithoutBinary({
  assetStore,
  reviewQueueStore,
  tenantId = null,
  importRunId,
  dryRun = true,
  expectedCount = null,
  actor = {},
} = {}) {
  if (!reviewQueueStore || typeof reviewQueueStore.enqueue !== 'function') {
    throw new Error('reviewQueueStore.enqueue krävs.');
  }
  const plan = buildMetadataWithoutBinaryPlan({ assetStore, tenantId, importRunId });
  const expected = expectedCount === null ? null : Number(expectedCount);
  if (expected !== null && expected !== plan.stats.candidates) {
    const error = new Error(
      `expectedCount mismatch: expected=${expected} actual=${plan.stats.candidates}`
    );
    error.statusCode = 409;
    throw error;
  }
  const result = {
    dryRun: Boolean(dryRun),
    zeroWrites: Boolean(dryRun),
    importRunId: plan.importRunId,
    stats: { ...plan.stats, quarantined: 0, enqueued: 0, alreadyQueued: 0 },
  };
  if (dryRun) return result;

  const pendingByAssetId = new Set(
    typeof reviewQueueStore.listPending === 'function'
      ? reviewQueueStore.listPending().map((item) => normalizeText(item.assetId))
      : []
  );
  for (const asset of plan.candidates) {
    await assetStore.transitionStatus(asset.id, 'NEEDS_REVIEW', {
      actor,
      reason: 'metadata_without_binary_source_unavailable',
    });
    result.stats.quarantined += 1;
    if (pendingByAssetId.has(normalizeText(asset.id))) {
      result.stats.alreadyQueued += 1;
      continue;
    }
    await reviewQueueStore.enqueue(
      {
        assetId: asset.id,
        reason: 'unknown_format',
        suggestedPatientId: asset.patientId || null,
        confidence: 'high',
      },
      { actor }
    );
    pendingByAssetId.add(normalizeText(asset.id));
    result.stats.enqueued += 1;
  }
  return result;
}

module.exports = { buildMetadataWithoutBinaryPlan, quarantineMetadataWithoutBinary };
