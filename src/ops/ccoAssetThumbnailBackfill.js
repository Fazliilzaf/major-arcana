'use strict';

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/gif',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isImageAsset(asset = {}) {
  const mime = normalizeText(asset.mimeType).toLowerCase();
  const category = normalizeText(asset.category);
  return IMAGE_MIMES.has(mime) || category.startsWith('photo_');
}

async function assetHasBlobOnStorage(storage, asset = {}) {
  const storageKey = normalizeText(asset.storageKey);
  if (!storageKey || storageKey === 'pending-no-binary') return false;
  if (typeof storage?.exists !== 'function') return true;
  try {
    return await storage.exists(storageKey);
  } catch {
    return false;
  }
}

async function listThumbnailBackfillCandidates(
  assetStore,
  storage,
  { force = false, patientId = '' } = {}
) {
  const all = assetStore.listItemsForEnrichment();
  const patientFilter = normalizeText(patientId);
  const skippedWithThumbnail = all.filter(
    (asset) =>
      isImageAsset(asset) &&
      asset.thumbnailKey &&
      (!patientFilter || normalizeText(asset.patientId) === patientFilter)
  ).length;
  const rawCandidates = all.filter(
    (asset) =>
      isImageAsset(asset) &&
      asset.storageKey &&
      (!patientFilter || normalizeText(asset.patientId) === patientFilter) &&
      (force || !asset.thumbnailKey)
  );
  const candidates = [];
  let candidatesWithoutBlob = 0;
  for (const asset of rawCandidates) {
    if (await assetHasBlobOnStorage(storage, asset)) candidates.push(asset);
    else candidatesWithoutBlob += 1;
  }
  return { all, candidates, skippedWithThumbnail, candidatesWithoutBlob };
}

async function backfillAssetThumbnails({
  assetStore,
  storage,
  limit = 100,
  offset = 0,
  dryRun = true,
  force = false,
  patientId = '',
  actor = { role: 'system', userId: 'asset-thumbnail-backfill' },
} = {}) {
  if (!assetStore?.listItemsForEnrichment) throw new Error('assetStore krävs.');
  if (!storage?.generateThumbnailIfImage)
    throw new Error('storage.generateThumbnailIfImage krävs.');

  const shouldForce = force === true;
  const patientFilter = normalizeText(patientId);
  const { all, candidates, skippedWithThumbnail, candidatesWithoutBlob } =
    await listThumbnailBackfillCandidates(assetStore, storage, {
      force: shouldForce,
      patientId: patientFilter,
    });
  const start = Math.max(0, Number(offset) || 0);
  const cap = Math.max(0, Number(limit) || 0);
  const batch = candidates.slice(start, cap > 0 ? start + cap : undefined);
  const stats = {
    scanned: all.length,
    candidates: candidates.length,
    candidatesWithoutBlob,
    batchSize: batch.length,
    created: 0,
    skipped: shouldForce ? 0 : skippedWithThumbnail,
    existingWithThumbnail: skippedWithThumbnail,
    failed: 0,
    dryRun: !!dryRun,
    force: shouldForce,
    patientId: patientFilter || null,
  };
  const samples = [];
  const errors = [];

  for (const asset of batch) {
    if (dryRun) {
      stats.created += 1;
      if (samples.length < 5) {
        samples.push({ assetId: asset.id, storageKey: asset.storageKey, dryRun: true });
      }
      continue;
    }
    try {
      const thumbnailKey = await storage.generateThumbnailIfImage(asset.storageKey, asset.mimeType);
      if (!thumbnailKey) {
        stats.failed += 1;
        errors.push({ assetId: asset.id, reason: 'thumbnail_not_generated' });
        continue;
      }
      const updated =
        typeof assetStore.updateAssetThumbnailKey === 'function'
          ? await assetStore.updateAssetThumbnailKey(asset.id, thumbnailKey, {
              actor,
              reason: shouldForce ? 'ord_43_thumbnail_regenerate' : 'ord_43_backfill',
            })
          : null;
      stats.created += 1;
      if (samples.length < 5) {
        samples.push({
          assetId: updated?.id || asset.id,
          thumbnailKey,
          mimeType: asset.mimeType,
          category: asset.category,
        });
      }
    } catch (error) {
      stats.failed += 1;
      errors.push({ assetId: asset.id, reason: error.message });
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stats,
    samples,
    errors,
  };
}

module.exports = {
  assetHasBlobOnStorage,
  backfillAssetThumbnails,
  isImageAsset,
  listThumbnailBackfillCandidates,
};
