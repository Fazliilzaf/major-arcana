#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { buildFileRecord } = require('./lib/migrationUtils');
const { writeMigrationIndex } = require('./lib/migrationIndexWriter');
const {
  getAccessToken,
  listAllDriveFiles,
  loadServiceAccountJson,
} = require('./lib/googleDriveApi');

function parseArgs(argv) {
  const args = {
    folderId: '',
    serviceAccountPath: '',
    out: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--folder-id') args.folderId = argv[++i];
    else if (token === '--service-account') args.serviceAccountPath = argv[++i];
    else if (token === '--out') args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const folderId =
    args.folderId ||
    process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID ||
    process.env.ARCANA_DRIVE_JOURNAL_FOLDER_ID ||
    '';
  const serviceAccountPath =
    args.serviceAccountPath ||
    process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    '';

  if (!folderId) {
    throw new Error('Ange journalmappens folder-id med --folder-id eller ARCANA_GOOGLE_DRIVE_FOLDER_ID.');
  }
  if (!serviceAccountPath) {
    throw new Error(
      'Ange service account JSON med --service-account eller ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON.'
    );
  }

  const outPath =
    args.out ||
    process.env.ARCANA_MIGRATION_INDEX_PATH ||
    path.join(process.cwd(), 'data', 'migration-index.json');

  const startedAt = new Date().toISOString();
  console.log(`Indexerar Google Drive-mapp ${folderId} via API (ingen zip-nedladdning)...`);

  const serviceAccount = loadServiceAccountJson(path.resolve(serviceAccountPath));
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
