#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { buildFileRecord } = require('./lib/migrationUtils');
const { writeMigrationIndex } = require('./lib/migrationIndexWriter');
const { resolveDriveCredentials, resolveMigrationPaths, loadServiceAccountFromCreds } = require('./lib/migrationEnv');
const {
  getAccessToken,
  listAllDriveFiles,
} = require('./lib/googleDriveApi');

function parseArgs(argv) {
  const args = { verifyOnly: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--folder-id') args.folderId = argv[++i];
    else if (token === '--service-account') args.serviceAccountPath = argv[++i];
    else if (token === '--out') args.out = argv[++i];
    else if (token === '--verify-only') args.verifyOnly = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const paths = resolveMigrationPaths(args);
  const creds = resolveDriveCredentials(paths);

  if (!creds.ok) {
    throw new Error(
      `Drive API saknar konfiguration: ${creds.missing.join(', ')}. Kör npm run migration:preflight-drive.`
    );
  }

  if (args.verifyOnly) {
    const serviceAccount = loadServiceAccountFromCreds(creds);
    const accessToken = await getAccessToken(serviceAccount);
    const sample = await listAllDriveFiles({
      accessToken,
      rootFolderId: creds.folderId,
      onProgress: ({ foldersScanned, filesIndexed }) => {
        if (foldersScanned <= 3) {
          console.log(`… verify ${foldersScanned} mappar, ${filesIndexed} filer`);
        }
      },
      maxFolders: 3,
    });
    console.log('\n=== VERIFY ONLY (begränsad crawl) ===');
    console.log(`Service account: ${serviceAccount.client_email}`);
    console.log(`Folder ID: ${creds.folderId}`);
    console.log(`Filer i sample-crawl: ${sample.length}`);
    console.log('Kör utan --verify-only för full indexering.');
    return;
  }

  const outPath = args.out || paths.indexPath;
  const folderId = creds.folderId;
  const serviceAccountPath = creds.serviceAccountPath;

  const startedAt = new Date().toISOString();
  console.log(`Indexerar Google Drive-mapp ${folderId} via API (ingen zip-nedladdning)...`);

  const serviceAccount = loadServiceAccountFromCreds(creds);
  const accessToken = await getAccessToken(serviceAccount);
  const driveFiles = await listAllDriveFiles({
    accessToken,
    rootFolderId: folderId,
    onProgress: ({ foldersScanned, filesIndexed }) => {
      console.log(`… ${foldersScanned} mappar, ${filesIndexed} filer`);
    },
  });

  const files = driveFiles.map((item) =>
    buildFileRecord({
      source: 'drive_api',
      relativePath: item.relativePath,
      driveFileId: item.driveFileId,
      mimeType: item.mimeType,
      webViewLink: item.webViewLink,
    })
  );

  const scanMeta = {
    startedAt,
    completedAt: new Date().toISOString(),
    source: 'drive_api',
    driveFolderId: folderId,
    serviceAccountEmail: serviceAccount.client_email,
    fileCount: files.length,
  };

  const payload = writeMigrationIndex({ outPath, scanMeta, files });

  console.log('\n=== KLAR (GOOGLE DRIVE API) ===');
  console.log(`Filer indexerade: ${payload.stats.totalFiles}`);
  console.log(`Profiler (personnummer): ${payload.stats.totalProfiles}`);
  console.log(`Journal-PDF: ${payload.stats.journalPdfs}`);
  console.log(`Bilder: ${payload.stats.images}`);
  console.log(`Index sparat: ${outPath}`);
  console.log('\nKör sedan: npm run migration:import');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
