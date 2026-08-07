#!/usr/bin/env node
'use strict';

/**
 * Backfill befintliga patient-assets med läsbara displayName.
 *
 *   node scripts/backfill-asset-display-names.js --dry-run
 *   node scripts/backfill-asset-display-names.js --dry-run --limit 50 --offset 0
 *   node scripts/backfill-asset-display-names.js --commit --limit 1000
 *   node scripts/backfill-asset-display-names.js --commit --patient-ids P1,P2
 *   node scripts/backfill-asset-display-names.js --commit --categories journal,consent
 *
 * Skriver ALDRIG lågkonfidenta gissningar (namingStatus: needs_review_for_naming,
 * härlett av namingConfidence === 'low'). De hamnar i stats.skippedNeedsReview
 * och needsReviewSamples i rapporten, oskrivna, för manuell granskning.
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const { buildAssetNamingMetadata } = require('../src/ops/ccoAssetNaming');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

const ACTOR = {
  role: 'system',
  userId: 'backfill-asset-display-names',
  tenantId: 'hair_tp',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    commit: false,
    limit: 0,
    offset: 0,
    batchSize: 100,
    patientIds: null,
    categories: null,
    force: false,
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
  }
  if (args.commit) args.dryRun = false;
  if (!args.commit && !args.dryRun) args.dryRun = true;
  return args;
}

/**
 * Heuristic: does this displayName look like a raw filename rather than a
 * human-readable title? Keep the check conservative — we do not want to flag
 * already-nice Swedish titles like "Hälsodeklaration".
 */
function looksTechnical(displayName, originalFileName) {
  const d = normalizeText(displayName);
  const o = normalizeText(originalFileName);
  if (!d) return true;
  if (d === o) return true;
  // Already built by buildAssetNamingMetadata (uses " · " separator).
  if (/ · /.test(d)) return false;
  if (/\?\?/.test(d)) return true; // mojibake
  if (/^journal[-_]/i.test(d)) return true;
  if (/^IMG[_-]/i.test(d)) return true;
  if (/^DSC/i.test(d)) return true;
  if (/(\.pdf|\.jpe?g|\.png|\.heic|\.webp|\.gif)$/i.test(d)) return true;
  return false;
}

function needsBackfill(asset, { force = false }) {
  if (asset.deletedAt) return false;
  if (asset.namingStatus === 'manual' && !force) return false;
  if (force) return true;
  const displayName = normalizeText(asset.displayName);
  if (!displayName) return true;
  if (looksTechnical(displayName, asset.originalFileName)) return true;
  if (asset.namingStatus !== 'resolved' && asset.namingStatus !== 'manual') return true;
  return false;
}

/**
 * Fyra foton, samma patient, samma dag, kategori photo_during — fick
 * "FUE Operation 23/25/26/30" i en dry-run 2026-08-07. sessionNumber ska
 * räkna DISTINKTA operationstillfällen (encounterMapper.js), inte foton;
 * grupperingen hade inte deduplicerat korrekt för den patienten. Roten är
 * inte fixad än.
 *
 * namingStatus härleds deterministiskt av namingConfidence === 'low'
 * (ccoAssetNaming/index.js) — samma sak, olika fält. En låg-konfidens-
 * gissning som "Operation 30" ska aldrig skriva över ett existerande
 * displayName utan att en människa sett den först.
 */
function isAutoSafeNamingPatch(namingPatch) {
  return namingPatch?.namingStatus !== 'needs_review_for_naming';
}

function groupByPatientId(assets) {
  const map = new Map();
  for (const asset of assets) {
    const pid = normalizeText(asset.patientId);
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(asset);
  }
  return map;
}

async function backfillAssetDisplayNames({ assetStore, args }) {
  const all = assetStore.listItemsForEnrichment();
  const byPatient = groupByPatientId(all);

  const stats = {
    scanned: all.length,
    patients: byPatient.size,
    candidates: 0,
    skippedDeleted: 0,
    skippedManual: 0,
    skippedAlreadyNamed: 0,
    skippedNoPatientId: 0,
    skippedPatientFilter: 0,
    skippedCategoryFilter: 0,
    patched: 0,
    skippedNeedsReview: 0,
    failed: 0,
    dryRun: args.dryRun,
    limit: args.limit,
    offset: args.offset,
    batchSize: args.batchSize,
  };
  const errors = [];
  const samples = [];
  const needsReviewSamples = [];

  const candidates = [];
  for (const [patientId, patientAssets] of byPatient) {
    if (args.patientIds && !args.patientIds.has(patientId)) {
      stats.skippedPatientFilter += patientAssets.length;
      continue;
    }
    for (const asset of patientAssets) {
      if (!normalizeText(asset.patientId)) {
        stats.skippedNoPatientId += 1;
        continue;
      }
      if (args.categories && !args.categories.has(asset.category)) {
        stats.skippedCategoryFilter += 1;
        continue;
      }
      if (!needsBackfill(asset, { force: args.force })) {
        if (asset.deletedAt) stats.skippedDeleted += 1;
        else if (asset.namingStatus === 'manual') stats.skippedManual += 1;
        else stats.skippedAlreadyNamed += 1;
        continue;
      }
      candidates.push({ asset, patientAssets });
    }
  }

  stats.candidates = candidates.length;
  const start = Math.max(0, args.offset);
  const end = args.limit > 0 ? start + args.limit : candidates.length;
  const batch = candidates.slice(start, end);

  if (args.dryRun) {
    for (const { asset, patientAssets } of batch) {
      try {
        const namingPatch = buildAssetNamingMetadata(asset, {
          siblingAssets: patientAssets,
        });
        const row = {
          assetId: asset.id,
          patientId: asset.patientId,
          category: asset.category,
          originalFileName: asset.originalFileName,
          oldDisplayName: asset.displayName,
          newDisplayName: namingPatch.displayName,
          namingStatus: namingPatch.namingStatus,
          namingConfidence: namingPatch.namingConfidence,
        };
        // Dry-run ska förhandsvisa vad --commit FAKTISKT gör, inklusive vad
        // den håller tillbaka — annars ser en granskning ren ut trots att
        // skarp körning senare skulle ha skrivit lika mycket lågkonfident
        // gissningsarbete som den gör här.
        if (isAutoSafeNamingPatch(namingPatch)) {
          stats.patched += 1;
          if (samples.length < 10) samples.push(row);
        } else {
          stats.skippedNeedsReview += 1;
          if (needsReviewSamples.length < 10) needsReviewSamples.push(row);
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
      needsReviewSamples,
      errors,
    };
  }

  assetStore.beginBatch();
  let inBatch = 0;
  try {
    for (let i = 0; i < batch.length; i += 1) {
      const { asset, patientAssets } = batch[i];
      try {
        const namingPatch = buildAssetNamingMetadata(asset, {
          siblingAssets: patientAssets,
        });
        const row = {
          assetId: asset.id,
          patientId: asset.patientId,
          category: asset.category,
          originalFileName: asset.originalFileName,
          oldDisplayName: asset.displayName,
          newDisplayName: namingPatch.displayName,
          namingStatus: namingPatch.namingStatus,
          namingConfidence: namingPatch.namingConfidence,
        };
        // Skriv ALDRIG en lågkonfident gissning över ett existerande
        // displayName utan mänsklig granskning — se isAutoSafeNamingPatch.
        if (isAutoSafeNamingPatch(namingPatch)) {
          await assetStore.patchAssetNamingMetadata(asset.id, namingPatch, {
            actor: ACTOR,
            reason: 'backfill_asset_display_name',
          });
          stats.patched += 1;
          if (samples.length < 10) samples.push(row);
        } else {
          stats.skippedNeedsReview += 1;
          if (needsReviewSamples.length < 10) needsReviewSamples.push(row);
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
    needsReviewSamples,
    errors,
  };
}

async function main() {
  const args = parseArgs();
  const assetsPath =
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH ||
    process.env.CCO_PATIENT_ASSETS_PATH ||
    path.join(DATA, 'cco-patient-assets.json');
  const auditPath = process.env.ARCANA_CCO_AUDIT_PATH || path.join(DATA, 'cco-audit.jsonl');

  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: assetsPath,
    auditLog,
  });

  const report = await backfillAssetDisplayNames({ assetStore, args });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[backfill-asset-display-names] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  backfillAssetDisplayNames,
  needsBackfill,
  looksTechnical,
  isAutoSafeNamingPatch,
};
