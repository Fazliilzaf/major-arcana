#!/usr/bin/env node
'use strict';

/**
 * Phase 1 batch-ingest: lokal m365_halso PDF → parse → match prod API → PUT.
 * Prod asset-store saknar m365_halso — binärer läses från lokal secure storage.
 *
 * Usage:
 *   npm run scan:halso-hd-phase1-assets -- --assets-path data/cco-patient-assets.json
 *   npm run ingest:halso-hd-phase1-batch -- --batch 1 --dry-run
 *   npm run ingest:halso-hd-phase1-batch -- --batch 1 --commit
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { readIndexLines, readJsonFile } = require('./lib/halsoHdGraphInbox');
const { fetchProdPatients, getProdToken, BASE } = require('./lib/halsoHdProdClient');
const { runPhase1AssetBatchIngest } = require('./lib/halsoHdAssetBatchIngest');
const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INDEX = path.join(ROOT, 'data/reports/halso-hd-phase1-index.jsonl');
const DEFAULT_CHECKPOINT = path.join(ROOT, 'data/reports/halso-hd-phase1.checkpoint.json');
const DEFAULT_DEDUP = path.join(ROOT, 'data/reports/halso-hd-phase1-dedup.json');
const DEFAULT_REVIEW_QUEUE = path.join(ROOT, 'data/reports/halso-hd-review-queue.jsonl');
const DEFAULT_REPORT = path.join(ROOT, 'data/reports/halso-hd-phase1-batch-report.json');
const DEFAULT_STICKPROV = path.join(ROOT, 'data/reports/halso-hd-phase1-stickprov.json');

function parseArgs(argv) {
  const args = {
    batch: 1,
    batchSize: Number(process.env.HALSO_HD_PHASE1_BATCH_SIZE || '40') || 40,
    index: DEFAULT_INDEX,
    checkpoint: DEFAULT_CHECKPOINT,
    dedup: DEFAULT_DEDUP,
    reviewQueue: DEFAULT_REVIEW_QUEUE,
    out: DEFAULT_REPORT,
    stickprovOut: DEFAULT_STICKPROV,
    storageRoot: '',
    dryRun: true,
    commit: false,
    writeStickprov: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--batch') args.batch = Number(argv[++i]) || 1;
    else if (token === '--batch-size') args.batchSize = Number(argv[++i]) || 40;
    else if (token === '--index') args.index = path.resolve(argv[++i] || '');
    else if (token === '--dedup') args.dedup = path.resolve(argv[++i] || '');
    else if (token === '--review-queue') args.reviewQueue = path.resolve(argv[++i] || '');
    else if (token === '--out') args.out = path.resolve(argv[++i] || '');
    else if (token === '--stickprov-out') args.stickprovOut = path.resolve(argv[++i] || '');
    else if (token === '--storage-root') args.storageRoot = path.resolve(argv[++i] || '');
    else if (token === '--stickprov') args.writeStickprov = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (token === '--help' || token === '-h') {
      console.log(`Usage: node scripts/run-halso-hd-asset-batch-ingest.js \\
  --batch 1 [--batch-size 40] [--storage-root PATH] [--dry-run|--commit] [--stickprov]`);
      process.exit(0);
    }
  }
  return args;
}

function pickStickprovRows(rows = [], limit = 5) {
  const preferred = rows.filter((row) => ['dry_run_matched', 'put_ok'].includes(row.status));
  const pool =
    preferred.length >= limit ? preferred : rows.filter((row) => row.status !== 'pdf_failed');
  return pool.slice(0, limit).map((row) => ({
    assetId: row.assetId,
    status: row.status,
    patientId: row.patientId,
    matchMethod: row.matchMethod,
    matchConfidence: row.matchConfidence,
    personnummerMasked: row.personnummerMasked,
    signedAt: row.signedAt,
    answerCount: row.answerCount,
    originalFileName: row.originalFileName,
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const checkpoint = await readJsonFile(args.checkpoint, null);
  if (!checkpoint?.complete) {
    throw new Error(
      `Phase 1-scan ej klar — kör npm run scan:halso-hd-phase1-assets först (${args.checkpoint})`
    );
  }

  const catalogEntries = await readIndexLines(args.index);
  if (!catalogEntries.length) {
    throw new Error(`Tomt Phase 1-index (${args.index})`);
  }

  const storageRoot = resolveSecureStorageRoot(args.storageRoot);
  console.error(
    `== Phase 1 batch ${args.batch} (size ${args.batchSize}) — ${args.dryRun ? 'DRY-RUN' : 'COMMIT'} ==`
  );
  console.error(`Prod API: ${BASE} · catalog=${catalogEntries.length} PDF`);
  console.error(`Lokal PDF: ${storageRoot}`);

  const token = args.dryRun ? '' : getProdToken();
  console.error('Hämtar prod patient-master…');
  const patients = await fetchProdPatients(token || getProdToken());
  console.error(`Patienter laddade: ${patients.length}`);

  const runId = `halso-phase1-batch-${args.batch}-${new Date().toISOString().slice(0, 10)}`;
  let lastProgress = 0;

  const result = await runPhase1AssetBatchIngest({
    catalogEntries,
    batch: args.batch,
    batchSize: args.batchSize,
    patients,
    dedupPath: args.dedup,
    reviewQueuePath: args.reviewQueue,
    dryRun: args.dryRun,
    runId,
    token,
    storageRoot,
    onProgress: ({ index, total, stats }) => {
      if (index === total || index - lastProgress >= 10) {
        lastProgress = index;
        console.error(
          `  … ${index}/${total} pdfOk=${stats.pdfOk} matched=${stats.matched} dup=${stats.duplicate}`
        );
      }
    },
  });

  const report = {
    ok: true,
    phase: args.dryRun ? 'phase1_batch_dry_run' : 'phase1_batch_commit',
    prodUrl: BASE,
    storageRoot,
    pdfSource: 'local_secure_storage',
    prodAssetStoreNote:
      'Prod /var/data/cco-patient-assets.json saknar m365_halso — ingen prod PDF-download',
    ingestFlagNote: 'ARCANA_CCO_HALSO_HD_INGEST_ENABLED=false — PUT-modell som Cliento/Phase 2',
    runId,
    ...result,
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`Rapport (PII): ${args.out} — committa INTE`);

  if (args.writeStickprov || args.dryRun) {
    const stickprov = {
      ok: true,
      purpose: 'Claude stickprov (maskerad PII)',
      runId,
      batch: args.batch,
      stats: report.stats,
      samples: pickStickprovRows(report.rows, 5),
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(args.stickprovOut, `${JSON.stringify(stickprov, null, 2)}\n`, 'utf8');
    console.error(`Stickprov (PII): ${args.stickprovOut} — committa INTE`);
  }

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        phase: report.phase,
        catalogTotal: report.catalogTotal,
        batch: report.batch,
        batchCount: report.batchCount,
        dryRun: report.dryRun,
        stats: report.stats,
        sampleRows: report.rows.slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
