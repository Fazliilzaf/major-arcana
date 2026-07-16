'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  partitionNeedsReviewBuckets,
  applyBucket1DuplicateMark,
  preflightBucket1Targets,
  commitBucket1WithPreflight,
  evaluateB1Determinism,
  resolveProdRepairRoots,
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

function makeStore(items) {
  return {
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
      items[id] = { ...items[id], status, statusChangeReason: reason };
      return { ...items[id] };
    },
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
    assert.equal(report.b1Signals.ownBlobAlso, 0);
    assert.deepEqual(report.b1DeterminismBlockers, []);
  });

  it('b1Deterministic=false vid ownBlobAlso', async () => {
    const nr = asset({ id: 'nr-1', checksum: 'same', storageKey: 'key/nr-1' });
    const vis = asset({
      id: 'vis-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
      checksum: 'same',
      storageKey: 'key/vis-1',
    });
    const report = await partitionNeedsReviewBuckets({
      needsReviewAssets: [nr],
      allAssets: [nr, vis],
      hasBlob: () => true, // both have blobs
    });
    assert.equal(report.counts.b1, 1);
    assert.equal(report.b1Signals.ownBlobAlso, 1);
    assert.equal(report.b1Deterministic, false);
    assert.ok(report.b1DeterminismBlockers.some((b) => b.code === 'own_blob_also'));
  });

  it('b1Deterministic=false vid category-mismatch', async () => {
    const nr = asset({
      id: 'nr-1',
      checksum: 'same',
      category: 'photo_during',
      storageKey: 'key/nr-missing',
    });
    const vis = asset({
      id: 'vis-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
      checksum: 'same',
      category: 'other',
      storageKey: 'key/vis-1',
    });
    const report = await partitionNeedsReviewBuckets({
      needsReviewAssets: [nr],
      allAssets: [nr, vis],
      hasBlob: (key) => key === 'key/vis-1',
    });
    assert.equal(report.b1Deterministic, false);
    assert.ok(report.b1DeterminismBlockers.some((b) => b.code === 'category_mismatch_vs_sibling'));
  });

  it('b1Deterministic=false vid source-mismatch', async () => {
    const nr = asset({
      id: 'nr-1',
      checksum: 'same',
      sourceSystem: 'drive_import',
      storageKey: 'key/nr-missing',
    });
    const vis = asset({
      id: 'vis-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
      checksum: 'same',
      sourceSystem: 'upload',
      storageKey: 'key/vis-1',
    });
    const report = await partitionNeedsReviewBuckets({
      needsReviewAssets: [nr],
      allAssets: [nr, vis],
      hasBlob: (key) => key === 'key/vis-1',
    });
    assert.equal(report.b1Deterministic, false);
    assert.ok(report.b1DeterminismBlockers.some((b) => b.code === 'source_mismatch_vs_sibling'));
  });

  it('evaluateB1Determinism kräver alla mismatch-signaler = 0', () => {
    assert.equal(
      evaluateB1Determinism(
        {
          multiSiblingPatientsWithBlob: 0,
          ownBlobAlso: 0,
          categoryMismatchVsSibling: 0,
          sourceMismatchVsSibling: 0,
        },
        { b1Count: 10 }
      ).ok,
      true
    );
    assert.equal(
      evaluateB1Determinism(
        {
          multiSiblingPatientsWithBlob: 0,
          ownBlobAlso: 2,
          categoryMismatchVsSibling: 0,
          sourceMismatchVsSibling: 0,
        },
        { b1Count: 10 }
      ).ok,
      false
    );
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

  it('preflight abortar hela batchen vid en avvikelse (0 writes)', async () => {
    const items = {
      'nr-ok': asset({
        id: 'nr-ok',
        checksum: 'z1',
        storageKey: 'key/nr-ok-missing',
      }),
      'vis-ok': asset({
        id: 'vis-ok',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'z1',
        storageKey: 'key/vis-ok',
      }),
      'nr-bad': asset({
        id: 'nr-bad',
        checksum: 'z2',
        storageKey: 'key/nr-bad', // own blob present → fail
      }),
      'vis-bad': asset({
        id: 'vis-bad',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'z2',
        storageKey: 'key/vis-bad',
      }),
    };
    const store = makeStore(items);
    const blobs = new Set(['key/vis-ok', 'key/vis-bad', 'key/nr-bad']);
    const targets = [
      { asset: items['nr-ok'], sibling: items['vis-ok'] },
      { asset: items['nr-bad'], sibling: items['vis-bad'] },
    ];
    const preflight = await preflightBucket1Targets({
      assetStore: store,
      targets,
      hasBlob: (key) => blobs.has(key),
    });
    assert.equal(preflight.ok, false);
    assert.equal(preflight.checked, 2);
    assert.equal(preflight.failures.length, 1);
    assert.equal(preflight.failures[0].code, 'own_blob_also');

    const commit = await commitBucket1WithPreflight({
      assetStore: store,
      targets,
      hasBlob: (key) => blobs.has(key),
      actor: { userId: 't' },
    });
    assert.equal(commit.ok, false);
    assert.equal(commit.phase, 'preflight');
    assert.equal(commit.writes, 0);
    assert.equal(commit.zeroWrites, true);
    assert.equal(commit.mutationsStarted, false);
    assert.equal(commit.attempted, 0);
    assert.equal(commit.applied, 0);
    assert.equal(items['nr-ok'].status, 'NEEDS_REVIEW');
    assert.equal(items['nr-bad'].status, 'NEEDS_REVIEW');
  });

  it('commit stoppar vid första apply-fel och rapporterar partial', async () => {
    const items = {
      'nr-1': asset({ id: 'nr-1', checksum: 'a', storageKey: 'key/nr-1-missing' }),
      'vis-1': asset({
        id: 'vis-1',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'a',
        storageKey: 'key/vis-1',
      }),
      'nr-2': asset({ id: 'nr-2', checksum: 'b', storageKey: 'key/nr-2-missing' }),
      'vis-2': asset({
        id: 'vis-2',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'b',
        storageKey: 'key/vis-2',
      }),
    };
    let transitions = 0;
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
        transitions += 1;
        if (id === 'nr-2') {
          const e = new Error('simulated apply failure');
          e.code = 'simulated_fail';
          throw e;
        }
        items[id] = { ...items[id], status, statusChangeReason: reason };
        return { ...items[id] };
      },
    };
    const blobs = new Set(['key/vis-1', 'key/vis-2']);
    const targets = [
      { asset: items['nr-1'], sibling: items['vis-1'] },
      { asset: items['nr-2'], sibling: items['vis-2'] },
    ];
    const result = await commitBucket1WithPreflight({
      assetStore: store,
      targets,
      hasBlob: (key) => blobs.has(key),
      allAssets: Object.values(items),
      actor: { userId: 't' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, 'apply');
    assert.equal(result.partialApply, true);
    assert.equal(result.applied, 1);
    assert.equal(result.writes, 1);
    assert.equal(result.zeroWrites, false);
    assert.equal(result.mutationsStarted, true);
    assert.equal(result.attempted, 2);
    assert.equal(result.stoppedAt.assetId, 'nr-2');
    assert.equal(items['nr-1'].status, 'DUPLICATE');
    assert.equal(items['nr-2'].status, 'NEEDS_REVIEW');
    assert.equal(transitions, 2); // one success + one failed attempt
  });

  it('applyBucket1DuplicateMark markerar DUPLICATE utan att röra patientId', async () => {
    const items = {
      'nr-1': asset({
        id: 'nr-1',
        status: 'NEEDS_REVIEW',
        checksum: 'z',
        storageKey: 'key/nr-missing',
      }),
      'vis-1': asset({
        id: 'vis-1',
        status: 'VISIBLE_ON_PATIENT_CARD',
        checksum: 'z',
        storageKey: 'key/vis-1',
      }),
    };
    const store = makeStore(items);
    const result = await applyBucket1DuplicateMark({
      assetStore: store,
      assetId: 'nr-1',
      siblingAssetId: 'vis-1',
      hasBlob: (key) => key === 'key/vis-1',
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
        if (id === 'nr-1')
          return asset({ id: 'nr-1', patientId: 'pat-a', checksum: 'z', storageKey: 'key/nr-x' });
        if (id === 'vis-1')
          return asset({
            id: 'vis-1',
            patientId: 'pat-b',
            status: 'VISIBLE_ON_PATIENT_CARD',
            checksum: 'z',
            storageKey: 'key/vis-1',
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
          hasBlob: (key) => key === 'key/vis-1',
        }),
      /patientId måste matcha/
    );
  });

  it('resolveProdRepairRoots kräver /var/data och avvisar iCloud', () => {
    assert.throws(() => resolveProdRepairRoots({ stateRoot: null }), /ARCANA_STATE_ROOT krävs/);
    assert.throws(
      () => resolveProdRepairRoots({ stateRoot: '/tmp/data' }),
      /måste vara exakt \/var\/data/
    );
    assert.throws(
      () =>
        resolveProdRepairRoots({
          stateRoot: path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/x'),
          allowNonProdRoot: true,
        }),
      /iCloud/
    );
    const ok = resolveProdRepairRoots({
      stateRoot: '/var/data',
      storageRootEnv: '/var/data/cco-secure-storage',
    });
    assert.equal(ok.stateRoot, '/var/data');
    assert.equal(ok.storageRoot, '/var/data/cco-secure-storage');
    assert.equal(ok.assetsPath, '/var/data/cco-patient-assets.json');
  });

  it('resolveProdRepairRoots allowNonProdRoot för tester med explicit tmp-root', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nr-dup-'));
    const roots = resolveProdRepairRoots({
      stateRoot: tmp,
      allowNonProdRoot: true,
    });
    assert.equal(roots.stateRoot, path.resolve(tmp));
    assert.equal(roots.storageRoot, path.join(path.resolve(tmp), 'cco-secure-storage'));
  });
});
