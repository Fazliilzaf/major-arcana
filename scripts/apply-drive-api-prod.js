#!/usr/bin/env node
'use strict';

/**
 * Sätt Google Drive API env på Render prod.
 * Kräver i .env:
 *   ARCANA_GOOGLE_DRIVE_FOLDER_ID
 *   ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json
 *
 * Usage:
 *   npm run apply:drive-prod
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
// ORD-156: merge-PUT via renderEnvApi — paginerad GET + spärr mot att skriva
// en kortare lista än den vi läste. Egen GET med ?limit=100 raderar tyst allt
// bortom första sidan, och render.yaml deklarerar 122 nycklar.
const { putRenderEnvMerged } = require('./lib/renderEnvApi');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

async function main() {
  let config;
  try {
    config = loadServiceAccountFromEnv(process.env);
  } catch (error) {
    fail(error.message || 'Kunde inte läsa service account.');
  }
  if (!config.ok) {
    fail(
      'Saknar ARCANA_GOOGLE_DRIVE_FOLDER_ID och/eller ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON i .env.'
    );
  }

  const saPath = path.resolve(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON || '');
  const saInline = String(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON || '')
    .trim()
    .startsWith('{')
    ? String(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON).trim()
    : fs.readFileSync(saPath, 'utf8');

  const driveKeys = {
    ARCANA_GOOGLE_DRIVE_FOLDER_ID: config.folderId,
    ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON: saInline,
    ARCANA_MIGRATION_INDEX_PATH: '/var/data/arcana/migration-index.json',
  };

  const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
  const cliYaml = fs.readFileSync(cliPath, 'utf8');
  const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
  if (!apiKey) fail('Saknar Render API key i ~/.render/cli.yaml');

  const { before, after, changed } = await putRenderEnvMerged(serviceId, driveKeys, { apiKey });

  console.log('✅ Drive API env satt på Render prod');
  console.log(`   env-nycklar: ${before} → ${after} (ändrade: ${changed.join(', ') || 'inga'})`);
  console.log(`   folderId=${config.folderId}`);
  console.log(`   serviceAccount=${config.serviceAccountEmail}`);
  console.log('');
  console.log('Nästa:');
  console.log('  1. render restart (eller vänta på deploy)');
  console.log('  2. npm run migration:enrich-drive-ids');
  console.log('  3. npm run push:migration-state-prod -- --files-only');
  console.log('  4. npm run verify:customer-list-prod');
}

main().catch((error) => {
  fail(error.message || error);
});
