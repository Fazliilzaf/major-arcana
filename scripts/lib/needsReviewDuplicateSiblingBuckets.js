'use strict';

/**
 * Read-only partition of NEEDS_REVIEW assets into mutually exclusive buckets.
 *
 * Bucket 1 (auto-resolve candidate when deterministic):
 *   same patientId + same checksum + VISIBLE/VERIFIED sibling with blob on disk
 *
 * No writes live here — applyBucket1DuplicateMark is opt-in and caller-gated.
 */

const VISIBLE_STATUSES = new Set(['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function patientOk(patientId) {
  const p = normalizeText(patientId);
  return Boolean(p) && p !== 'unknown';
}

function buildVisibleByChecksum(allAssets = []) {
  const map = new Map();
  for (const a of allAssets) {
    if (!VISIBLE_STATUSES.has(a?.status)) continue;
    const checksum = normalizeText(a.checksum);
    if (!checksum) continue;
    if (!map.has(checksum)) map.set(checksum, []);
    map.get(checksum).push(a);
  }
  return map;
}

/**
 * @param {object} options
 * @param {object[]} options.needsReviewAssets
 * @param {object[]} options.allAssets
 * @param {(storageKey: string) => Promise<boolean>|boolean} options.hasBlob
 * @param {(asset: object) => boolean} [options.isQuarantined]
 */
async function partitionNeedsReviewBuckets({
  needsReviewAssets = [],
  allAssets = [],
  hasBlob,
  isQuarantined = () => false,
} = {}) {
  if (typeof hasBlob !== 'function') {
    throw new Error('hasBlob callback krävs');
  }

  const visibleByChecksum = buildVisibleByChecksum(allAssets);
  const blobCache = new Map();
  async function blobExists(storageKey) {
    const key = normalizeText(storageKey);
    if (!key || key === 'pending-no-binary') return false;
    if (blobCache.has(key)) return blobCache.get(key);
    const ok = Boolean(await hasBlob(key));
    blobCache.set(key, ok);
    return ok;
  }

  async function firstSiblingWithBlob(siblings = []) {
    for (const s of siblings) {
      if (await blobExists(s.storageKey)) return s;
    }
    return null;
  }

  async function samePatientSiblingWithBlob(siblings, patientId) {
    for (const s of siblings) {
      if (s.patientId !== patientId) continue;
      if (await blobExists(s.storageKey)) return s;
    }
    return null;
  }

  const buckets = {
    b1_samePatient_siblingBlob: [],
    b2_sameChecksum_diffOrUnclearPatient: [],
    b3_missingBlobOrQuarantine: [],
    b4_getaccept_metadata: [],
    b5_other_real_review: [],
  };

  const b1Signals = {
    multiSiblingPatientsWithBlob: 0,
    ownBlobAlso: 0,
    ownBlobMissing: 0,
    categoryMismatchVsSibling: 0,
    sourceMismatchVsSibling: 0,
  };

  for (const a of needsReviewAssets) {
    const src = normalizeText(a.sourceSystem);
    const patientId = a.patientId || null;
    const checksum = normalizeText(a.checksum) || null;

    if (src === 'getaccept_import') {
      buckets.b4_getaccept_metadata.push({ asset: a });
      continue;
    }

    if (isQuarantined(a)) {
      buckets.b3_missingBlobOrQuarantine.push({
        asset: a,
        why: 'drive_quarantine',
        reviewReason: a.reviewReason || a.statusChangeReason || null,
      });
      continue;
    }

    const siblings = checksum ? visibleByChecksum.get(checksum) || [] : [];
    if (checksum && siblings.length > 0) {
      const anyBlobSib = await firstSiblingWithBlob(siblings);
      if (anyBlobSib) {
        const samePatientBlobSib = patientOk(patientId)
          ? await samePatientSiblingWithBlob(siblings, patientId)
          : null;

        if (samePatientBlobSib) {
          buckets.b1_samePatient_siblingBlob.push({
            asset: a,
            sibling: samePatientBlobSib,
          });

          const patientsWithBlob = [];
          for (const s of siblings) {
            if (await blobExists(s.storageKey)) patientsWithBlob.push(s.patientId);
          }
          const uniquePatients = [...new Set(patientsWithBlob.filter((p) => patientOk(p)))];
          if (uniquePatients.length > 1) b1Signals.multiSiblingPatientsWithBlob += 1;
          if (await blobExists(a.storageKey)) b1Signals.ownBlobAlso += 1;
          else b1Signals.ownBlobMissing += 1;
          if (
            a.category &&
            samePatientBlobSib.category &&
            a.category !== samePatientBlobSib.category
          ) {
            b1Signals.categoryMismatchVsSibling += 1;
          }
          if (
            a.sourceSystem &&
            samePatientBlobSib.sourceSystem &&
            a.sourceSystem !== samePatientBlobSib.sourceSystem
          ) {
            b1Signals.sourceMismatchVsSibling += 1;
          }
          continue;
        }

        const siblingPatients = [...new Set(siblings.map((s) => s.patientId).filter(Boolean))];
        let reason = 'different_patient';
        if (!patientOk(patientId)) reason = 'unclear_patient';
        else if (!siblings.some((s) => s.patientId === patientId)) reason = 'different_patient';
        else reason = 'same_patient_but_no_blob_on_same_patient_sibling';

        buckets.b2_sameChecksum_diffOrUnclearPatient.push({
          asset: a,
          sibling: anyBlobSib,
          siblingPatients,
          reason,
        });
        continue;
      }

      buckets.b3_missingBlobOrQuarantine.push({
        asset: a,
        why: 'checksum_visible_siblings_but_no_blob',
      });
      continue;
    }

    const ownBlob = await blobExists(a.storageKey);
    if (!ownBlob) {
      buckets.b3_missingBlobOrQuarantine.push({
        asset: a,
        why:
          !a.storageKey || a.storageKey === 'pending-no-binary' || !a.checksum
            ? 'missing_binary_metadata_or_blob'
            : 'own_blob_missing_no_visible_sibling',
      });
      continue;
    }

    buckets.b5_other_real_review.push({ asset: a });
  }

  const counts = {
    b1: buckets.b1_samePatient_siblingBlob.length,
    b2: buckets.b2_sameChecksum_diffOrUnclearPatient.length,
    b3: buckets.b3_missingBlobOrQuarantine.length,
    b4: buckets.b4_getaccept_metadata.length,
    b5: buckets.b5_other_real_review.length,
  };
  const partitionedTotal = counts.b1 + counts.b2 + counts.b3 + counts.b4 + counts.b5;

  return {
    buckets,
    counts,
    partitionedTotal,
    inputTotal: needsReviewAssets.length,
    partitionComplete: partitionedTotal === needsReviewAssets.length,
    b1Deterministic: counts.b1 > 0 && b1Signals.multiSiblingPatientsWithBlob === 0,
    b1Signals,
  };
}

/**
 * Apply bucket-1 duplicate mark for a single NEEDS_REVIEW asset.
 * Re-checks determinism at apply time. Never mutates sibling / patientId.
 */
async function applyBucket1DuplicateMark({
  assetStore,
  assetId,
  siblingAssetId,
  actor = {},
  reason = 'needs_review_duplicate_of_visible_sibling',
  hasBlob,
} = {}) {
  if (!assetStore || typeof assetStore.getAsset !== 'function') {
    throw new Error('assetStore krävs');
  }
  if (typeof hasBlob !== 'function') throw new Error('hasBlob krävs');

  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error(`asset ${assetId} hittades inte`);
    e.statusCode = 404;
    throw e;
  }
  if (asset.status !== 'NEEDS_REVIEW') {
    const e = new Error(`förväntade NEEDS_REVIEW (var ${asset.status})`);
    e.statusCode = 409;
    throw e;
  }

  const sibling = assetStore.getAsset(siblingAssetId);
  if (!sibling) {
    const e = new Error(`sibling ${siblingAssetId} hittades inte`);
    e.statusCode = 404;
    throw e;
  }
  if (!VISIBLE_STATUSES.has(sibling.status)) {
    const e = new Error(`sibling måste vara VISIBLE/VERIFIED (var ${sibling.status})`);
    e.statusCode = 409;
    throw e;
  }
  if (!patientOk(asset.patientId) || asset.patientId !== sibling.patientId) {
    const e = new Error('patientId måste matcha sibling exakt');
    e.statusCode = 409;
    throw e;
  }
  if (!asset.checksum || asset.checksum !== sibling.checksum) {
    const e = new Error('checksum måste matcha sibling exakt');
    e.statusCode = 409;
    throw e;
  }
  if (!(await hasBlob(sibling.storageKey))) {
    const e = new Error('sibling saknar blob');
    e.statusCode = 409;
    throw e;
  }

  await assetStore.patchAssetNamingMetadata(
    assetId,
    {
      reviewReason: 'marked_duplicate',
      technicalInfo: {
        ...(asset.technicalInfo || {}),
        markedDuplicate: true,
        reviewDecision: 'duplicate',
        duplicateOfAssetId: sibling.id,
        duplicateResolveSource: 'needs_review_duplicate_sibling_bucket1',
      },
    },
    { actor, reason }
  );

  const updated = await assetStore.transitionStatus(assetId, 'DUPLICATE', {
    actor,
    reason,
  });

  if (updated.patientId !== asset.patientId) {
    const e = new Error('patientId ändrades oväntat — abort');
    e.statusCode = 500;
    throw e;
  }

  return { asset: updated, siblingId: sibling.id };
}

module.exports = {
  VISIBLE_STATUSES,
  partitionNeedsReviewBuckets,
  applyBucket1DuplicateMark,
  buildVisibleByChecksum,
  patientOk,
};
