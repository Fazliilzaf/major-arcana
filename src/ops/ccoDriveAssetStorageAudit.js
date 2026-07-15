'use strict';

const { maskValue } = require('./ccoDriveAssetInternalization');

const DEFAULT_TARGET_STATUSES = ['IMPORTED_TO_CCO', 'IMPORTING'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasStorageKey(asset = {}) {
  const storageKey = normalizeText(asset.storageKey);
  return Boolean(storageKey && storageKey !== 'pending-no-binary');
}

async function mapWithConcurrency(items, concurrency, worker) {
  const rows = asArray(items);
  const results = new Array(rows.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(Number(concurrency) || 1, rows.length || 1));
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < rows.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(rows[index]);
      }
    })
  );
  return results;
}

function maskFinding(finding = {}) {
  return {
    ...finding,
    assetId: maskValue(finding.assetId, { keepStart: 4, keepEnd: 4 }),
    patientId: maskValue(finding.patientId, { keepStart: 4, keepEnd: 4 }),
    importRunId: finding.importRunId
      ? maskValue(finding.importRunId, { keepStart: 4, keepEnd: 4 })
      : null,
    storageKey: finding.storageKey
      ? maskValue(finding.storageKey, { keepStart: 8, keepEnd: 8 })
      : null,
  };
}

async function auditNonverifiedAssetStoragePage({
  assetStore = null,
  storage = null,
  tenantId = null,
  statuses = DEFAULT_TARGET_STATUSES,
  offset = 0,
  pageSize = 500,
  sampleSize = 25,
  maskSamples = true,
  includePassedDetails = false,
  storageConcurrency = 16,
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  if (!storage || typeof storage.exists !== 'function') {
    throw new Error('storage.exists krävs.');
  }
  const statusSet = new Set(asArray(statuses).map(normalizeText).filter(Boolean));
  const candidates = assetStore
    .listItemsForEnrichment(tenantId)
    .filter((asset) => statusSet.has(normalizeText(asset.status)));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 500, 2000));
  const page = candidates.slice(safeOffset, safeOffset + safePageSize);
  const findings = await mapWithConcurrency(page, storageConcurrency, async (asset) => {
    const storageKey = normalizeText(asset.storageKey) || null;
    let blobExists = false;
    let storageError = null;
    if (hasStorageKey(asset)) {
      try {
        blobExists = Boolean(await storage.exists(storageKey));
      } catch (error) {
        storageError = error.message || 'storage_exists_failed';
      }
    }
    return {
      assetId: asset.id,
      patientId: asset.patientId || null,
      importRunId: asset.importRunId || null,
      status: normalizeText(asset.status),
      storageKey,
      hasStorageKey: hasStorageKey(asset),
      blobExists,
      storageError,
      pass: Boolean(hasStorageKey(asset) && blobExists && !storageError),
    };
  });
  const failed = findings.filter((finding) => !finding.pass);
  const passed = findings.filter((finding) => finding.pass);
  const nextOffset = safeOffset + page.length;
  const safeSampleSize = Math.max(0, Number(sampleSize) || 25);
  const samples = failed.slice(0, safeSampleSize);
  const passedSamples = includePassedDetails ? passed.slice(0, safeSampleSize) : [];
  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    zeroWrites: true,
    model: 'Read-only storage audit for nonverified asset statuses.',
    pagination: {
      offset: safeOffset,
      pageSize: safePageSize,
      scanned: page.length,
      totalCandidates: candidates.length,
      nextOffset: nextOffset < candidates.length ? nextOffset : null,
      hasMore: nextOffset < candidates.length,
    },
    stats: {
      checked: findings.length,
      passed: findings.length - failed.length,
      missingStorageKey: failed.filter((finding) => !finding.hasStorageKey).length,
      missingBlob: failed.filter((finding) => finding.hasStorageKey && !finding.blobExists).length,
      storageErrors: failed.filter((finding) => finding.storageError).length,
      byStatus: findings.reduce((counts, finding) => {
        counts[finding.status] = (counts[finding.status] || 0) + 1;
        return counts;
      }, {}),
    },
    samples: maskSamples ? samples.map(maskFinding) : samples,
    // Owner-only callers can opt in while reconciling a stranded import.
    // The default remains failure-only so normal audits do not expose healthy asset details.
    passedSamples: maskSamples ? passedSamples.map(maskFinding) : passedSamples,
    findings: maskSamples ? failed.map(maskFinding) : failed,
  };
}

module.exports = { DEFAULT_TARGET_STATUSES, auditNonverifiedAssetStoragePage };
