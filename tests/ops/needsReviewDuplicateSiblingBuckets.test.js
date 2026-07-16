'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  partitionNeedsReviewBuckets,
  applyBucket1DuplicateMark,
} = require('../../scripts/lib/needsReviewDuplicateSiblingBuckets');

function asset(partial) {
  return {
    id: partial.id,
    patientId: partial.patientId ?? 'pat-a',
    status: partial.status ?? 'NEEDS_REVIEW',
    checksum: partial.checksum ?? 'abc',
    storageKey: partial.storageKey ?? `key/${partial.id}`,
    sourceSystem: partial.sourceSystem ?? 'drive_import',
    category: partial.category ?? 'photo_during',
    reviewReason: partial.reviewReason ?? null,
    technicalInfo: partial.technicalInfo || {},
  };
}

describe('needsReviewDuplicateSiblingBuckets', () => {
  it('partitionerar ömsesidigt uteslutande och flaggar b1 som deterministisk', async () => {
    const nr = asset({ id: 'nr-1', status: 'NEEDS_REVIEW', checksum: 'same' });
    const vis = asset({
      id: 'vis-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
      checksum: 'same',
      patientId: 'pat-a',
    });
    const ga = asset({
      id: 'ga-1',
      sourceSystem: 'getaccept_import',
      checksum: null,
      storageKey: null,
    });
    const quarantine = asset({
      id: 'q-1',
      reviewReason: 'drive_source_missing_during_import',
      checksum: 'solo',
      storageKey: 'pending-no-binary',
    });
    const real = asset({
      id: 'real-1',
      checksum: 'unique-real',
      storageKey: 'key/real-1',
    });
    const orphanNr = asset({
      id: 'orphan-1',
      checksum: 'no-sib',
      storageKey: 'key/missing',
    });

    const blobs = new Set(['key/vis-1', 'key/real-1']);
    const report = await partitionNeedsReviewBuckets({
      needsReviewAssets: [nr, ga, quarantine, real, orphanNr],
      allAssets: [nr, vis, ga, quarantine, real, orphanNr],
      hasBlob: (key) => blobs.has(key),
      isQuarantined: (a) => String(a.reviewReason || '').startsWith('drive_source_'),
    });

    assert.equal(report.partitionComplete, true);
    assert.equal(report.counts.b1, 1);
    assert.equal(report.counts.b2, 0);
    assert.equal(report.counts.b3, 2);
    assert.equal(report.counts.b4, 1);
    assert.equal(report.counts.b5, 1);
    assert.equal(report.b1Deterministic, true);
    assert.equal(report.b1Signals.multiSiblingPatientsWithBlob, 0);
  });

  it('b2 när samma checksum har blob men annan patient', async () => {
    const nr = asset({ id: 'nr-2', patientId: 'pat-a', checksum: 'x' });
    const visOther = asset({
      id: 'vis-other',
      patientId: 'pat-b',
      status: 'VISIBLE_ON_PATIENT_CARD',
      checksum: 'x',
    });
    const report = await partitionNeedsReviewBuckets({
      needsReviewAssets: [nr],
      allAssets: [nr, visOther],
      hasBlob: () => true,
    });
    assert.equal(report.counts.b2, 1);
    assert.equal(report.counts.b1, 0);
    assert.equal(
      report.buckets.b2_sameChecksum_diffOrUnclearPatient[0].reason,
      'different_patient'
    );
  });

  it('applyBucket1DuplicateMark markerar DUPLICATE utan att röra patientId', async () => {
    const items = {
      'nr-1': asset({ id: 'nr-1', status: 'NEEDS_REVIEW', checksum: 'z' }),
      'vis-1': asset({
        id: 'vis-1',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'z',
      }),
    };
    const store = {
      getAsset: (id) => (items[id] ? { ...items[id] } : null),
      async patchAssetNamingMetadata(id, patch) {
        items[id] = {
          ...items[id],
          ...patch,
          technicalInfo: { ...(items[id].technicalInfo || {}), ...(patch.technicalInfo || {}) },
        };
        return { ...items[id] };
      },
      async transitionStatus(id, status, { reason }) {
        assert.equal(status, 'DUPLICATE');
        items[id] = { ...items[id], status, statusChangeReason: reason };
        return { ...items[id] };
      },
    };

    const result = await applyBucket1DuplicateMark({
      assetStore: store,
      assetId: 'nr-1',
      siblingAssetId: 'vis-1',
      hasBlob: () => true,
      actor: { userId: 'test' },
    });

    assert.equal(result.asset.status, 'DUPLICATE');
    assert.equal(result.asset.patientId, 'pat-a');
    assert.equal(items['vis-1'].status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(items['nr-1'].technicalInfo.duplicateOfAssetId, 'vis-1');
  });

  it('applyBucket1DuplicateMark abortar vid patient-mismatch', async () => {
    const store = {
      getAsset: (id) => {
        if (id === 'nr-1') return asset({ id: 'nr-1', patientId: 'pat-a', checksum: 'z' });
        if (id === 'vis-1')
          return asset({
            id: 'vis-1',
            patientId: 'pat-b',
            status: 'VISIBLE_ON_PATIENT_CARD',
            checksum: 'z',
          });
        return null;
      },
    };
    await assert.rejects(
      () =>
        applyBucket1DuplicateMark({
          assetStore: store,
          assetId: 'nr-1',
          siblingAssetId: 'vis-1',
          hasBlob: () => true,
        }),
      /patientId måste matcha/
    );
  });
});
