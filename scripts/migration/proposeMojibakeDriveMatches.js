#!/usr/bin/env node
'use strict';

/**
 * P6.14.4 — Review-gated mojibake match proposals for missing driveFileId.
 *
 * The remaining ~570 files without driveFileId are old zip imports whose names
 * suffered LOSSY mojibake (å/ä/ö replaced by literal "?"/"+?"), so byte-level
 * repair (repairMojibakeFilename) cannot recover them and the standard matcher
 * misses them. This tool matches them with a corruption-tolerant skeleton +
 * bigram similarity, GATED on personnummer (a file can only match a Drive file
 * belonging to the same patient).
 *
 * It NEVER auto-links by default: it writes a review report of proposed matches.
 * Linking medical records to the wrong patient is unacceptable, so apply is
 * opt-in and high-confidence-only unless --include-medium is passed.
 *
 * Usage:
 *   node scripts/migration/proposeMojibakeDriveMatches.js            # dry-run report
 *   node scripts/migration/proposeMojibakeDriveMatches.js --apply    # write high-confidence
 *   node scripts/migration/proposeMojibakeDriveMatches.js --apply --include-medium
 *   node scripts/migration/proposeMojibakeDriveMatches.js --min-score 0.85 --report ./out.json
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const {
  resolveDriveCredentials,
  resolveMigrationPaths,
  loadServiceAccountFromCreds,
} = require('./lib/migrationEnv');
const { buildFileRecord, normalizePersonnummer } = require('./lib/migrationUtils');
const { proposeDriveMatches } = require('./lib/mojibakeMatch');

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    includeMedium: false,
    refreshCache: false,
    minScore: 0.82,
    indexPath: '',
    reportPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--apply') args.apply = true;
    else if (flag === '--include-medium') args.includeMedium = true;
    else if (flag === '--refresh-cache') args.refreshCache = true;
    else if (flag === '--min-score') args.minScore = Number(argv[++i]) || args.minScore;
    else if (flag === '--index') args.indexPath = String(argv[++i] || '').trim();
    else if (flag === '--report') args.reportPath = String(argv[++i] || '').trim();
  }
  return args;
}

function defaultReportPath() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'data', 'reports', `mojibake-match-proposals-${ts}.json`);
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
    return cached.files;
  } catch {
    return null;
  }
}

async function loadDriveFiles({ paths, refreshCache }) {
  const creds = resolveDriveCredentials(paths);
  if (!creds.ok) {
    return { ok: false, reason: `Saknade Drive-credentials: ${creds.missing.join(', ')}` };
  }
  const cachePath = path.join(path.dirname(paths.indexPath), 'drive-api-file-index.cache.json');
  let raw = refreshCache ? null : loadDriveCacheIfFresh(cachePath, creds.folderId);
  if (!raw) {
    const { getAccessToken, listAllDriveFiles } = require('./lib/googleDriveApi');
    const serviceAccount = loadServiceAccountFromCreds(creds);
    const accessToken = await getAccessToken(serviceAccount);
    raw = await listAllDriveFiles({ accessToken, rootFolderId: creds.folderId, serviceAccount });
  }
  const files = raw.map((item) =>
    buildFileRecord({
      source: 'drive_api',
      relativePath: item.relativePath,
      driveFileId: item.driveFileId,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink,
    })
  );
  // buildFileRecord already normalizes personnummer + fileName + fileType.
  return { ok: true, files: files.map((file) => ({ ...file, personnummer: normalizePersonnummer(file.personnummer) })) };
}

function applyProposals({ indexData, proposed, includeMedium }) {
  const byId = new Map(indexData.files.map((file) => [String(file.id), file]));
  let applied = 0;
  for (const entry of proposed) {
    if (entry.confidence !== 'high' && !(includeMedium && entry.confidence === 'medium')) continue;
    const target = byId.get(String(entry.file.id));
    if (!target || String(target.driveFileId || '').trim()) continue;
    target.driveFileId = entry.match.driveFileId;
    target.driveMatchSource = 'mojibake_review';
    target.driveMatchConfidence = entry.confidence;
    applied += 1;
  }
  return applied;
}

async function main() {
  const args = parseArgs();
  const paths = resolveMigrationPaths({ indexPath: args.indexPath });
  const indexResolved = path.resolve(args.indexPath || paths.indexPath);
  if (!fs.existsSync(indexResolved)) throw new Error(`migration-index saknas: ${indexResolved}`);
  const indexData = JSON.parse(fs.readFileSync(indexResolved, 'utf8'));
  if (!Array.isArray(indexData.files)) throw new Error('migration-index saknar files[].');

  const missingFiles = indexData.files.filter((file) => !String(file.driveFileId || '').trim());
  const drive = await loadDriveFiles({ paths, refreshCache: args.refreshCache });
  if (!drive.ok) {
    console.error(`❌ ${drive.reason}`);
    process.exit(1);
  }

  const result = proposeDriveMatches({
    missingFiles,
    driveFiles: drive.files,
    minScore: args.minScore,
  });

  let applied = 0;
  if (args.apply) {
    applied = applyProposals({ indexData, proposed: result.proposed, includeMedium: args.includeMedium });
    if (applied > 0) {
      indexData.updatedAt = new Date().toISOString();
      fs.writeFileSync(indexResolved, `${JSON.stringify(indexData, null, 2)}\n`, 'utf8');
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    indexPath: indexResolved,
    minScore: args.minScore,
    apply: args.apply,
    includeMedium: args.includeMedium,
    appliedCount: applied,
    ...result,
  };
  const reportPath = args.reportPath || defaultReportPath();
  ensureDirSync(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const { stats } = result;
  console.log(`Mojibake match proposals (${args.apply ? 'APPLY' : 'DRY-RUN'})`);
  console.log(
    `  missing: ${stats.missing} — proposed high: ${stats.proposedHigh}, medium: ${stats.proposedMedium}, ambiguous: ${stats.ambiguous}, unresolved: ${stats.unresolved}`
  );
  if (args.apply) console.log(`  applied: ${applied} (${args.includeMedium ? 'high+medium' : 'high only'})`);
  else console.log('  Dry-run — index ej skrivet. Granska rapporten och kör --apply.');
  console.log(`  rapport: ${reportPath}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}

module.exports = { parseArgs, applyProposals };
