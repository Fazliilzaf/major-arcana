'use strict';

/**
 * Read-only partition of NEEDS_REVIEW assets into mutually exclusive buckets.
 *
 * Bucket 1 (auto-resolve candidate when deterministic):
 *   same patientId + same checksum + VISIBLE/VERIFIED sibling with blob on disk
 *   AND NR row itself has no blob (ownBlobAlso === 0)
 *   AND category/source match sibling
 *
 * No writes live here — applyBucket1DuplicateMark is opt-in and caller-gated.
 */

const path = require('node:path');

const VISIBLE_STATUSES = new Set(['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO']);
const PROD_STATE_ROOT = '/var/data';

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

function evaluateB1Determinism(b1Signals = {}, { requireNonEmptyB1 = true, b1Count = 0 } = {}) {
  const blockers = [];
  if ((Number(b1Signals.multiSiblingPatientsWithBlob) || 0) > 0) {
    blockers.push({
      code: 'multi_sibling_patients_with_blob',
      count: b1Signals.multiSiblingPatientsWithBlob,
    });
  }
  if ((Number(b1Signals.ownBlobAlso) || 0) > 0) {
    blockers.push({ code: 'own_blob_also', count: b1Signals.ownBlobAlso });
  }
  if ((Number(b1Signals.categoryMismatchVsSibling) || 0) > 0) {
    blockers.push({
      code: 'category_mismatch_vs_sibling',
      count: b1Signals.categoryMismatchVsSibling,
    });
  }
  if ((Number(b1Signals.sourceMismatchVsSibling) || 0) > 0) {
    blockers.push({
      code: 'source_mismatch_vs_sibling',
      count: b1Signals.sourceMismatchVsSibling,
    });
  }
  if (requireNonEmptyB1 && b1Count <= 0) {
    blockers.push({ code: 'b1_empty', count: 0 });
  }
  return { ok: blockers.length === 0, blockers };
}

/**
 * Enforce prod storage under /var/data — never iCloud / Migration-data fallback.
 * Tests may pass allowNonProdRoot=true with an explicit absolute root.
 */
function resolveProdRepairRoots({
  stateRoot = process.env.ARCANA_STATE_ROOT,
  storageRootEnv = process.env.ARCANA_CCO_SECURE_STORAGE_ROOT,
  allowNonProdRoot = false,
} = {}) {
  if (!normalizeText(stateRoot)) {
    const e = new Error('ARCANA_STATE_ROOT krävs (prod: /var/data)');
    e.code = 'STATE_ROOT_REQUIRED';
    throw e;
  }
  const resolvedState = path.resolve(stateRoot);
  if (!allowNonProdRoot && resolvedState !== PROD_STATE_ROOT) {
    const e = new Error(
      `ARCANA_STATE_ROOT måste vara exakt ${PROD_STATE_ROOT} (var ${resolvedState})`
    );
    e.code = 'STATE_ROOT_NOT_PROD';
    throw e;
  }
  if (/Mobile Documents|CloudDocs|iCloud|Migration-data/i.test(resolvedState)) {
    const e = new Error(`iCloud/Migration-data state root förbjuden (var ${resolvedState})`);
    e.code = 'STATE_ROOT_ICLOUD_FORBIDDEN';
    throw e;
  }

  const expectedStorage = path.join(resolvedState, 'cco-secure-storage');
  const resolvedStorage = path.resolve(storageRootEnv || expectedStorage);
  if (resolvedStorage !== expectedStorage) {
    const e = new Error(
      `ARCANA_CCO_SECURE_STORAGE_ROOT måste vara ${expectedStorage} (var ${resolvedStorage})`
    );
    e.code = 'STORAGE_ROOT_MISMATCH';
    throw e;
  }
  if (/Mobile Documents|CloudDocs|iCloud/i.test(resolvedStorage)) {
    const e = new Error(`iCloud secure-storage fallback förbjuden (var ${resolvedStorage})`);
    e.code = 'STORAGE_ROOT_ICLOUD_FORBIDDEN';
    throw e;
  }

  return {
    stateRoot: resolvedState,
    storageRoot: resolvedStorage,
    assetsPath: path.join(resolvedState, 'cco-patient-assets.json'),
  };
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
  const determinism = evaluateB1Determinism(b1Signals, {
    requireNonEmptyB1: true,
    b1Count: counts.b1,
  });

  return {
    buckets,
    counts,
    partitionedTotal,
    inputTotal: needsReviewAssets.length,
    partitionComplete: partitionedTotal === needsReviewAssets.length,
    b1Deterministic: determinism.ok,
    b1DeterminismBlockers: determinism.blockers,
    b1Signals,
  };
}

/**
 * Re-validate every target before any write. Any failure → ok:false, caller must write 0.
 */
async function preflightBucket1Targets({
  assetStore,
  targets = [],
  hasBlob,
  allAssets = null,
} = {}) {
  if (!assetStore || typeof assetStore.getAsset !== 'function') {
    throw new Error('assetStore krävs för preflight');
  }
  if (typeof hasBlob !== 'function') throw new Error('hasBlob krävs för preflight');

  const visibleByChecksum = allAssets != null ? buildVisibleByChecksum(allAssets) : null;
  const failures = [];

  for (const row of targets) {
    const assetId = row?.asset?.id || row?.assetId;
    const siblingAssetId = row?.sibling?.id || row?.siblingAssetId;
    try {
      await assertBucket1PairSafe({
        assetStore,
        assetId,
        siblingAssetId,
        hasBlob,
        visibleByChecksum,
      });
    } catch (err) {
      failures.push({
        assetId,
        siblingAssetId,
        code: err.code || 'preflight_failed',
        message: String(err.message || err).slice(0, 300),
      });
    }
  }

  return {
    ok: failures.length === 0,
    checked: targets.length,
    failures,
  };
}

async function assertBucket1PairSafe({
  assetStore,
  assetId,
  siblingAssetId,
  hasBlob,
  visibleByChecksum = null,
} = {}) {
  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error(`asset ${assetId} hittades inte`);
    e.code = 'asset_not_found';
    e.statusCode = 404;
    throw e;
  }
  if (asset.status !== 'NEEDS_REVIEW') {
    const e = new Error(`förväntade NEEDS_REVIEW (var ${asset.status})`);
    e.code = 'status_not_needs_review';
    e.statusCode = 409;
    throw e;
  }

  const sibling = assetStore.getAsset(siblingAssetId);
  if (!sibling) {
    const e = new Error(`sibling ${siblingAssetId} hittades inte`);
    e.code = 'sibling_not_found';
    e.statusCode = 404;
    throw e;
  }
  if (!VISIBLE_STATUSES.has(sibling.status)) {
    const e = new Error(`sibling måste vara VISIBLE/VERIFIED (var ${sibling.status})`);
    e.code = 'sibling_status_invalid';
    e.statusCode = 409;
    throw e;
  }
  if (!patientOk(asset.patientId) || asset.patientId !== sibling.patientId) {
    const e = new Error('patientId måste matcha sibling exakt');
    e.code = 'patient_mismatch';
    e.statusCode = 409;
    throw e;
  }
  if (!asset.checksum || asset.checksum !== sibling.checksum) {
    const e = new Error('checksum måste matcha sibling exakt');
    e.code = 'checksum_mismatch';
    e.statusCode = 409;
    throw e;
  }
  if (asset.category && sibling.category && asset.category !== sibling.category) {
    const e = new Error(`category mismatch: nr=${asset.category} sibling=${sibling.category}`);
    e.code = 'category_mismatch';
    e.statusCode = 409;
    throw e;
  }
  if (asset.sourceSystem && sibling.sourceSystem && asset.sourceSystem !== sibling.sourceSystem) {
    const e = new Error(
      `sourceSystem mismatch: nr=${asset.sourceSystem} sibling=${sibling.sourceSystem}`
    );
    e.code = 'source_mismatch';
    e.statusCode = 409;
    throw e;
  }
  if (!(await hasBlob(sibling.storageKey))) {
    const e = new Error('sibling saknar blob');
    e.code = 'sibling_blob_missing';
    e.statusCode = 409;
    throw e;
  }
  if (await hasBlob(asset.storageKey)) {
    const e = new Error('NR-asset har egen blob (ownBlobAlso) — inte bucket-1-säker');
    e.code = 'own_blob_also';
    e.statusCode = 409;
    throw e;
  }

  if (visibleByChecksum) {
    const siblings = visibleByChecksum.get(normalizeText(asset.checksum)) || [];
    const patientsWithBlob = [];
    for (const s of siblings) {
      if (await hasBlob(s.storageKey)) patientsWithBlob.push(s.patientId);
    }
    const uniquePatients = [...new Set(patientsWithBlob.filter((p) => patientOk(p)))];
    if (uniquePatients.length > 1) {
      const e = new Error(`flera patienter med blob för samma checksum (${uniquePatients.length})`);
      e.code = 'multi_sibling_patients_with_blob';
      e.statusCode = 409;
      throw e;
    }
  }

  return { asset, sibling };
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
  visibleByChecksum = null,
} = {}) {
  if (!assetStore || typeof assetStore.getAsset !== 'function') {
    throw new Error('assetStore krävs');
  }
  if (typeof hasBlob !== 'function') throw new Error('hasBlob krävs');

  const { asset, sibling } = await assertBucket1PairSafe({
    assetStore,
    assetId,
    siblingAssetId,
    hasBlob,
    visibleByChecksum,
  });

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
    e.code = 'patient_id_mutated';
    e.statusCode = 500;
    throw e;
  }

  return { asset: updated, siblingId: sibling.id };
}

/**
 * Commit path: preflight ALL targets first (0 writes if any fail), then apply
 * sequentially and STOP on first unexpected apply error (partial report).
 */
async function commitBucket1WithPreflight({
  assetStore,
  targets = [],
  hasBlob,
  allAssets = null,
  actor = {},
} = {}) {
  const visibleByChecksum = allAssets != null ? buildVisibleByChecksum(allAssets) : null;

  const preflight = await preflightBucket1Targets({
    assetStore,
    targets,
    hasBlob,
    allAssets,
  });
  if (!preflight.ok) {
    return {
      ok: false,
      phase: 'preflight',
      applied: 0,
      writes: 0,
      preflight,
      stoppedAt: null,
      errors: preflight.failures,
    };
  }

  let applied = 0;
  for (const row of targets) {
    const assetId = row.asset.id;
    const siblingAssetId = row.sibling.id;
    try {
      await applyBucket1DuplicateMark({
        assetStore,
        assetId,
        siblingAssetId,
        actor,
        hasBlob,
        visibleByChecksum,
      });
      applied += 1;
    } catch (err) {
      return {
        ok: false,
        phase: 'apply',
        applied,
        writes: applied,
        partialApply: true,
        stoppedAt: {
          assetId,
          siblingAssetId,
          code: err.code || 'apply_failed',
          message: String(err.message || err).slice(0, 300),
        },
        preflight,
        errors: [
          {
            assetId,
            siblingAssetId,
            code: err.code || 'apply_failed',
            message: String(err.message || err).slice(0, 300),
          },
        ],
      };
    }
  }

  return {
    ok: true,
    phase: 'complete',
    applied,
    writes: applied,
    partialApply: false,
    stoppedAt: null,
    preflight,
    errors: [],
  };
}

module.exports = {
  VISIBLE_STATUSES,
  PROD_STATE_ROOT,
  partitionNeedsReviewBuckets,
  applyBucket1DuplicateMark,
  preflightBucket1Targets,
  assertBucket1PairSafe,
  commitBucket1WithPreflight,
  evaluateB1Determinism,
  resolveProdRepairRoots,
  buildVisibleByChecksum,
  patientOk,
};
