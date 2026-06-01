#!/usr/bin/env node
'use strict';

/**
 * Mail truth hydration from existing ingestion (NOT new mail import).
 *
 *   node scripts/run-mail-truth-hydration.js --snapshot
 *   node scripts/run-mail-truth-hydration.js --dry-run
 *   ENABLE_MAIL_TRUTH_HYDRATION_WRITE=true node scripts/run-mail-truth-hydration.js --canary --go
 *   ENABLE_MAIL_TRUTH_HYDRATION_WRITE=true node scripts/run-mail-truth-hydration.js --full --go
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const { config } = require('../src/config');
const { createConfiguredCcoMailboxTruthStore } = require('../src/ops/ccoMailboxTruthStoreFactory');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const {
  analyzeIngestionState,
  runMailTruthHydration,
} = require('../src/ops/mailTruthHydrationFromIngestion');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');
const REPORT_MD = path.join(REPO, 'docs/strategy/CCO-MAIL-TRUTH-HYDRATION-2026-06-01.md');

function parseArgs(argv) {
  const args = {
    snapshot: false,
    dryRun: false,
    canary: false,
    full: false,
    go: false,
    canaryLimit: 200,
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--snapshot') args.snapshot = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--canary') args.canary = true;
    else if (argv[i] === '--full') args.full = true;
    else if (argv[i] === '--go') args.go = true;
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--canary-limit') args.canaryLimit = Math.max(1, Number(argv[++i]) || 200);
  }
  if (!args.snapshot && !args.dryRun && !args.canary && !args.full) {
    args.dryRun = true;
  }
  return args;
}

async function snapshot(label) {
  const dir = path.join(DATA, 'backups', label);
  await fs.mkdir(dir, { recursive: true });
  const files = [
    'cco-mail-ingestion.json',
    'cco-mailbox-truth.json',
    'cco-conversation-state.json',
    'cco-conversation-thread-states.json',
    'cco-mail-snoozes.json',
    'cco-audit.jsonl',
  ];
  for (const name of files) {
    try {
      await fs.copyFile(path.join(DATA, name), path.join(dir, name));
    } catch {
      /* optional */
    }
  }
  const shardDir = path.join(DATA, 'cco-mailbox-truth');
  const destShard = path.join(dir, 'cco-mailbox-truth');
  try {
    await fs.cp(shardDir, destShard, { recursive: true });
  } catch {
    /* optional */
  }
  return dir;
}

async function loadPatientDirectory() {
  const store = await createCcoPatientMasterStore({
    filePath: path.join(DATA, 'cco-patient-master.json'),
  });
  const tenantId = config.defaultTenant || 'hair-tp-clinic';
  const listed = await store.listPatients({ tenantId, limit: 50000, offset: 0 });
  return listed.items || listed.patients || [];
}

async function appendReport(sectionMd) {
  let existing = '';
  try {
    existing = await fs.readFile(REPORT_MD, 'utf8');
  } catch {
    existing = '# CCO Mail Truth Hydration\n\n';
  }
  await fs.mkdir(path.dirname(REPORT_MD), { recursive: true });
  await fs.writeFile(REPORT_MD, `${existing}\n${sectionMd}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  const ingestionPath = config.ccoMailIngestionStorePath;
  const ingestionStat = await fs.stat(ingestionPath).catch(() => null);
  if (!ingestionStat || ingestionStat.size < 500) {
    throw new Error(
      `Ingestion store tom eller saknas (${ingestionPath}). Hydration måste köras där mail redan finns (prod).`
    );
  }

  if (args.snapshot) {
    const dir = await snapshot(`pre-mail-truth-hydration-${new Date().toISOString().slice(0, 10)}`);
    console.log(JSON.stringify({ phase: 'snapshot', dir }, null, 2));
    if (!args.dryRun && !args.canary && !args.full) return;
  }

  const truthStore = await createConfiguredCcoMailboxTruthStore(config);
  const auditLog = await createCcoAuditLog({
    filePath: path.join(DATA, 'cco-audit.jsonl'),
  });
  const patientDirectory = await loadPatientDirectory();

  const phase = args.full ? 'full' : args.canary ? 'canary' : 'dry-run';
  const writeEnabled = process.env.ENABLE_MAIL_TRUTH_HYDRATION_WRITE === 'true';

  if ((args.canary || args.full) && (!args.go || !writeEnabled)) {
    throw new Error('canary/full kräver --go och ENABLE_MAIL_TRUTH_HYDRATION_WRITE=true');
  }

  const result = await runMailTruthHydration({
    ingestionFilePath: ingestionPath,
    truthStore,
    auditLog,
    patientDirectory,
    phase,
    canaryLimit: args.canaryLimit,
  });

  const payload = {
    phase,
    ok: result.ok,
    runId: result.runId,
    analysisBefore: result.analysisBefore,
    applied: result.applied,
    analysisAfter: result.analysisAfter,
    stopReason: result.stopReason || null,
    ingestionSha256Before: result.ingestionSha256Before,
    ingestionSha256After: result.ingestionSha256After,
  };

  console.log(JSON.stringify(payload, null, 2));

  if (args.canary && result.ok) {
    console.log(JSON.stringify({ phase: 'canary_green', continuing: 'full' }, null, 2));
    const full = await runMailTruthHydration({
      ingestionFilePath: ingestionPath,
      truthStore,
      auditLog,
      patientDirectory,
      phase: 'full',
    });
    console.log(
      JSON.stringify(
        { phase: 'full', ok: full.ok, applied: full.applied, analysisAfter: full.analysisAfter },
        null,
        2
      )
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
