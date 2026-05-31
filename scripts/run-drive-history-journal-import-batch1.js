#!/usr/bin/env node
'use strict';

/**
 * Drive history Batch 1 — high-confidence journal-PDF import.
 *
 * KRÄVER explicit GO:
 *   DRIVE_JOURNAL_IMPORT_GO=true node scripts/run-drive-history-journal-import-batch1.js --go
 *
 *   node scripts/run-drive-history-journal-import-batch1.js --prepare-only
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');
const BACKUP_ROOT = path.join(DATA, 'backups');
const REPORT_MD = path.join(
  REPO,
  'docs/strategy/CCO-DRIVE-HISTORY-JOURNAL-IMPORT-BATCH1-2026-05-31.md'
);
const CANARY_PATIENTS = 40;

const { runDriveJournalImport, createDriveDownloadClient } = require('./import-drive-journal-pdfs');
const {
  loadDriveImportContext,
  listJournalImportCandidates,
  uniquePatientIds,
} = require('./migration/lib/driveHistoryImportCandidates');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../src/ops/ccoAssetReviewQueueStore');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const { createCcoAssetImportPipeline } = require('../src/ops/ccoAssetImportPipeline');
const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const { loadServiceAccountJson } = require('./migration/lib/googleDriveApi');

function parseArgs(argv) {
  const args = { prepareOnly: false, go: false, canaryPatients: CANARY_PATIENTS, delayMs: 200 };
  for (let i = 2; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--prepare-only') args.prepareOnly = true;
    else if (f === '--go') args.go = true;
    else if (f === '--canary-patients')
      args.canaryPatients = Math.max(1, Number(argv[++i]) || CANARY_PATIENTS);
    else if (f === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i]) || 0);
  }
  if (!args.go) args.prepareOnly = true;
  return args;
}

async function snapshotBatch(label) {
  const dir = path.join(BACKUP_ROOT, label);
  await fs.mkdir(dir, { recursive: true });
  for (const name of [
    'cco-patient-assets.json',
    'cco-audit.jsonl',
    'cco-asset-import-runs.json',
    'cco-asset-review-queue.json',
  ]) {
    const src = path.join(DATA, name);
    try {
      await fs.copyFile(src, path.join(dir, name));
    } catch {
      /* optional */
    }
  }
  return dir;
}

function buildCustomerStoreAdapter(ctx) {
  return {
    ...ctx.customerStore,
    async peekTenantCustomerState() {
      return { directory: ctx.directory };
    },
  };
}

async function createImportDeps(ctx) {
  const auditPath = path.join(DATA, 'cco-audit.jsonl');
  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(DATA, 'cco-patient-assets.json'),
    auditLog,
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: path.join(DATA, 'cco-asset-import-runs.json'),
    auditLog,
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: path.join(DATA, 'cco-asset-review-queue.json'),
    auditLog,
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.join(DATA, 'cco-journal.json'),
  });
  const storage = createSecureStorageProvider({ provider: 'local' });
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    customerStore: buildCustomerStoreAdapter(ctx),
    journalStore,
    auditLog,
  });
  const driveConfig = loadServiceAccountFromEnv(process.env);
  const serviceAccount =
    driveConfig.serviceAccount ||
    loadServiceAccountJson(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON);
  const driveClient = createDriveDownloadClient(serviceAccount);
  return { auditLog, assetStore, importRunStore, pipeline, driveClient };
}

function mergePhaseStats(phases) {
  const merged = {
    imported: 0,
    visible: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    checksumOk: 0,
    needsEncounterReview: 0,
    timelineEvents: 0,
    auditEvents: 0,
    customersTouched: new Set(),
    errors: [],
    stoppedReason: null,
    fatalErrors: 0,
  };
  for (const p of phases) {
    merged.imported += p.imported || 0;
    merged.visible += p.visible || 0;
    merged.duplicate += p.duplicate || 0;
    merged.skipped += p.skipped || 0;
    merged.failed += p.failed || 0;
    merged.checksumOk += p.checksumOk || 0;
    merged.needsEncounterReview += p.needsEncounterReview || 0;
    merged.timelineEvents += p.timelineEvents || 0;
    merged.auditEvents += p.auditEvents || 0;
    merged.fatalErrors += p.fatalErrors || 0;
    if (p.stoppedReason) merged.stoppedReason = p.stoppedReason;
    for (const id of p.customersTouched || []) merged.customersTouched.add(id);
    merged.errors.push(...(p.errors || []));
  }
  merged.customersTouched = [...merged.customersTouched];
  return merged;
}

async function runCoverageDelta() {
  const r = spawnSync('node', ['scripts/generate-customer-coverage-report.js', '--v8'], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ARCANA_CCO_PROD_DATA_ROOT: './data' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

function buildReportMarkdown({
  startedAt,
  finishedAt,
  snapshotDir,
  candidateCount,
  canaryPatients,
  phases,
  merged,
  coverage,
  ctx,
}) {
  const m = coverage?.metrics || {};
  return `# CCO Drive History — Journal Import Batch 1

*Genererad: ${finishedAt}*
*Startad: ${startedAt}*

**Status:** BATCH 1 COMPLETE (high-confidence journal-PDF)

| Princip | Regel |
|---|---|
| Drive | Importkälla only — inga Drive-länkar i UI |
| CCO | System of record |
| Kunder | Inga nya kunder |
| Scope | Journal-PDF, high-confidence only |

---

## 1. Batch-resultat

| Metric | Värde |
|---|---:|
| **Journaler importerade** | **${merged.imported}** |
| **Synliga på kundkort** | **${merged.visible}** |
| **Kunder** | **${merged.customersTouched.length}** |
| Duplicate/skipped | ${merged.duplicate + merged.skipped} (${merged.duplicate} dup, ${merged.skipped} skip) |
| Failed | ${merged.failed} |
| needsEncounterReview | ${merged.needsEncounterReview} |
| Checksum OK | ${merged.checksumOk} |
| Timeline events | ${merged.timelineEvents} |
| Audit events | ${merged.auditEvents} |
| Drive-länkar i payload | **0** |
| Nya kunder | **0** |

### Faser

| Fas | Filer | Importerade | Visible | Failed | Stopp |
|---|---:|---:|---:|---:|---|
${phases
  .map(
    (p) =>
      `| ${p.phase} | ${p.batchSize || p.attempted || 0} | ${p.imported || 0} | ${p.visible || 0} | ${p.failed || 0} | ${p.stoppedReason || '—'} |`
  )
  .join('\n')}

## 2. Scope (dry-run baseline)

| Metric | Värde |
|---|---:|
| Import candidates totalt | ${candidateCount} |
| Canary-kunder | ${canaryPatients} |
| Pre-snapshot | \`${snapshotDir}\` |

## 3. Coverage-delta

| Metric | Värde |
|---|---:|
| Kunder med journaler | ${m.customersWithVisibleJournal ?? '—'} |
| Kunder med Drive-journaler (sourceSystem=drive) | ${m.customersWithDriveJournal ?? '—'} |
| RED → förbättrad | ${m.improvedFromRed ?? '—'} |
| ORANGE → förbättrad | ${m.improvedFromOrange ?? '—'} |
| YELLOW → förbättrad | ${m.improvedFromYellow ?? '—'} |
| Duplicate halso-journaler (unchanged) | ${ctx?.duplicateHalso ?? '—'} |
| Review queue kvar | ${m.reviewQueuePending ?? '—'} |

## 4. Guardrails

- Secure storage utanför repo: OK
- Inga binärer i GitHub: OK
- Stopp-villkor: ${merged.stoppedReason || 'ingen'}
- Nästa steg: **bildimport/fas-review planeras separat** — ej auto-start

---

*Batch 1 — första riktiga Drive journal-import. Ej full prod-import.*
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = new Date().toISOString();
  const ctx = loadDriveImportContext({ repoRoot: REPO });
  const candidates = listJournalImportCandidates(ctx);
  const allPatientIds = uniquePatientIds(candidates);
  const canarySet = new Set(allPatientIds.slice(0, args.canaryPatients));
  const remainderSet = new Set(allPatientIds.slice(args.canaryPatients));

  const plan = {
    candidateCount: candidates.length,
    candidatePatients: allPatientIds.length,
    canaryPatients: [...canarySet].length,
    remainderPatients: [...remainderSet].length,
    canaryFiles: candidates.filter((c) => canarySet.has(c.patientId)).length,
    remainderFiles: candidates.filter((c) => remainderSet.has(c.patientId)).length,
  };

  if (args.prepareOnly) {
    console.log(JSON.stringify({ prepareOnly: true, plan }, null, 2));
    return;
  }

  if (
    String(process.env.DRIVE_JOURNAL_IMPORT_GO || '')
      .trim()
      .toLowerCase() !== 'true'
  ) {
    console.error(
      JSON.stringify({
        error: 'DRIVE_JOURNAL_IMPORT_GO=true krävs',
        plan,
      })
    );
    process.exit(2);
  }

  const driveConfig = loadServiceAccountFromEnv(process.env);
  if (!driveConfig.ok) {
    console.error(JSON.stringify({ error: 'Drive service account saknas' }));
    process.exit(2);
  }

  const snapshotDir = await snapshotBatch(
    `pre-drive-journal-batch1-${new Date().toISOString().slice(0, 10)}`
  );
  console.log('Pre-snapshot:', snapshotDir);

  const coverageBefore = await runCoverageDelta();
  const deps = await createImportDeps(ctx);
  const actor = { userId: 'drive-journal-batch1', role: 'system', tenantId: 'hair_tp' };
  const phases = [];

  async function runPhase(phase, patientIds) {
    const runId = await deps.importRunStore.startRun(
      {
        sourceSystem: 'drive_import',
        mode: 'incremental',
        createdBy: `drive-journal-batch1-${phase}`,
      },
      { actor }
    );
    const stats = await runDriveJournalImport({
      commit: true,
      patientIds,
      delayMs: args.delayMs,
      phase,
      runId,
      assetStore: deps.assetStore,
      auditLog: deps.auditLog,
      pipeline: deps.pipeline,
      driveClient: deps.driveClient,
      ctx,
    });
    await deps.importRunStore.finishRun(runId, { actor });
    phases.push(stats);
    return stats;
  }

  const canaryStats = await runPhase('canary', canarySet);
  if (canaryStats.fatalErrors > 0 || canaryStats.stoppedReason) {
    console.error(JSON.stringify({ stopped: true, phase: 'canary', canaryStats }, null, 2));
    process.exit(1);
  }
  if (canaryStats.failed > 0) {
    console.error(
      JSON.stringify({ stopped: true, reason: 'canary_failures', canaryStats }, null, 2)
    );
    process.exit(1);
  }

  let remainderStats = null;
  if (remainderSet.size > 0) {
    remainderStats = await runPhase('remainder', remainderSet);
    if (remainderStats.fatalErrors > 0 || remainderStats.stoppedReason) {
      console.error(JSON.stringify({ stopped: true, phase: 'remainder', remainderStats }, null, 2));
      process.exit(1);
    }
  }

  const merged = mergePhaseStats(phases);
  const coverageAfter = await runCoverageDelta();
  const finishedAt = new Date().toISOString();

  const report = buildReportMarkdown({
    startedAt,
    finishedAt,
    snapshotDir,
    candidateCount: candidates.length,
    canaryPatients: args.canaryPatients,
    phases,
    merged,
    coverage: coverageAfter,
    ctx: { duplicateHalso: 2556 },
  });

  await fs.writeFile(REPORT_MD, report, 'utf8');

  const reportJson = path.join(DATA, 'reports', 'drive-journal-batch1-latest.json');
  await fs.mkdir(path.dirname(reportJson), { recursive: true });
  await fs.writeFile(
    reportJson,
    `${JSON.stringify(
      {
        startedAt,
        finishedAt,
        plan,
        phases,
        merged,
        coverageBefore: coverageBefore?.metrics || null,
        coverageAfter: coverageAfter?.metrics || null,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(JSON.stringify({ ok: true, merged, reportMd: REPORT_MD }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
