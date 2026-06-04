#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

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
const { buildDriveLookup, lookupDriveFile } = require('./lib/driveFileMatch');
const {
  getAccessToken,
  listAllDriveFiles,
} = require('./lib/googleDriveApi');

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    refreshCache: argv.includes('--refresh-cache'),
  };
}

function resolveDriveCachePath(paths) {
  return path.join(path.dirname(paths.indexPath), 'drive-api-file-index.cache.json');
}

function loadDriveCache(cachePath, folderId) {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const ageMs = Date.now() - Date.parse(cached.generatedAt || '');
    if (!Array.isArray(cached.files) || !cached.files.length) return null;
    if (String(cached.folderId || '') !== String(folderId || '')) return null;
    if (!Number.isFinite(ageMs) || ageMs > CACHE_MAX_AGE_MS) return null;
    console.log(
      `Återanvänder Drive-cache (${cached.files.length} filer, ${Math.round(ageMs / 3600000)}h gammal).`
    );
    return cached.files;
  } catch {
    return null;
  }
}

function saveDriveCache(cachePath, folderId, driveFiles) {
  fs.writeFileSync(
    cachePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        folderId,
        fileCount: driveFiles.length,
        files: driveFiles,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log(`Drive-cache sparad: ${cachePath} (${driveFiles.length} filer)`);
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
  const cachePath = resolveDriveCachePath(paths);
  let driveFiles = null;
  if (!args.refreshCache) {
    driveFiles = loadDriveCache(cachePath, creds.folderId);
  }
  if (!driveFiles) {
    const serviceAccount = loadServiceAccountFromCreds(creds);
    const accessToken = await getAccessToken(serviceAccount);
    driveFiles = await listAllDriveFiles({
      accessToken,
      rootFolderId: creds.folderId,
      serviceAccount,
      onProgress: ({ foldersScanned, filesIndexed }) => {
        if (foldersScanned % 50 === 0) {
          console.log(`… ${foldersScanned} mappar, ${filesIndexed} filer`);
        }
      },
    });
    if (!args.dryRun) {
      saveDriveCache(cachePath, creds.folderId, driveFiles);
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
  for (const file of files) {
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
    if (!hit) continue;
    file.driveFileId = hit.driveFileId;
    file.mimeType = hit.mimeType || file.mimeType || '';
    file.webViewLink = hit.webViewLink || file.webViewLink || '';
    matched += 1;
  }

  console.log(
    `Matchade ${matched}/${needsEnrich.length} filer utan driveFileId${relaxedMatched ? ` (${relaxedMatched} via filnamn-fallback)` : ''}.`
  );
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
