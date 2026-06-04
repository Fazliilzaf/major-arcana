#!/usr/bin/env node
'use strict';

/**
 * Drive full customer-history import — fasor 1–4.
 *
 *   DRIVE_FULL_IMPORT_GO=true node scripts/run-drive-history-import-full.js --go
 *   node scripts/run-drive-history-import-full.js --resume-plan
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');
const BACKUP = path.join(DATA, 'backups');
const REPORT_MD = path.join(REPO, 'docs/strategy/CCO-DRIVE-HISTORY-IMPORT-FULL-2026-05-31.md');
const RESUME_PLAN_JSON = path.join(DATA, 'reports/drive-import-resume-plan.json');

const {
  loadDriveImportContext,
  listFullImportCandidates,
  listCustomerReviewCandidates,
  uniquePatientIds,
} = require('./migration/lib/driveHistoryImportCandidates');
const {
  runDriveFullImport,
  createDriveDownloadClient,
  emptyStats,
} = require('./import-drive-history-full');
const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const { loadServiceAccountJson } = require('./migration/lib/googleDriveApi');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoImportReviewQueueStore } = require('../src/ops/ccoImportReviewQueueStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');

const CANARY_PATIENTS = 5;
const IMAGE_CANARY_LIMIT = 100;
const MAX_FAILURE_RATE = 0.01;
const PHASES = ['documents', 'images', 'customer_review'];

function parseArgs(argv) {
  const args = {
    prepareOnly: false,
    resumePlan: false,
    go: false,
    canaryPatients: CANARY_PATIENTS,
    canaryLimit: 0,
    delayMs: 50,
    phase: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--prepare-only') args.prepareOnly = true;
    else if (f === '--resume-plan') args.resumePlan = true;
    else if (f === '--go') args.go = true;
    else if (f === '--canary-patients')
      args.canaryPatients = Math.max(0, Number(argv[++i]) || CANARY_PATIENTS);
    else if (f === '--canary-limit') args.canaryLimit = Math.max(0, Number(argv[++i]) || 0);
    else if (f === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (f === '--phase') args.phase = argv[++i];
  }
  if (!args.go) args.prepareOnly = true;
  return args;
}

async function snapshot(label) {
  const dir = path.join(BACKUP, label);
  await fs.mkdir(dir, { recursive: true });
  for (const name of [
    'cco-patient-assets.json',
    'cco-audit.jsonl',
    'cco-import-review-queue.json',
  ]) {
    try {
      await fs.copyFile(path.join(DATA, name), path.join(dir, name));
    } catch {
      /* optional */
    }
  }
  return dir;
}

function mergeStats(phases) {
  const m = emptyStats('merged', { dryRun: false, phase: 'all', scanned: 0 });
  for (const p of phases) {
    for (const k of Object.keys(m)) {
      if (typeof m[k] === 'number' && typeof p[k] === 'number') m[k] += p[k];
    }
    m.customersTouched = [
      ...new Set([...(m.customersTouched || []), ...(p.customersTouched || [])]),
    ];
    m.errors = [...(m.errors || []), ...(p.errors || [])];
    if (p.stoppedReason) m.stoppedReason = p.stoppedReason;
  }
  return m;
}

async function collectCumulativeTotals() {
  const raw = JSON.parse(await fs.readFile(path.join(DATA, 'cco-patient-assets.json'), 'utf8'));
  const items = Object.values(raw.items || {});
  const di = items.filter((a) => a.sourceSystem === 'drive_import');
  const journals = di.filter((a) => a.category === 'journal' || a.isJournalRelevant);
  const docs = di.filter((a) => !/^image\//.test(a.mimeType || ''));
  const imgs = di.filter((a) => /^image\//.test(a.mimeType || ''));
  const queue = JSON.parse(
    await fs.readFile(path.join(DATA, 'cco-import-review-queue.json'), 'utf8')
  );
  const rq = Object.values(queue.items || {}).filter(
    (i) => i.sourceSystem === 'drive_import' && i.status === 'pending'
  );
  const batch1RunIds = new Set([
    '2481b270-7668-47b8-a87b-e4c85448fe7c',
    'e9a2fb11-2db7-4b98-8b2a-2e4192c1e46b',
  ]);
  const batch1 = di.filter((a) => batch1RunIds.has(a.importRunId));
  const driveLink = di.some((a) => /drive\.google\.com|webViewLink/i.test(JSON.stringify(a)));
  return {
    driveImportTotal: di.length,
    batch1Journals: batch1.filter((a) => a.category === 'journal').length,
    batch1Customers: new Set(batch1.map((a) => a.patientId)).size,
    journalsTotal: journals.length,
    documentsTotal: docs.length,
    imagesTotal: imgs.length,
    imagesNeedsPhotoReview: imgs.filter((a) => a.technicalInfo?.needsPhotoReview).length,
    imagesVisible: imgs.filter((a) => a.status === 'VISIBLE').length,
    needsClassification: di.filter((a) => a.technicalInfo?.needsClassification).length,
    needsEncounterReview: di.filter((a) => a.technicalInfo?.needsEncounterReview).length,
    reviewQueuePending: rq.length,
    driveCustomers: new Set(di.map((a) => a.patientId)).size,
    checksumMissing: di.filter((a) => !a.checksum).length,
    storageKeyMissing: di.filter((a) => !a.storageKey).length,
    driveLinksInAssets: driveLink,
  };
}

async function writeResumePlan() {
  const ctx = loadDriveImportContext({ repoRoot: REPO, dataDir: DATA });
  const cumulative = await collectCumulativeTotals();
  const remaining = {
    documents: listFullImportCandidates(ctx, { phase: 'documents' }).length,
    images: listFullImportCandidates(ctx, { phase: 'images' }).length,
    customerReview: listCustomerReviewCandidates(ctx).length,
  };
  const plan = {
    generatedAt: new Date().toISOString(),
    checkpoint: {
      importedImages: cumulative.imagesTotal,
      importedDocuments: cumulative.documentsTotal,
      importedJournals: cumulative.journalsTotal,
      driveImportTotal: cumulative.driveImportTotal,
    },
    remaining,
    dedupe: 'ccoIndex driveFileId + sourceRecordId — redan importerade hoppas över automatiskt',
    canary: { images: IMAGE_CANARY_LIMIT, maxFailureRate: MAX_FAILURE_RATE },
    stopConditions: [
      'checksum_mismatch',
      'storage_put_failed',
      'missing_patient_id',
      'drive_link_blocker',
      'repo_storage_path',
      'audit_failed',
      'failure_rate_exceeded',
      'visible_before_photo_review',
      'new_customer_created',
    ],
    cumulative,
  };
  await fs.mkdir(path.dirname(RESUME_PLAN_JSON), { recursive: true });
  await fs.writeFile(RESUME_PLAN_JSON, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  return plan;
}

function canaryFailed(stats, phase) {
  if (stats.fatalErrors > 0 || stats.stoppedReason) return true;
  if (phase === 'customer_review') return false;
  if (stats.failed > 0) return true;
  const attempted = stats.attempted || stats.batchSize || 0;
  if (attempted >= 20 && stats.failed / attempted > MAX_FAILURE_RATE) return true;
  return false;
}

async function runPhaseWithCanary({ phase, deps, canaryPatients, canaryLimit, delayMs }) {
  const ctx = loadDriveImportContext({ repoRoot: REPO, dataDir: DATA });
  const all =
    phase === 'customer_review'
      ? listCustomerReviewCandidates(ctx)
      : listFullImportCandidates(ctx, { phase });
  const actor = { userId: 'drive-full-import', role: 'system', tenantId: 'hair_tp' };

  const effectiveCanaryLimit =
    canaryLimit > 0 ? canaryLimit : phase === 'images' ? IMAGE_CANARY_LIMIT : 0;
  const effectiveCanaryPatients =
    effectiveCanaryLimit > 0 ? 0 : phase === 'customer_review' ? 0 : canaryPatients;

  const canaryStats = await runDriveFullImport({
    commit: true,
    phase,
    patientIds: null,
    canaryPatients: effectiveCanaryPatients,
    canaryLimit: effectiveCanaryLimit,
    limit: phase === 'customer_review' ? Math.min(20, all.length) : 0,
    delayMs,
    maxFailureRate: MAX_FAILURE_RATE,
    runId: `drive-full-${phase}-canary`,
    ctx,
    assetStore: deps.assetStore,
    auditLog: deps.auditLog,
    reviewStore: deps.reviewStore,
    driveClient: deps.driveClient,
    actor,
  });
  canaryStats.subPhase = 'canary';

  if (canaryFailed(canaryStats, phase)) return [canaryStats];

  const remainderStats = await runDriveFullImport({
    commit: true,
    phase,
    delayMs,
    maxFailureRate: MAX_FAILURE_RATE,
    runId: `drive-full-${phase}-remainder`,
    assetStore: deps.assetStore,
    auditLog: deps.auditLog,
    reviewStore: deps.reviewStore,
    driveClient: deps.driveClient,
    actor,
  });
  remainderStats.subPhase = 'remainder';
  return [canaryStats, remainderStats];
}

function buildReport({
  startedAt,
  finishedAt,
  snapshots,
  phaseResults,
  plan,
  cumulative,
  remaining,
}) {
  const runStats = mergeStats(phaseResults.flat());
  return `# CCO Drive History — Full Customer Import

*Genererad: ${finishedAt}*
*Startad: ${startedAt}*

**Status:** ${remaining.images + remaining.documents > 0 ? 'IMPORT PÅGÅR / PARTIELLT KLAR' : 'FULL IMPORT COMPLETE'}

| Princip | Regel |
|---|---|
| CCO | System of record |
| Drive | Importkälla only |
| Säker kundmatch | Importeras |
| Osäker kundmatch | Review queue, ingen ny kund |

---

## Kumulativt i CCO (drive_import)

| Metric | Värde |
|---|---:|
| **Batch 1 journaler** | **${cumulative.batch1Journals}** (${cumulative.batch1Customers} kunder) |
| **Journaler totalt** | **${cumulative.journalsTotal}** |
| **Dokument totalt** | **${cumulative.documentsTotal}** |
| **Bilder totalt** | **${cumulative.imagesTotal}** |
| **drive_import assets** | **${cumulative.driveImportTotal}** |
| Kunder med Drive-data | **${cumulative.driveCustomers}** |
| needsClassification | ${cumulative.needsClassification} |
| needsPhotoReview (bilder) | ${cumulative.imagesNeedsPhotoReview} |
| needsEncounterReview | ${cumulative.needsEncounterReview} |
| Bilder VISIBLE (ska vara 0) | **${cumulative.imagesVisible}** |
| Review queue pending | ${cumulative.reviewQueuePending} |
| Checksum saknas | ${cumulative.checksumMissing} |
| StorageKey saknas | ${cumulative.storageKeyMissing} |
| Drive-länkar i assets | **${cumulative.driveLinksInAssets ? 'FEL' : '0'}** |
| Nya kunder | **0** |

## Kvar att importera

| Fas | Kandidater kvar |
|---|---:|
| Dokument | ${remaining.documents} |
| Bilder | ${remaining.images} |
| Osäker kundmatch (review) | ${remaining.customerReview} |

## Senaste körning

| Metric | Värde |
|---|---:|
| Importerade (denna körning) | ${runStats.imported} |
| Duplicate/skipped | ${runStats.duplicate + runStats.skipped} |
| Failed | ${runStats.failed} |
| Checksum OK (körning) | ${runStats.checksumOk} |
| Stopp | ${runStats.stoppedReason || 'ingen'} |

## Faser (senaste körning)

| Fas | Scannade | Importerade | Failed | Snapshot |
|---|---:|---:|---:|---|
${PHASES.map((ph) => {
  const rows = phaseResults.filter((r) => r.phase === ph);
  const imp = rows.reduce((s, r) => s + (r.imported || 0), 0);
  const fail = rows.reduce((s, r) => s + (r.failed || 0), 0);
  const scanned = rows[0]?.scanned ?? plan[ph === 'customer_review' ? 'customerReview' : ph] ?? 0;
  return `| ${ph} | ${scanned} | ${imp} | ${fail} | \`${snapshots[ph] || '—'}\` |`;
}).join('\n')}

## Guardrails

- Secure storage: OK (utanför repo)
- Resume-plan: \`${RESUME_PLAN_JSON}\`

---

*Review = osäker metadata/synlighet, inte "ska det in". Bildsynlighet styrs av Photo Review.*
`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.resumePlan) {
    const plan = await writeResumePlan();
    console.log(JSON.stringify({ resumePlan: RESUME_PLAN_JSON, plan }, null, 2));
    return;
  }

  const ctx = loadDriveImportContext({ repoRoot: REPO, dataDir: DATA });
  const plan = {
    documents: listFullImportCandidates(ctx, { phase: 'documents' }).length,
    images: listFullImportCandidates(ctx, { phase: 'images' }).length,
    customerReview: listCustomerReviewCandidates(ctx).length,
  };

  if (args.prepareOnly) {
    const cumulative = await collectCumulativeTotals();
    console.log(JSON.stringify({ prepareOnly: true, plan, cumulative }, null, 2));
    return;
  }

  if (
    String(process.env.DRIVE_FULL_IMPORT_GO || '')
      .trim()
      .toLowerCase() !== 'true'
  ) {
    console.error(JSON.stringify({ error: 'DRIVE_FULL_IMPORT_GO=true krävs', plan }));
    process.exit(2);
  }

  await writeResumePlan();

  const driveConfig = loadServiceAccountFromEnv(process.env);
  if (!driveConfig.ok) {
    console.error(JSON.stringify({ error: 'Drive SA saknas' }));
    process.exit(2);
  }
  const serviceAccount =
    driveConfig.serviceAccount ||
    loadServiceAccountJson(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON);
  const driveClient = createDriveDownloadClient(serviceAccount);

  const auditLog = createCcoAuditLog({ filePath: path.join(DATA, 'cco-audit.jsonl') });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(DATA, 'cco-patient-assets.json'),
    auditLog,
  });
  const reviewStore = await createCcoImportReviewQueueStore({
    filePath: path.join(DATA, 'cco-import-review-queue.json'),
    auditLog,
  });
  const deps = { assetStore, auditLog, reviewStore, driveClient };

  const startedAt = new Date().toISOString();
  const snapshots = {};
  const phaseResults = [];
  const phasesToRun = args.phase ? [args.phase] : PHASES;

  for (const phase of phasesToRun) {
    snapshots[phase] = await snapshot(`pre-drive-full-${phase}-${startedAt.slice(0, 10)}`);
    const results = await runPhaseWithCanary({
      phase,
      deps,
      canaryPatients: args.canaryPatients,
      canaryLimit: args.canaryLimit || (phase === 'images' ? IMAGE_CANARY_LIMIT : 0),
      delayMs: args.delayMs,
    });
    phaseResults.push(...results);
    if (results.some((r) => r.fatalErrors > 0 || r.stoppedReason)) break;
  }

  const cumulative = await collectCumulativeTotals();
  const remaining = {
    documents: listFullImportCandidates(loadDriveImportContext({ repoRoot: REPO, dataDir: DATA }), {
      phase: 'documents',
    }).length,
    images: listFullImportCandidates(loadDriveImportContext({ repoRoot: REPO, dataDir: DATA }), {
      phase: 'images',
    }).length,
    customerReview: listCustomerReviewCandidates(
      loadDriveImportContext({ repoRoot: REPO, dataDir: DATA })
    ).length,
  };

  const finishedAt = new Date().toISOString();
  const report = buildReport({
    startedAt,
    finishedAt,
    snapshots,
    phaseResults,
    plan,
    cumulative,
    remaining,
  });
  await fs.writeFile(REPORT_MD, report, 'utf8');
  await writeResumePlan();
  console.log(
    JSON.stringify(
      { ok: true, plan, cumulative, remaining, phaseResults, reportMd: REPORT_MD },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
