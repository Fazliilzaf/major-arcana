#!/usr/bin/env node
'use strict';

/**
 * P6.14.3 — Backfill driveFileId (idempotent wrapper)
 *
 * Idempotent backfill av `driveFileId` för migration-indexet. Körs säkert
 * flera gånger — en redan-matchad fil hoppas över. Vid varje körning
 * skrivs en backfill-rapport som markerar varje pre-existerande
 * "no driveFileId" med `driveFileIdResolved: true|false` + `reason`.
 *
 * Strategi:
 *   1. Audit före: läs in index, gruppera saknade.
 *   2. Om Drive-credentials finns: kör samma logik som
 *      `migration:enrich-drive-ids` (cache + lookup).
 *   3. Om credentials saknas: skip enrichment men producera ändå
 *      en strukturerad rapport och markera kvarvarande filer med
 *      `driveFileIdResolved: false` + reason `manual_resolve_required`
 *      eller `non_drive_source`. (Skrivs ENDAST i rapport — index
 *      modifieras inte i dry-run-läge eller om credentials saknas.)
 *
 * Usage:
 *   node scripts/backfill-drive-file-ids.js --dry-run  # default
 *   node scripts/backfill-drive-file-ids.js --apply    # skriv index
 *   node scripts/backfill-drive-file-ids.js --report ./data/reports/drive-backfill.json
 *
 * Flaggor:
 *   --apply           Skriv tillbaka index efter enrichment (annars dry-run).
 *   --refresh-cache   Ignorera cache och lista Drive-filer på nytt.
 *   --report <path>   Var rapport ska sparas (default: data/reports/drive-backfill-<ts>.json).
 *   --index <path>    Sökväg till migration-index (default: ARCANA_MIGRATION_INDEX_PATH).
 *
 * Output: skriver alltid en rapport (JSON) — även om enrichment hoppas över.
 *
 * Notera: 100% match (570 → 0) kan kräva manuellt arbete (patientmappar
 * borttagna i Drive, gamla stubs, eller filer som aldrig fanns i Drive).
 * Skriptet rapporterar vad som blev kvar och varför.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { classifyMissingFile, summarizeFile } = require('./audit-missing-drive-file-ids');
const {
  resolveDriveCredentials,
  resolveMigrationPaths,
  loadServiceAccountFromCreds,
} = require('./migration/lib/migrationEnv');
const {
  buildDriveLookup,
  lookupDriveFile,
} = require('./migration/lib/driveFileMatch');
const { buildFileRecord, normalizePersonnummer } = require('./migration/lib/migrationUtils');

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NON_DRIVE_SOURCES = new Set(['cliento_export', 'pipedrive']);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    refreshCache: false,
    reportPath: '',
    indexPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--apply') {
      args.apply = true;
    } else if (flag === '--dry-run') {
      args.apply = false;
    } else if (flag === '--refresh-cache') {
      args.refreshCache = true;
    } else if (flag === '--report') {
      args.reportPath = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (flag === '--index') {
      args.indexPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return args;
}

function defaultReportPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'data', 'reports', `drive-backfill-${ts}.json`);
}

function ensureDirSync(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDriveCacheIfFresh(cachePath, folderId) {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!Array.isArray(cached.files) || !cached.files.length) return null;
    if (String(cached.folderId || '') !== String(folderId || '')) return null;
    const ageMs = Date.now() - Date.parse(cached.generatedAt || '');
    if (!Number.isFinite(ageMs) || ageMs > CACHE_MAX_AGE_MS) return null;
    return { files: cached.files, ageMs };
  } catch {
    return null;
  }
}

function classifyResolution(file = {}) {
  const source = String(file.source || '').trim();
  if (NON_DRIVE_SOURCES.has(source)) {
    return { resolved: false, reason: 'non_drive_source' };
  }
  if (!String(file.personnummer || '').trim() && !String(file.relativePath || '').trim()) {
    return { resolved: false, reason: 'no_personnummer_no_path' };
  }
  return { resolved: false, reason: 'manual_resolve_required' };
}

function buildSkipReport({ indexResolved, indexData, beforeMissing, args, reason, detail }) {
  const buckets = new Map();
  for (const file of beforeMissing) {
    const classification = classifyMissingFile(file);
    const key = classification.bucket;
    if (!buckets.has(key)) buckets.set(key, { bucket: key, count: 0, samples: [] });
    const entry = buckets.get(key);
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(summarizeFile(file));
  }
  return {
    generatedAt: new Date().toISOString(),
    indexPath: indexResolved,
    indexUpdatedAt: String(indexData.updatedAt || ''),
    totalFiles: Array.isArray(indexData.files) ? indexData.files.length : 0,
    missingBefore: beforeMissing.length,
    missingAfter: beforeMissing.length,
    matched: 0,
    skippedReason: reason,
    skippedDetail: detail || '',
    apply: args.apply,
    buckets: Array.from(buckets.values()).sort((left, right) => right.count - left.count),
    unresolvedSamples: beforeMissing.slice(0, 10).map((file) => ({
      ...summarizeFile(file),
      resolution: classifyResolution(file),
    })),
  };
}

async function runEnrichment({ indexResolved, indexData, args }) {
  const paths = resolveMigrationPaths();
  const creds = resolveDriveCredentials(paths);
  const beforeMissing = indexData.files.filter(
    (file) => !String(file.driveFileId || '').trim()
  );
  if (!creds.ok) {
    return {
      mode: 'skipped_no_credentials',
      missingCredentials: creds.missing,
      report: buildSkipReport({
        indexResolved,
        indexData,
        beforeMissing,
        args,
        reason: 'no_drive_credentials',
        detail: `Saknade env: ${creds.missing.join(', ')}`,
      }),
    };
  }

  const cachePath = path.join(path.dirname(paths.indexPath), 'drive-api-file-index.cache.json');
  let driveFiles = null;
  let cacheAgeMs = null;
  if (!args.refreshCache) {
    const cached = loadDriveCacheIfFresh(cachePath, creds.folderId);
    if (cached) {
      driveFiles = cached.files;
      cacheAgeMs = cached.ageMs;
    }
  }

  if (!driveFiles) {
    try {
      const { getAccessToken, listAllDriveFiles } = require('./migration/lib/googleDriveApi');
      const serviceAccount = loadServiceAccountFromCreds(creds);
      const accessToken = await getAccessToken(serviceAccount);
      driveFiles = await listAllDriveFiles({
        accessToken,
        rootFolderId: creds.folderId,
        serviceAccount,
      });
    } catch (error) {
      return {
        mode: 'skipped_drive_api_error',
        report: buildSkipReport({
          indexResolved,
          indexData,
          beforeMissing,
          args,
          reason: 'drive_api_error',
          detail: error?.message || String(error),
        }),
      };
    }
  }

  const lookup = buildDriveLookup(
    driveFiles.map((item) => {
      const records = buildFileRecord({
        source: 'drive_api',
        relativePath: item.relativePath,
        driveFileId: item.driveFileId,
        mimeType: item.mimeType,
        webViewLink: item.webViewLink,
      });
      return {
        ...item,
        personnummer: normalizePersonnummer(records.personnummer),
        fileName: records.fileName || path.basename(item.relativePath || ''),
      };
    })
  );

  let matched = 0;
  let relaxedMatched = 0;
  const stillMissing = [];

  for (const file of indexData.files) {
    if (String(file.driveFileId || '').trim()) continue;
    const pnr = normalizePersonnummer(file.personnummer);
    const fileName = String(file.fileName || path.basename(file.relativePath || '')).toLowerCase();
    let hit = lookupDriveFile({
      lookup,
      personnummer: pnr,
      fileName,
      relativePath: file.relativePath,
    });
    if (!hit) {
      hit = lookupDriveFile({
        lookup,
        personnummer: '',
        fileName,
        relativePath: file.relativePath,
      });
      if (hit) relaxedMatched += 1;
    }
    if (!hit) {
      stillMissing.push(file);
      continue;
    }
    file.driveFileId = hit.driveFileId;
    file.mimeType = hit.mimeType || file.mimeType || '';
    file.webViewLink = hit.webViewLink || file.webViewLink || '';
    matched += 1;
  }

  const buckets = new Map();
  for (const file of stillMissing) {
    const classification = classifyMissingFile(file);
    const key = classification.bucket;
    if (!buckets.has(key)) buckets.set(key, { bucket: key, count: 0, samples: [] });
    const entry = buckets.get(key);
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(summarizeFile(file));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    indexPath: indexResolved,
    indexUpdatedAt: String(indexData.updatedAt || ''),
    totalFiles: indexData.files.length,
    missingBefore: beforeMissing.length,
    missingAfter: stillMissing.length,
    matched,
    relaxedMatched,
    apply: args.apply,
    cacheAgeMs,
    driveFolderId: creds.folderId,
    buckets: Array.from(buckets.values()).sort((left, right) => right.count - left.count),
    unresolvedSamples: stillMissing.slice(0, 10).map((file) => ({
      ...summarizeFile(file),
      resolution: classifyResolution(file),
    })),
  };

  if (args.apply && matched > 0) {
    indexData.updatedAt = new Date().toISOString();
    fs.writeFileSync(indexResolved, `${JSON.stringify(indexData, null, 2)}\n`, 'utf8');
  }

  return { mode: 'enriched', report };
}

async function main() {
  const args = parseArgs();
  const indexPath =
    args.indexPath || process.env.ARCANA_MIGRATION_INDEX_PATH ||
    path.resolve(process.cwd(), 'data', 'migration-index.json');
  const indexResolved = path.resolve(indexPath);
  if (!fs.existsSync(indexResolved)) {
    throw new Error(`migration-index saknas: ${indexResolved}`);
  }
  const indexData = JSON.parse(fs.readFileSync(indexResolved, 'utf8'));
  if (!Array.isArray(indexData.files)) {
    throw new Error('migration-index saknar files[] — kör migration:scan först.');
  }

  const result = await runEnrichment({ indexResolved, indexData, args });

  const reportPath = args.reportPath || defaultReportPath();
  ensureDirSync(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');

  console.log(`Drive backfill (${args.apply ? 'APPLY' : 'DRY-RUN'}) — mode: ${result.mode}`);
  console.log(
    `  totalFiles: ${result.report.totalFiles}, missingBefore: ${result.report.missingBefore}, missingAfter: ${result.report.missingAfter}, matched: ${result.report.matched || 0}`
  );
  if (result.report.skippedReason) {
    console.log(`  skipped: ${result.report.skippedReason} — ${result.report.skippedDetail || ''}`);
  }
  console.log(`  rapport: ${reportPath}`);
  if (!args.apply) {
    console.log('  Dry-run — index ej skrivet. Lägg till --apply för att spara.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

module.exports = {
  classifyResolution,
  parseArgs,
};
