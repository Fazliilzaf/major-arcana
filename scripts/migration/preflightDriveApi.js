#!/usr/bin/env node
'use strict';

/**
 * C1 — Preflight för Google Drive API migration.
 * Verifierar credentials, hämtar token och listar rotmapp utan full indexering.
 *
 * Usage:
 *   npm run migration:preflight-drive
 *   npm run migration:preflight-drive -- --folder-id=... --service-account=...
 */

const {
  getAccessToken,
  getFolderMetadata,
  listChildrenPage,
} = require('./lib/googleDriveApi');
const { resolveDriveCredentials, resolveMigrationPaths, loadServiceAccountFromCreds } = require('./lib/migrationEnv');

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') args.json = true;
    else if (token === '--folder-id') args.folderId = argv[++i];
    else if (token === '--service-account') args.serviceAccountPath = argv[++i];
  }
  return args;
}

function record(name, pass, detail = '') {
  const line = `${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`;
  if (!pass) process.stderr.write(`${line}\n`);
  else console.log(line);
  return pass;
}

async function main() {
  const cli = parseArgs(process.argv);
  const paths = resolveMigrationPaths(cli);
  const creds = resolveDriveCredentials(paths);
  const report = {
    ok: false,
    folderId: creds.folderId || '',
    serviceAccountEmail: '',
    serviceAccountPath: creds.serviceAccountPath || '',
    rootFolderName: '',
    rootChildCount: 0,
    sampleFiles: [],
    missing: creds.missing || [],
  };

  if (!creds.ok) {
    if (!cli.json) {
      console.log('C1 preflight — Google Drive API\n');
      record('Credentials', false, creds.missing.join(', '));
      console.log('\nSätt i .env eller Render:');
      console.log('  ARCANA_GOOGLE_DRIVE_FOLDER_ID=<folder-id från Drive URL>');
      console.log('  ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json');
      console.log('\nDela journalmappen i Drive med service account client_email.');
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
    process.exit(1);
  }

  const serviceAccount = loadServiceAccountFromCreds(creds);
  report.serviceAccountEmail = serviceAccount.client_email;

  const accessToken = await getAccessToken(serviceAccount);
  const folderMeta = await getFolderMetadata({ accessToken, folderId: creds.folderId });
  report.rootFolderName = folderMeta.name || '';
  report.rootChildCount = folderMeta.childCount;

  const samplePage = await listChildrenPage({ accessToken, folderId: creds.folderId });
  report.sampleFiles = (samplePage.files || []).slice(0, 8).map((item) => ({
    name: item.name,
    mimeType: item.mimeType,
    id: item.id,
  }));

  report.ok = true;

  if (cli.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('C1 preflight — Google Drive API\n');
  let hardFail = false;
  if (!record('Credentials', true, creds.serviceAccountPath)) hardFail = true;
  if (!record('Access token', Boolean(accessToken))) hardFail = true;
  if (!record('Root folder', Boolean(report.rootFolderName), report.rootFolderName)) hardFail = true;
  if (!record('Root children', report.rootChildCount > 0, `${report.rootChildCount} direkta barn`)) {
    hardFail = true;
  }
  if (report.sampleFiles.length) {
    console.log('\nExempel från rotmappen:');
    report.sampleFiles.forEach((item) => {
      console.log(`  - ${item.name} (${item.mimeType})`);
    });
  }
  console.log('\nNästa steg: npm run migration:scan-drive-api');
  if (hardFail) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
