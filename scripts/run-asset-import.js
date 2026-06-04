#!/usr/bin/env node
'use strict';

/**
 * scripts/run-asset-import.js — CLI för CCO Asset Import Pipeline (P0.D bonus).
 *
 * Per `.cursor/rules/cco-no-drive-links-import-only.mdc`. Importerar filer
 * från Drive / old_cco / Meridiq till CCO secure storage. INGEN PII i stdout;
 * counts only.
 *
 * Usage:
 *   node scripts/run-asset-import.js --source-system drive
 *   node scripts/run-asset-import.js --source-system old_cco --limit 100
 *   node scripts/run-asset-import.js --source-system meridiq --commit
 *
 * Flags:
 *   --source-system <drive|old_cco|meridiq>  Required.
 *   --mode <full|incremental>                Default: incremental.
 *   --limit <N>                              0 = all. Default: 0.
 *   --dry-run                                Default. Skriver INTE till stores.
 *   --commit                                 Skriv till stores.
 *   --tenant-id <id>                         Optional tenant-scope.
 *   --root <path>                            Override secure-storage rotpath.
 *
 * Compliance:
 *   - PII får aldrig hamna i stdout. Endast counts + run-id + status.
 *   - Default är dry-run. --commit krävs för faktisk skrivning.
 */

const path = require('node:path');
const fs = require('node:fs/promises');

const {
  createCcoAssetImportPipeline,
} = require('../src/ops/ccoAssetImportPipeline');
const {
  createCcoPatientAssetStore,
} = require('../src/ops/ccoPatientAssetStore');
const {
  createCcoAssetImportRunStore,
} = require('../src/ops/ccoAssetImportRunStore');
const {
  createCcoAssetReviewQueueStore,
} = require('../src/ops/ccoAssetReviewQueueStore');
const {
  createSecureStorageProvider,
} = require('../src/ops/ccoSecureStorageProvider');

function parseArgs(argv) {
  const args = {
    sourceSystem: null,
    mode: 'incremental',
    limit: 0,
    dryRun: true,
    tenantId: null,
    root: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--source-system':
        args.sourceSystem = argv[++i];
        break;
      case '--mode':
        args.mode = argv[++i];
        break;
      case '--limit':
        args.limit = Math.max(0, Number(argv[++i]) || 0);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--commit':
        args.dryRun = false;
        break;
      case '--tenant-id':
        args.tenantId = argv[++i];
        break;
      case '--root':
        args.root = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        // ignore unknown
        break;
    }
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Usage: run-asset-import.js --source-system <drive|old_cco|meridiq> [opts]

Flags:
  --source-system <drive|old_cco|meridiq>  Required
  --mode <full|incremental>                Default: incremental
  --limit <N>                              0 = all (default: 0)
  --dry-run                                Default (no writes)
  --commit                                 Write to stores
  --tenant-id <id>                         Tenant scope
  --root <path>                            Override secure storage root
  --help                                   This message
`);
}

function ensureDataPath(name) {
  // data/ är gitignored — säkert att placera per-tenant state här.
  return path.resolve(process.cwd(), 'data', name);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.sourceSystem) {
    process.stderr.write('error: --source-system krävs\n');
    printHelp();
    process.exit(2);
  }
  if (!['drive', 'old_cco', 'meridiq'].includes(args.sourceSystem)) {
    process.stderr.write(
      `error: invalid --source-system "${args.sourceSystem}" (expect drive|old_cco|meridiq)\n`
    );
    process.exit(2);
  }
  if (!['full', 'incremental'].includes(args.mode)) {
    process.stderr.write(`error: invalid --mode "${args.mode}"\n`);
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  process.stdout.write(
    JSON.stringify({
      event: 'asset_import_start',
      ts: startedAt,
      sourceSystem: args.sourceSystem,
      mode: args.mode,
      limit: args.limit,
      dryRun: args.dryRun,
      tenantId: args.tenantId,
    }) + '\n'
  );

  if (args.dryRun) {
    // Dry-run: visa endast vad SOM SKULLE göras. Vi initialiserar stores i
    // ett tempdir-prefix i data/.dry-run-... så vi inte skriver över riktiga.
    const os = require('node:os');
    const tmpRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'cco-asset-import-dryrun-')
    );
    const assetStore = await createCcoPatientAssetStore({
      filePath: path.join(tmpRoot, 'assets.json'),
    });
    const importRunStore = await createCcoAssetImportRunStore({
      filePath: path.join(tmpRoot, 'runs.json'),
    });
    const reviewQueueStore = await createCcoAssetReviewQueueStore({
      filePath: path.join(tmpRoot, 'review.json'),
    });
    const storage = createSecureStorageProvider({
      provider: 'local',
      rootPath: args.root || path.join(tmpRoot, 'storage'),
    });
    const pipeline = createCcoAssetImportPipeline({
      assetStore,
      importRunStore,
      reviewQueueStore,
      storage,
    });
    const result = await pipeline.fullImportRun({
      tenantId: args.tenantId,
      sourceSystem: args.sourceSystem,
      mode: args.mode,
      createdBy: 'cli:dry-run',
      limit: args.limit,
    });
    const summary = {
      event: 'asset_import_dry_run_summary',
      ts: new Date().toISOString(),
      runId: result.runId,
      sourceSystem: args.sourceSystem,
      mode: args.mode,
      tenantId: args.tenantId,
      counters: {
        totalDiscovered: result.run.totalDiscovered,
        totalImported: result.run.totalImported,
        totalVerified: result.run.totalVerified,
        totalNeedsReview: result.run.totalNeedsReview,
        totalFailed: result.run.totalFailed,
        totalLinkOnlyBlockers: result.run.totalLinkOnlyBlockers,
      },
      note:
        'DRY-RUN — inga writes till persistent stores. För riktig körning, kör med --commit.',
    };
    process.stdout.write(JSON.stringify(summary) + '\n');
    return;
  }

  // --commit: faktisk körning, skriver till data/cco-*.json
  const assetStore = await createCcoPatientAssetStore({
    filePath: ensureDataPath('cco-patient-assets.json'),
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: ensureDataPath('cco-asset-import-runs.json'),
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: ensureDataPath('cco-asset-review-queue.json'),
  });
  const storage = createSecureStorageProvider({
    provider: 'local',
    rootPath: args.root || undefined,
  });
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
  });
  const result = await pipeline.fullImportRun({
    tenantId: args.tenantId,
    sourceSystem: args.sourceSystem,
    mode: args.mode,
    createdBy: 'cli:commit',
    limit: args.limit,
  });
  process.stdout.write(
    JSON.stringify({
      event: 'asset_import_commit_summary',
      ts: new Date().toISOString(),
      runId: result.runId,
      sourceSystem: args.sourceSystem,
      mode: args.mode,
      tenantId: args.tenantId,
      counters: {
        totalDiscovered: result.run.totalDiscovered,
        totalImported: result.run.totalImported,
        totalVerified: result.run.totalVerified,
        totalNeedsReview: result.run.totalNeedsReview,
        totalFailed: result.run.totalFailed,
        totalLinkOnlyBlockers: result.run.totalLinkOnlyBlockers,
      },
    }) + '\n'
  );
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err.message}\n`);
  process.exit(1);
});
