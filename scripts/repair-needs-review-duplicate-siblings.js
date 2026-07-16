#!/usr/bin/env node
'use strict';

/**
 * Bucket-1 repair for NEEDS_REVIEW duplicates of VISIBLE/VERIFIED siblings.
 *
 * Default = dry-run (classify only, zero writes).
 * Commit requires --commit --expectedCount=<n> matching bucket-1 size.
 *
 * Never starts Drive ingest. Never changes patientId. Never mutates sibling.
 *
 * Usage:
 *   ARCANA_STATE_ROOT=/var/data node scripts/repair-needs-review-duplicate-siblings.js
 *   … --commit --expectedCount=40482
 *   … --limit=10 --commit --expectedCount=10   # canary
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  partitionNeedsReviewBuckets,
  applyBucket1DuplicateMark,
} = require('./lib/needsReviewDuplicateSiblingBuckets');

function argValue(flag) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
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
  const stateRoot = process.env.ARCANA_STATE_ROOT || path.join(process.cwd(), 'data');
  const assetsPath =
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH || path.join(stateRoot, 'cco-patient-assets.json');

  if (!fs.existsSync(assetsPath)) {
    throw new Error(`Saknar asset store: ${assetsPath}`);
  }

  const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
  const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
  let isDriveImportQuarantinedAsset = () => false;
  try {
    ({ isDriveImportQuarantinedAsset } = require('../src/ops/ccoDriveAssetInternalization'));
  } catch {
    /* optional in minimal fixtures */
  }

  const auditLog = {
    append(ev) {
      const p = path.join(stateRoot, 'cco-audit-needs-review-dup-repair.jsonl');
      fs.appendFileSync(p, `${JSON.stringify({ ...ev, at: new Date().toISOString() })}\n`);
    },
  };

  const assetStore = await createCcoPatientAssetStore({ filePath: assetsPath, auditLog });
  const storage = createSecureStorageProvider({ provider: 'local' });
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
  const limit = limitRaw ? Math.max(0, Number(limitRaw)) : null;
  const targets = limit != null ? b1.slice(0, limit) : b1;

  const summary = {
    mode: commit ? 'commit' : 'dry-run',
    assetsPath,
    inputNeedsReview: report.inputTotal,
    partitionComplete: report.partitionComplete,
    counts: report.counts,
    b1Deterministic: report.b1Deterministic,
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
        { ok: true, ...summary, note: 'Ingen write. Lägg --commit --expectedCount=N för apply.' },
        null,
        2
      )
    );
    return;
  }

  if (!report.b1Deterministic) {
    throw new Error('Bucket 1 är inte deterministisk (multiSiblingPatientsWithBlob > 0) — abort');
  }
  if (expectedRaw == null) {
    throw new Error('--expectedCount krävs vid --commit');
  }
  const expected = Number(expectedRaw);
  if (!Number.isFinite(expected) || expected !== targets.length) {
    throw new Error(
      `--expectedCount mismatch: got ${expected}, targets=${targets.length} (full b1=${b1.length})`
    );
  }

  const actor = {
    userId: process.env.ARCANA_REPAIR_ACTOR || 'needs-review-dup-sibling-repair',
    role: 'owner',
  };

  let applied = 0;
  const errors = [];
  for (const { asset, sibling } of targets) {
    try {
      await applyBucket1DuplicateMark({
        assetStore,
        assetId: asset.id,
        siblingAssetId: sibling.id,
        actor,
        hasBlob,
      });
      applied += 1;
    } catch (err) {
      errors.push({
        assetId: maskId(asset.id),
        message: String(err.message || err).slice(0, 200),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0,
        ...summary,
        applied,
        errorCount: errors.length,
        errors: errors.slice(0, 20),
      },
      null,
      2
    )
  );
  if (errors.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
