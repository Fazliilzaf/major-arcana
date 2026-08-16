#!/usr/bin/env node
'use strict';

/**
 * Markera osäkra assets som `needs_review_for_naming` / `uiStatus: needs_review_for_naming`
 * utan att skriva något beräknat displayName, sessionNumber eller annan metadata.
 *
 * Använder samma logik som backfill-skriptet för att identifiera vilka assets som
 * skulle hoppas över som osäkra, men i stället för att hoppa över dem sätter den
 * en tydlig review-status i storen så att `report-naming-review-queue.js` och
 * framtida gransknings-UI kan se dem.
 *
 *   node scripts/mark-assets-for-naming-review.js --dry-run \
 *     --patients-store /var/data/cco-patient-master.json --tenant hair-tp-clinic
 *
 *   node scripts/mark-assets-for-naming-review.js --commit \
 *     --patients-store /var/data/cco-patient-master.json --tenant hair-tp-clinic
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const { buildAssetNamingMetadata } = require('../src/ops/ccoAssetNaming');
const {
  needsBackfill,
  resolveAliasKeyFn,
  groupByPatientId,
  assertPatientsResolved,
  isAutoSafeNamingPatch,
} = require('./backfill-asset-display-names');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

const ACTOR = {
  role: 'system',
  userId: 'mark-assets-for-naming-review',
  tenantId: 'hair_tp',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    commit: false,
    force: false,
    limit: 0,
    offset: 0,
    batchSize: 100,
    patientIds: null,
    categories: null,
    patientAssetsStorePath: '',
    patientsStorePath: '',
    tenant: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--force') args.force = true;
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--batch-size') args.batchSize = Math.max(1, Number(argv[++i]) || 100);
    else if (flag === '--patient-ids')
      args.patientIds = new Set(
        String(argv[++i])
          .split(',')
          .filter(Boolean)
          .map((s) => s.trim())
      );
    else if (flag === '--categories')
      args.categories = new Set(
        String(argv[++i])
          .split(',')
          .filter(Boolean)
          .map((s) => s.trim())
      );
    else if (flag === '--patient-assets-store')
      args.patientAssetsStorePath = String(argv[++i] || '').trim();
    else if (flag === '--patients-store') args.patientsStorePath = String(argv[++i] || '').trim();
    else if (flag === '--tenant') args.tenant = String(argv[++i] || '').trim();
  }
  if (args.commit) args.dryRun = false;
  if (!args.commit && !args.dryRun) args.dryRun = true;
  if (!args.patientsStorePath || !args.tenant) {
    throw new Error('--patients-store <path> och --tenant <id> krävs.');
  }
  return args;
}

async function markAssetsForNamingReview({ assetStore, patients, args }) {
  const all = assetStore.listItemsForEnrichment();
  const keyFn = resolveAliasKeyFn(all, patients);
  const byPatient = groupByPatientId(all, keyFn);

  const stats = {
    scanned: all.length,
    patients: byPatient.size,
    candidates: 0,
    marked: 0,
    alreadyMarked: 0,
    skippedSafe: 0,
    skippedNotCandidate: 0,
    skippedPatientFilter: 0,
    skippedCategoryFilter: 0,
    failed: 0,
    dryRun: args.dryRun,
  };
  const errors = [];
  const samples = [];

  const candidates = [];
  for (const [patientId, patientAssets] of byPatient) {
    if (args.patientIds && !args.patientIds.has(patientId)) {
      stats.skippedPatientFilter += patientAssets.length;
      continue;
    }
    for (const asset of patientAssets) {
      if (args.categories && !args.categories.has(asset.category)) {
        stats.skippedCategoryFilter += 1;
        continue;
      }
      if (!needsBackfill(asset, { force: args.force })) {
        stats.skippedNotCandidate += 1;
        continue;
      }
      candidates.push({ asset, patientAssets });
    }
  }

  stats.candidates = candidates.length;
  const start = Math.max(0, args.offset);
  const end = args.limit > 0 ? start + args.limit : candidates.length;
  const batch = candidates.slice(start, end);

  const reviewPatch = (asset) => ({
    namingStatus: 'needs_review_for_naming',
    uiStatus: 'needs_review_for_naming',
    reviewReason: 'auto_detected_unsafe_naming',
    namingBuiltAt: new Date().toISOString(),
  });

  if (args.dryRun) {
    for (const { asset, patientAssets } of batch) {
      try {
        const namingPatch = buildAssetNamingMetadata(asset, { siblingAssets: patientAssets });
        if (asset.namingStatus === 'needs_review_for_naming') {
          stats.alreadyMarked += 1;
          continue;
        }
        if (isAutoSafeNamingPatch(namingPatch)) {
          stats.skippedSafe += 1;
          continue;
        }
        stats.marked += 1;
        if (samples.length < 20) {
          samples.push({
            assetId: asset.id,
            patientId: asset.patientId,
            category: asset.category,
            originalFileName: asset.originalFileName,
            displayName: asset.displayName,
            namingConfidence: namingPatch.namingConfidence,
            sessionNumberIsUnreliable: namingPatch.sessionNumberIsUnreliable,
            patch: reviewPatch(asset),
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

  assetStore.beginBatch();
  let inBatch = 0;
  try {
    for (const { asset, patientAssets } of batch) {
      try {
        const namingPatch = buildAssetNamingMetadata(asset, { siblingAssets: patientAssets });
        if (asset.namingStatus === 'needs_review_for_naming') {
          stats.alreadyMarked += 1;
          continue;
        }
        if (isAutoSafeNamingPatch(namingPatch)) {
          stats.skippedSafe += 1;
          continue;
        }
        await assetStore.patchAssetNamingMetadata(asset.id, reviewPatch(asset), {
          actor: ACTOR,
          reason: 'mark_unsafe_asset_for_naming_review',
        });
        stats.marked += 1;
        if (samples.length < 20) {
          samples.push({
            assetId: asset.id,
            patientId: asset.patientId,
            category: asset.category,
            originalFileName: asset.originalFileName,
            displayName: asset.displayName,
            namingConfidence: namingPatch.namingConfidence,
            sessionNumberIsUnreliable: namingPatch.sessionNumberIsUnreliable,
          });
        }
      } catch (error) {
        stats.failed += 1;
        errors.push({ assetId: asset.id, reason: error.message });
      }
      inBatch += 1;
      if (inBatch >= args.batchSize) {
        await assetStore.checkpointBatch();
        inBatch = 0;
      }
    }
    await assetStore.flushBatch();
  } catch (error) {
    try {
      await assetStore.flushBatch();
    } catch {
      // best effort
    }
    throw error;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    stats,
    samples,
    errors,
  };
}

async function main() {
  const args = parseArgs();
  const assetsPath =
    args.patientAssetsStorePath ||
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH ||
    process.env.CCO_PATIENT_ASSETS_PATH ||
    path.join(DATA, 'cco-patient-assets.json');
  const auditPath = process.env.ARCANA_CCO_AUDIT_PATH || path.join(DATA, 'cco-audit.jsonl');

  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: assetsPath,
    auditLog,
  });

  const patientStore = await createCcoPatientMasterStore({
    filePath: path.resolve(args.patientsStorePath),
  });
  const patientsPage = await patientStore.listPatients({
    tenantId: args.tenant,
    limit: 20000,
    offset: 0,
  });
  const patients = patientsPage.patients || [];
  assertPatientsResolved(patients, args);

  const report = await markAssetsForNamingReview({ assetStore, patients, args });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[mark-assets-for-naming-review] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  markAssetsForNamingReview,
};
