#!/usr/bin/env node
'use strict';

/**
 * Bucket-1 repair for NEEDS_REVIEW duplicates of VISIBLE/VERIFIED siblings.
 *
 * Default = dry-run (classify only, zero writes).
 * Commit requires --commit --expectedCount=<n> matching target size.
 *
 * Safety:
 *   - Abort if b1 signals ownBlobAlso / category / source / multi-patient > 0
 *   - Full preflight of entire target batch before first write (else 0 writes)
 *   - On unexpected apply error: stop immediately, report partial apply
 *   - Prod storage MUST be under /var/data (no iCloud fallback)
 *
 * Never starts Drive ingest. Never changes patientId. Never mutates sibling.
 *
 * Usage:
 *   ARCANA_STATE_ROOT=/var/data node scripts/repair-needs-review-duplicate-siblings.js
 *   … --commit --expectedCount=40482
 *   … --limit=10 --commit --expectedCount=10   # canary (owner-gated)
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  partitionNeedsReviewBuckets,
  commitBucket1WithPreflight,
  resolveProdRepairRoots,
} = require('./lib/needsReviewDuplicateSiblingBuckets');

function argValue(flag, argv = process.argv.slice(2)) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${flag} saknar värde`);
      values.push(value);
      index += 1;
    } else if (token.startsWith(`${flag}=`)) {
      const value = token.slice(flag.length + 1);
      if (!value) throw new Error(`${flag} saknar värde`);
      values.push(value);
    }
  }
  const unique = [...new Set(values)];
  if (unique.length > 1) throw new Error(`${flag} har motstridiga värden`);
  return unique[0] || null;
}

function hasFlag(flag, argv = process.argv.slice(2)) {
  return argv.includes(flag);
}

function parseNonNegativeInteger(raw, flag) {
  if (raw == null) return null;
  if (!/^\d+$/.test(String(raw))) throw new Error(`${flag} måste vara ett heltal >= 0`);
  return Number(raw);
}

function maskId(id) {
  const s = String(id || '');
  if (s.length < 10) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  const commit = hasFlag('--commit');
  const expectedRaw = argValue('--expectedCount');
  const limitRaw = argValue('--limit');

  const roots = resolveProdRepairRoots({
    stateRoot: process.env.ARCANA_STATE_ROOT,
    storageRootEnv: process.env.ARCANA_CCO_SECURE_STORAGE_ROOT,
  });

  if (!fs.existsSync(roots.assetsPath)) {
    throw new Error(`Saknar asset store: ${roots.assetsPath}`);
  }
  if (!fs.existsSync(roots.storageRoot)) {
    throw new Error(`Saknar secure storage root: ${roots.storageRoot}`);
  }

  const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
  const { createLocalProvider } = require('../src/ops/ccoSecureStorageProvider');
  let isDriveImportQuarantinedAsset = () => false;
  try {
    ({ isDriveImportQuarantinedAsset } = require('../src/ops/ccoDriveAssetInternalization'));
  } catch {
    /* optional in minimal fixtures */
  }

  const auditLog = {
    append(ev) {
      const p = path.join(roots.stateRoot, 'cco-audit-needs-review-dup-repair.jsonl');
      fs.appendFileSync(p, `${JSON.stringify({ ...ev, at: new Date().toISOString() })}\n`);
    },
  };

  const assetStore = await createCcoPatientAssetStore({
    filePath: roots.assetsPath,
    auditLog,
  });
  // Explicit prod root — never DEFAULT_LOCAL_ROOT / iCloud
  const storage = createLocalProvider({ rootPath: roots.storageRoot });
  if (storage.rootPath !== roots.storageRoot) {
    throw new Error(
      `storage.rootPath drift: expected ${roots.storageRoot}, got ${storage.rootPath}`
    );
  }

  const allAssets = Object.values(assetStore._state().items || {});
  const needsReviewAssets = allAssets.filter((a) => a.status === 'NEEDS_REVIEW');

  async function hasBlob(storageKey) {
    try {
      return await storage.exists(storageKey);
    } catch {
      return false;
    }
  }

  const report = await partitionNeedsReviewBuckets({
    needsReviewAssets,
    allAssets,
    hasBlob,
    isQuarantined: isDriveImportQuarantinedAsset,
  });

  const b1 = report.buckets.b1_samePatient_siblingBlob;
  const limit = parseNonNegativeInteger(limitRaw, '--limit');
  const targets = limit != null ? b1.slice(0, limit) : b1;

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    stateRoot: roots.stateRoot,
    storageRoot: roots.storageRoot,
    assetsPath: roots.assetsPath,
    inputNeedsReview: report.inputTotal,
    partitionComplete: report.partitionComplete,
    counts: report.counts,
    b1Deterministic: report.b1Deterministic,
    b1DeterminismBlockers: report.b1DeterminismBlockers,
    b1Signals: report.b1Signals,
    targets: targets.length,
    samples: targets.slice(0, 5).map(({ asset, sibling }) => ({
      nrAssetId: maskId(asset.id),
      siblingAssetId: maskId(sibling.id),
      patientId: maskId(asset.patientId),
      checksum12: String(asset.checksum || '').slice(0, 12),
      category: asset.category,
    })),
  };

  if (!commit) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          ...summary,
          note: 'Ingen write. Lägg --commit --expectedCount=N för apply (efter grön preflight).',
        },
        null,
        2
      )
    );
    return;
  }

  if (!report.b1Deterministic) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          phase: 'determinism_gate',
          applied: 0,
          writes: 0,
          ...summary,
          error: 'Bucket 1 inte deterministisk — 0 writes',
        },
        null,
        2
      )
    );
    process.exit(2);
  }
  if (expectedRaw == null) {
    throw new Error('--expectedCount krävs vid --commit');
  }
  const expected = parseNonNegativeInteger(expectedRaw, '--expectedCount');
  if (expected !== targets.length) {
    throw new Error(
      `--expectedCount mismatch: got ${expected}, targets=${targets.length} (full b1=${b1.length})`
    );
  }

  const actor = {
    userId: process.env.ARCANA_REPAIR_ACTOR || 'needs-review-dup-sibling-repair',
    role: 'owner',
  };

  const result = await commitBucket1WithPreflight({
    assetStore,
    targets,
    hasBlob,
    allAssets,
    actor,
  });

  console.log(
    JSON.stringify(
      {
        ...summary,
        ok: result.ok,
        phase: result.phase,
        applied: result.applied,
        writes: result.writes,
        zeroWrites: result.zeroWrites,
        mutationsStarted: result.mutationsStarted,
        attempted: result.attempted,
        partialApply: Boolean(result.partialApply),
        stoppedAt: result.stoppedAt
          ? {
              assetId: maskId(result.stoppedAt.assetId),
              siblingAssetId: maskId(result.stoppedAt.siblingAssetId),
              code: result.stoppedAt.code,
              message: result.stoppedAt.message,
            }
          : null,
        preflight: {
          ok: result.preflight?.ok,
          checked: result.preflight?.checked,
          failureCount: result.preflight?.failures?.length || 0,
          failures: (result.preflight?.failures || []).slice(0, 20).map((f) => ({
            assetId: maskId(f.assetId),
            code: f.code,
            message: f.message,
          })),
        },
        errors: (result.errors || []).slice(0, 20).map((e) => ({
          assetId: maskId(e.assetId),
          code: e.code,
          message: e.message,
        })),
      },
      null,
      2
    )
  );

  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(String(err && err.stack ? err.stack : err));
    process.exit(1);
  });
}

module.exports = {
  argValue,
  hasFlag,
  parseNonNegativeInteger,
  main,
};
