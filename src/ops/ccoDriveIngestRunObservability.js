'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function summarizeDriveIngestRunAssets(assets = [], runId, { limit = 200 } = {}) {
  const normalizedRunId = normalizeText(runId);
  if (!normalizedRunId) throw new Error('runId krävs');

  const rows = assets
    .filter(
      (asset) =>
        asset &&
        normalizeText(asset.sourceSystem) === 'drive_import' &&
        normalizeText(asset.importRunId) === normalizedRunId
    )
    .sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));

  const byStatus = {};
  for (const asset of rows) {
    const status = normalizeText(asset.status) || 'UNKNOWN';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return {
    runId: normalizedRunId,
    total: rows.length,
    byStatus,
    items: rows.slice(0, Math.max(1, Math.min(200, Number(limit) || 200))).map((asset) => ({
      assetId: asset.id,
      driveFileId: asset.originalDriveFileId || null,
      status: asset.status || null,
      reviewReason: asset.reviewReason || asset.statusChangeReason || null,
      fileName: asset.originalFileName || null,
      documentDate: asset.documentDate || null,
      mimeType: asset.mimeType || null,
      storageKeyPresent: Boolean(asset.storageKey),
      checksumPresent: Boolean(asset.checksum),
      fileSize: Number(asset.fileSize) || 0,
    })),
  };
}

module.exports = { summarizeDriveIngestRunAssets };
