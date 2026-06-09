#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { backfillAssetThumbnails } = require('../src/ops/ccoAssetThumbnailBackfill');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    assetsPath:
      process.env.ARCANA_CCO_PATIENT_ASSETS_PATH ||
      process.env.CCO_PATIENT_ASSETS_PATH ||
      path.resolve(process.cwd(), 'data', 'cco-patient-assets.json'),
    storageRoot: process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || '',
    limit: 100,
    offset: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.dryRun = false;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--assets') args.assetsPath = path.resolve(argv[++i]);
    else if (flag === '--storage-root') args.storageRoot = path.resolve(argv[++i]);
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++i]) || 0);
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const assetStore = await createCcoPatientAssetStore({ filePath: args.assetsPath });
  const storage = createSecureStorageProvider({
    provider: 'local',
    ...(args.storageRoot ? { rootPath: args.storageRoot } : {}),
  });
  const report = await backfillAssetThumbnails({
    assetStore,
    storage,
    limit: args.limit,
    offset: args.offset,
    dryRun: args.dryRun,
  });
  report.input = {
    assetsPath: args.assetsPath,
    storageRoot: args.storageRoot || '(provider default)',
    limit: args.limit,
    offset: args.offset,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[asset-thumbnail-backfill] ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
};
