#!/usr/bin/env node
'use strict';

/**
 * Enrich zip-baserat migration-index med driveFileId från Google Drive API.
 * Matchar på personnummer + filnamn (case-insensitive).
 *
 * Usage:
 *   npm run migration:enrich-drive-ids
 *   npm run migration:enrich-drive-ids -- --dry-run
 */
const fs = require('node:fs');
const path = require('node:path');

const { buildFileRecord, normalizePersonnummer } = require('./lib/migrationUtils');
const { resolveDriveCredentials, resolveMigrationPaths, loadServiceAccountFromCreds } = require('./lib/migrationEnv');
const {
  getAccessToken,
  listAllDriveFiles,
} = require('./lib/googleDriveApi');

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

function buildDriveLookup(driveFiles) {
  const byKey = new Map();
  for (const item of driveFiles) {
    const records = buildFileRecord({
      source: 'drive_api',
      relativePath: item.relativePath,
      driveFileId: item.driveFileId,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink,
    });
    const pnr = normalizePersonnummer(records.personnummer);
    const fileName = String(records.fileName || path.basename(item.relativePath)).toLowerCase();
    if (!pnr || !fileName) continue;
    const key = `${pnr}::${fileName}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        driveFileId: item.driveFileId,
        mimeType: item.mimeType || '',
        webViewLink: item.webViewLink || '',
      });
    }
  }
  return byKey;
}

async function main() {
  const args = parseArgs(process.argv);
  const paths = resolveMigrationPaths();
  const creds = resolveDriveCredentials(paths);
  if (!creds.ok) {
    throw new Error(`Drive API saknar konfiguration: ${creds.missing.join(', ')}`);
  }

  const indexPath = paths.indexPath;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const files = Array.isArray(index.files) ? index.files : [];
  const needsEnrich = files.filter((file) => !String(file.driveFileId || '').trim());
  if (!needsEnrich.length) {
    console.log('Alla filer har redan driveFileId.');
    return;
  }

  console.log(`Enrich ${needsEnrich.length}/${files.length} filer från Drive folder ${creds.folderId}…`);
  const serviceAccount = loadServiceAccountFromCreds(creds);
  const accessToken = await getAccessToken(serviceAccount);
  const driveFiles = await listAllDriveFiles({
    accessToken,
    rootFolderId: creds.folderId,
    onProgress: ({ foldersScanned, filesIndexed }) => {
      if (foldersScanned % 50 === 0) {
        console.log(`… ${foldersScanned} mappar, ${filesIndexed} filer`);
      }
    },
  });
  const lookup = buildDriveLookup(driveFiles);

  let matched = 0;
  for (const file of files) {
    if (String(file.driveFileId || '').trim()) continue;
    const pnr = normalizePersonnummer(file.personnummer);
    const fileName = String(file.fileName || path.basename(file.relativePath || '')).toLowerCase();
    const hit = lookup.get(`${pnr}::${fileName}`);
    if (!hit) continue;
    file.driveFileId = hit.driveFileId;
    file.mimeType = hit.mimeType || file.mimeType || '';
    file.webViewLink = hit.webViewLink || file.webViewLink || '';
    matched += 1;
  }

  console.log(`Matchade ${matched}/${needsEnrich.length} filer utan driveFileId.`);
  if (args.dryRun) {
    console.log('Dry-run — index ej sparat.');
    return;
  }

  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`Sparade ${indexPath}`);
  console.log('Nästa: npm run push:migration-state-prod -- --files-only');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
