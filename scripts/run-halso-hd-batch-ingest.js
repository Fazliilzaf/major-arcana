#!/usr/bin/env node
'use strict';

/**
 * Strömmande batch-ingest för halso@ HD (en mejl i taget).
 * PUT-modell mot prod — ARCANA_CCO_HALSO_HD_INGEST_ENABLED förblir false.
 *
 * Usage:
 *   npm run ingest:halso-hd-batch -- --batch 1 --dry-run
 *   npm run ingest:halso-hd-batch -- --batch 1 --commit   # efter Fazli GO
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { readIndexLines, readJsonFile } = require('./lib/halsoHdGraphInbox');
const { fetchProdPatients, getProdToken, BASE } = require('./lib/halsoHdProdClient');
const { runHalsoBatchIngest } = require('./lib/halsoHdBatchIngest');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INDEX = path.join(ROOT, 'data/reports/halso-hd-corpus-index.jsonl');
const DEFAULT_CHECKPOINT = path.join(ROOT, 'data/reports/halso-hd-corpus.checkpoint.json');
const DEFAULT_DEDUP = path.join(ROOT, 'data/reports/halso-hd-batch-dedup.json');
const DEFAULT_REVIEW_QUEUE = path.join(ROOT, 'data/reports/halso-hd-review-queue.jsonl');
const DEFAULT_REPORT = path.join(ROOT, 'data/reports/halso-hd-batch-report.json');
const DEFAULT_PATIENT_MASTER = path.join(ROOT, 'data/cco-patient-master.json');

function parseArgs(argv) {
  const args = {
    batch: 1,
    batchSize: Number(process.env.HALSO_HD_BATCH_SIZE || '50') || 50,
    index: DEFAULT_INDEX,
    corpusCheckpoint: DEFAULT_CHECKPOINT,
    dedup: DEFAULT_DEDUP,
    reviewQueue: DEFAULT_REVIEW_QUEUE,
    out: DEFAULT_REPORT,
    dryRun: true,
    commit: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--batch') args.batch = Number(argv[++i]) || 1;
    else if (token === '--batch-size') args.batchSize = Number(argv[++i]) || 50;
    else if (token === '--index') args.index = path.resolve(argv[++i] || '');
    else if (token === '--dedup') args.dedup = path.resolve(argv[++i] || '');
    else if (token === '--review-queue') args.reviewQueue = path.resolve(argv[++i] || '');
    else if (token === '--out') args.out = path.resolve(argv[++i] || '');
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (token === '--help' || token === '-h') {
      console.log(
        'Usage: node scripts/run-halso-hd-batch-ingest.js --batch 1 [--batch-size 50] [--dry-run|--commit]'
      );
      process.exit(0);
    }
  }
  return args;
}

function loadLocalPatientMaster(masterPath = DEFAULT_PATIENT_MASTER) {
  if (!fsSync.existsSync(masterPath)) return [];
  const raw = JSON.parse(fsSync.readFileSync(masterPath, 'utf8'));
  const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
  return raw.tenants?.[tenantId]?.patients || [];
}

async function main() {
  const args = parseArgs(process.argv);
  const corpusCheckpoint = await readJsonFile(args.corpusCheckpoint, null);
  if (!corpusCheckpoint?.complete) {
    throw new Error(
      `Corpus-scan ej klar — kör npm run scan:halso-hd-corpus först (${args.corpusCheckpoint})`
    );
  }

  const indexEntries = await readIndexLines(args.index);
  if (!indexEntries.length) {
    throw new Error(`Tomt index — kör corpus-scan först (${args.index})`);
  }

  console.error(
    `== halso@ batch ${args.batch} (size ${args.batchSize}) — ${args.dryRun ? 'DRY-RUN' : 'COMMIT'} ==`
  );
  console.error(`Prod: ${BASE} · corpus=${indexEntries.length} mejl`);

  const useLocalPatients =
    args.dryRun && process.env.HALSO_HD_USE_LOCAL_PATIENT_MASTER === 'true';
  const token = args.dryRun ? '' : getProdToken();
  console.error(
    `Hämtar ${useLocalPatients ? 'lokal' : 'prod'} patient-master (en gång per batch)…`
  );
  const patients = useLocalPatients
    ? loadLocalPatientMaster(process.env.CCO_PATIENT_MASTER_PATH || DEFAULT_PATIENT_MASTER)
    : await fetchProdPatients(token || getProdToken());
  console.error(`Patienter laddade: ${patients.length}${useLocalPatients ? ' (lokal)' : ''}`);

  const runId = `halso-batch-${args.batch}-${new Date().toISOString().slice(0, 10)}`;
  let lastProgress = 0;

  const result = await runHalsoBatchIngest({
    indexEntries,
    batch: args.batch,
    batchSize: args.batchSize,
    patients,
    dedupPath: args.dedup,
    reviewQueuePath: args.reviewQueue,
    dryRun: args.dryRun,
    runId,
    token,
    onProgress: ({ index, total, stats }) => {
      if (index === total || index - lastProgress >= 10) {
        lastProgress = index;
        console.error(`  … ${index}/${total} matched=${stats.matched} dup=${stats.duplicate}`);
      }
    },
  });

  const report = {
    ok: true,
    phase: args.dryRun ? 'batch_dry_run' : 'batch_commit',
    prodUrl: BASE,
    ingestFlagNote: 'ARCANA_CCO_HALSO_HD_INGEST_ENABLED=false — PUT-modell som Cliento',
    bootstrapNote: 'ARCANA_BOOTSTRAP_MAILBOX_BACKFILL=false — ingen bootstrap/OOM-väg',
    runId,
    ...result,
    generatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`Rapport (PII): ${args.out} — committa INTE`);

  const safe = {
    ok: report.ok,
    phase: report.phase,
    corpusTotal: report.corpusTotal,
    batch: report.batch,
    batchSize: report.batchSize,
    batchCount: report.batchCount,
    dryRun: report.dryRun,
    stats: report.stats,
  };
  if (process.env.HALSO_HD_INCLUDE_SAMPLE_ROWS === 'true') {
    safe.sampleRows = report.rows.slice(0, 8);
  }
  console.log(JSON.stringify(safe, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
