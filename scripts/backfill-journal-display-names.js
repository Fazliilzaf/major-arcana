#!/usr/bin/env node
'use strict';

/**
 * Backfill befintliga historiska journaler med displayName från patient-assets.
 *
 * Anledning: historiska Drive-import-journaler skapades med `title` satt till
 * filnamnet (mojibake för ÅÄÖ, t.ex. `Friskfo??rsa??kran-...`).  `displayName`
 * fanns inte på journalposten tidigare, så V12 kunde inte visa läsbara titlar.
 *
 * Matchning:
 *   journal.importMeta.fileId      -> asset.sourceRecordId || asset.id
 *   journal.importMeta.driveFileId -> asset.originalDriveFileId
 *
 * Användning:
 *   node scripts/backfill-journal-display-names.js --dry-run
 *   node scripts/backfill-journal-display-names.js --dry-run --limit 50
 *   node scripts/backfill-journal-display-names.js --commit --limit 1000
 *   node scripts/backfill-journal-display-names.js --commit --patient-ids P1,P2
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

const ACTOR = {
  role: 'system',
  userId: 'backfill-journal-display-names',
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
    tenantId: 'hair_tp',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
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
    else if (flag === '--tenant-id') args.tenantId = normalizeText(argv[++i]) || 'hair_tp';
  }
  if (args.commit) args.dryRun = false;
  if (!args.commit && !args.dryRun) args.dryRun = true;
  return args;
}

function looksMojibakeOrTechnical(title) {
  const t = normalizeText(title);
  if (!t) return true;
  if (/\?\?/.test(t)) return true;
  if (/(?:\uFFFD|Ã.|â€)/.test(t)) return true;
  return false;
}

function needsBackfill(entry) {
  const displayName = normalizeText(entry.displayName);
  if (displayName) return false;
  return looksMojibakeOrTechnical(entry.title);
}

function buildAssetIndex(assetStore) {
  const all =
    typeof assetStore?.listItemsForEnrichment === 'function'
      ? assetStore.listItemsForEnrichment()
      : Object.values(assetStore?.getState?.()?.items || {});
  const byFileId = new Map();
  const byDriveFileId = new Map();
  for (const asset of all) {
    const fileId = normalizeText(asset.sourceRecordId || asset.id);
    if (fileId && !byFileId.has(fileId)) byFileId.set(fileId, asset);
    const driveFileId = normalizeText(asset.originalDriveFileId);
    if (driveFileId && !byDriveFileId.has(driveFileId)) byDriveFileId.set(driveFileId, asset);
  }
  return { byFileId, byDriveFileId, totalAssets: all.length };
}

function findAssetForJournal(entry, index) {
  const fileId = normalizeText(entry.importMeta?.fileId);
  const driveFileId = normalizeText(entry.importMeta?.driveFileId);
  if (fileId && index.byFileId.has(fileId)) return index.byFileId.get(fileId);
  if (driveFileId && index.byDriveFileId.has(driveFileId))
    return index.byDriveFileId.get(driveFileId);
  return null;
}

function resolvePaths() {
  const journalPath =
    process.env.ARCANA_CCO_JOURNAL_STORE_PATH || path.join(DATA, 'cco-journal.json');
  const assetsPath =
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH || path.join(DATA, 'cco-patient-assets.json');
  return { journalPath, assetsPath };
}

async function backfillJournalDisplayNames({ journalStore, assetStore, args }) {
  const allEntries = await journalStore.listAllEntries({ tenantId: args.tenantId });
  const assetIndex = buildAssetIndex(assetStore);

  const stats = {
    scanned: allEntries.length,
    totalAssets: assetIndex.totalAssets,
    candidates: 0,
    skippedPatientFilter: 0,
    skippedType: 0,
    skippedAlreadyNamed: 0,
    matched: 0,
    unmatchedAssetMissingName: 0,
    unmatchedNoAsset: 0,
    patched: 0,
    dryRun: args.dryRun,
    limit: args.limit,
    offset: args.offset,
    batchSize: args.batchSize,
  };
  const samples = [];
  const errors = [];

  const candidates = [];
  for (const entry of allEntries) {
    if (args.patientIds && !args.patientIds.has(normalizeText(entry.patientId))) {
      stats.skippedPatientFilter += 1;
      continue;
    }
    if (normalizeText(entry.journalType) !== 'historical_import') {
      stats.skippedType += 1;
      continue;
    }
    if (!needsBackfill(entry)) {
      stats.skippedAlreadyNamed += 1;
      continue;
    }
    candidates.push(entry);
  }

  stats.candidates = candidates.length;
  const start = Math.max(0, args.offset);
  const end = args.limit > 0 ? start + args.limit : candidates.length;
  const batch = candidates.slice(start, end);

  let inBatch = 0;
  if (typeof journalStore.beginBatch === 'function') journalStore.beginBatch();
  try {
    for (let i = 0; i < batch.length; i += 1) {
      const entry = batch[i];
      try {
        const asset = findAssetForJournal(entry, assetIndex);
        if (!asset) {
          stats.unmatchedNoAsset += 1;
          continue;
        }
        stats.matched += 1;
        const displayName = normalizeText(asset.displayName);
        if (!displayName) {
          stats.unmatchedAssetMissingName += 1;
          continue;
        }
        if (samples.length < 10) {
          samples.push({
            entryId: entry.entryId,
            patientId: entry.patientId,
            oldTitle: entry.title,
            newDisplayName: displayName,
            assetId: asset.id,
            matchedBy:
              normalizeText(entry.importMeta?.fileId) ===
              normalizeText(asset.sourceRecordId || asset.id)
                ? 'fileId'
                : 'driveFileId',
          });
        }
        if (!args.dryRun) {
          await journalStore.patchDisplayName({
            tenantId: entry.tenantId,
            patientId: entry.patientId,
            entryId: entry.entryId,
            displayName,
            actor: ACTOR,
          });
        }
        stats.patched += 1;
      } catch (error) {
        stats.failed = (stats.failed || 0) + 1;
        errors.push({ entryId: entry.entryId, reason: error.message });
      }
      inBatch += 1;
      if (inBatch >= args.batchSize && typeof journalStore.checkpointBatch === 'function') {
        await journalStore.checkpointBatch();
        inBatch = 0;
      }
    }
    if (typeof journalStore.flushBatch === 'function') await journalStore.flushBatch();
  } catch (error) {
    if (typeof journalStore.flushBatch === 'function') {
      try {
        await journalStore.flushBatch();
      } catch {
        // best effort
      }
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
  const { journalPath, assetsPath } = resolvePaths();

  const journalStore = await createCcoJournalStore({ filePath: journalPath });
  const assetStore = await createCcoPatientAssetStore({ filePath: assetsPath });

  const report = await backfillJournalDisplayNames({ journalStore, assetStore, args });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[backfill-journal-display-names] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  needsBackfill,
  buildAssetIndex,
  findAssetForJournal,
  backfillJournalDisplayNames,
  resolvePaths,
};
