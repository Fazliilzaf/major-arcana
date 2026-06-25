#!/usr/bin/env node
'use strict';

/**
 * Spår A–D — aggregerad status (counts only, ingen patientdata).
 * stdout: JSON · optional --write → public/cco-migration-tracks-status.json
 *
 * Semantik: inget spår är "levererat" förrän cutover-kriteriet är uppfyllt.
 * Kö-volym (860 foto / 1497 import) = backlog, inte IN_PROGRESS.
 */

require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public/cco-migration-tracks-status.json');

delete require.cache[require.resolve('../src/config.js')];
const { config } = require('../src/config.js');
const { collectImportReviewQueueStatus } = require('./lib/ccoImportReviewQueueSnapshot');

function parseArgs(argv) {
  return { write: argv.includes('--write') };
}

function runJson(cmd) {
  try {
    return JSON.parse(
      execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    );
  } catch {
    return null;
  }
}

function readJson(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function countCustomerMigrationStats(tenantId = 'hair_tp') {
  const customers = readJson('data/cco-customers.json');
  const dir = customers?.tenants?.[tenantId]?.customerState?.directory || {};
  let withDrive = 0;
  let withMeridiqPatientId = 0;
  let eligibleJournal = 0;
  for (const key of Object.keys(dir)) {
    const e = dir[key] || {};
    if (e.driveFolderId) withDrive += 1;
    const mid = e.meridiqMeta?.meridiqPatientId || e.meridiqMeta?.id || null;
    if (mid) withMeridiqPatientId += 1;
    if (e.meridiqMeta?.hasJournal === true) eligibleJournal += 1;
  }
  return {
    totalPatients: Object.keys(dir).length || 7257,
    withDrive,
    withMeridiqPatientId,
    eligibleJournal,
  };
}

function loadMasterCardDriveCoupling() {
  const coupling = readJson('data/cco-master-card-drive-coupling.json');
  if (!coupling) return null;
  const results = coupling.results || {};
  let withPredicted = 0;
  let verified = 0;
  for (const key of Object.keys(results)) {
    const row = results[key] || {};
    if (row.predictedFolderId) withPredicted += 1;
    if (row.status === 'verified') verified += 1;
  }
  return {
    totalPatients: coupling.totalPatients || Object.keys(results).length,
    withPredicted,
    verified,
    stats: coupling.stats || null,
    generatedAt: coupling.generatedAt || null,
  };
}

function countMeridiqJournalImports() {
  const journal = readJson('data/cco-journal.json');
  const entries = journal?.entries || journal?.items || [];
  const list = Array.isArray(entries) ? entries : Object.values(entries);
  let meridiqHistorical = 0;
  for (const e of list) {
    if (e?.sourceSystem === 'meridiq' || e?.importSource === 'meridiq') meridiqHistorical += 1;
  }
  return meridiqHistorical;
}

function loadCanaryTrack(trackId) {
  try {
    const { loadState, getTrackSummary } = require('../src/ops/ccoOperatorCanary');
    const { state } = loadState(ROOT);
    const max =
      trackId === 'photo'
        ? config.photoReviewCanaryMax
        : trackId === 'import'
          ? config.importReviewCanaryMax
          : 25;
    return getTrackSummary(state, trackId, max);
  } catch {
    return null;
  }
}

function parseBackfillDryRun() {
  try {
    const out = execSync('node scripts/backfill-master-card-drive-coupling.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const pick = (re) => {
      const m = out.match(re);
      return m ? Number(m[1]) : null;
    };
    return {
      totalPatients: pick(/totalPatients\s+:\s+(\d+)/),
      predicted: pick(/predicted\s+:\s+(\d+)/),
      none: pick(/none\s+:\s+(\d+)/),
      predictedPct: pick(/predicted-pct\s+:\s+([\d.]+)/),
      mode: 'dry_run_proxy',
    };
  } catch {
    return null;
  }
}

function parseMeridiqDryRun() {
  try {
    const out = execSync(
      'node scripts/import-meridiq-historical-journals.js --dry-run --limit=50',
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );
    const pick = (re) => {
      const m = out.match(re);
      return m ? Number(m[1]) : null;
    };
    const authMissing = /auth:\s*MISSING/i.test(out);
    return {
      eligible: pick(/eligible \(hasJournal\): (\d+)/),
      withMeridiqPatientId: pick(/with meridiqPatientId: (\d+)/),
      entriesPlanned: pick(/entries planned: (\d+)/),
      authMissing,
      mode: 'dry_run',
    };
  } catch {
    return null;
  }
}

function meridiqAuthConfigured() {
  return Boolean(
    process.env.ARCANA_MERIDIQ_COOKIE ||
    process.env.ARCANA_MERIDIQ_COOKIE_FILE ||
    process.env.ARCANA_MERIDIQ_API_TOKEN
  );
}

function driveSaConfigured() {
  return Boolean(
    process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON_FILE
  );
}

function trackBlocker({ code, ownerAction, infraNote }) {
  return { code, ownerAction, infraNote: infraNote || null };
}

function buildTrackA({ drive, customerStats, coupling, saOk }) {
  const withDrive = customerStats.withDrive;
  const withPredicted = coupling?.withPredicted ?? drive?.predicted ?? 0;
  const verified = coupling?.verified ?? 0;
  const total = customerStats.totalPatients;
  const predicted = drive?.predicted ?? withPredicted;
  const done = withDrive > 0 && verified > 0 && withDrive >= Math.min(predicted, total);

  let blocker = null;
  if (!done) {
    if (!saOk && verified === 0) {
      blocker = trackBlocker({
        code: 'ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON',
        ownerAction:
          'SA för verify + fil-crawl → scanGoogleDriveApi (proxy-koppling finns redan lokalt)',
        infraNote:
          withPredicted > 0
            ? `${withPredicted}/${total} predicted i cco-master-card-drive-coupling.json · 0 verified · master driveFolderId=${withDrive}`
            : 'Kör backfill-master-card-drive-coupling.js (utan --dry-run)',
      });
    } else if (withPredicted > 0 && withDrive === 0) {
      blocker = trackBlocker({
        code: 'DRIVE_NOT_ON_MASTER_CARD',
        ownerAction:
          'Promote predictedFolderId → driveFolderId på master-kort ELLER kör asset-import med coupling-fil',
        infraNote: `${withPredicted} predicted i coupling-fil · ${withDrive}/${total} driveFolderId på cco-customers`,
      });
    } else if (verified === 0) {
      blocker = trackBlocker({
        code: 'DRIVE_NOT_VERIFIED',
        ownerAction: 'Kör scanGoogleDriveApi → verifiera mappar mot SA',
        infraNote: `predicted ${withPredicted} · verified ${verified}`,
      });
    }
  }

  return {
    id: 'A',
    label: 'Drive',
    title: 'Drive service-account + master folder-ID',
    cutoverDelivered: done,
    infraReady: true,
    status: done ? 'DONE' : 'NOT_DELIVERED',
    metrics: {
      predicted,
      withPredictedCoupling: withPredicted,
      verifiedCoupling: verified,
      totalPatients: total,
      withDriveFolderId: withDrive,
      predictedPct: drive?.predictedPct ?? null,
      couplingGeneratedAt: coupling?.generatedAt ?? null,
    },
    blocker,
    scripts: [
      'node scripts/backfill-master-card-drive-coupling.js',
      'npm run migration:scan-drive-api',
      'node scripts/backfill-drive-file-ids.js --apply',
    ],
    operatorTool: null,
  };
}

function buildTrackB({ meridiq, customerStats, meridiqAuthOk, meridiqImported }) {
  const withId = customerStats.withMeridiqPatientId;
  const done = meridiqImported > 0 && withId > 0;

  let blocker = null;
  if (!done) {
    if (!meridiqAuthOk) {
      blocker = trackBlocker({
        code: 'ARCANA_MERIDIQ_COOKIE',
        ownerAction: 'Owner: cookie/token → npm run migration:preflight-meridiq',
        infraNote: 'API-skript + dry-run finns — auth saknas',
      });
    } else if (withId === 0) {
      blocker = trackBlocker({
        code: 'MERIDIQ_ID_SYNC',
        ownerAction:
          'npm run migration:sync-meridiq-ids:commit → npm run migration:import-meridiq-journals:commit --limit=5',
        infraNote: 'Auth OK men withMeridiqPatientId=0 — sync ej körd',
      });
    } else {
      blocker = trackBlocker({
        code: 'MERIDIQ_IMPORT_NOT_RUN',
        ownerAction: 'Pilot-import ej körd — kör import-meridiq-journals --commit --limit=5',
        infraNote: `${withId} id synkade · 0 historiska poster importerade`,
      });
    }
  }

  return {
    id: 'B',
    label: 'Meridiq',
    title: 'Historisk journal-import',
    cutoverDelivered: done,
    infraReady: true,
    status: done ? 'DONE' : 'NOT_DELIVERED',
    metrics: {
      eligible: meridiq?.eligible ?? customerStats.eligibleJournal ?? 6268,
      withMeridiqPatientId: withId,
      meridiqEntriesImported: meridiqImported,
      entriesPlannedPilot: meridiq?.entriesPlanned ?? null,
    },
    blocker,
    scripts: [
      'npm run migration:preflight-meridiq',
      'npm run migration:sync-meridiq-ids:commit',
      'npm run migration:import-meridiq-journals:commit',
    ],
    operatorTool: null,
  };
}

function buildTrackC({ photo, photoCanary }) {
  const pending = photo?.pendingPhotos ?? null;
  const visible = photo?.photosVisibleCount ?? 0;
  const canaryUsed = photoCanary?.decisionsUsed ?? photo?.canaryDecisionsUsed ?? 0;
  const writeEnabled = photo?.writeEnabled === true;
  const done = pending === 0 && visible > 0;

  let blocker = null;
  if (!done) {
    if (!writeEnabled) {
      blocker = trackBlocker({
        code: 'CANARY_OFF',
        ownerAction:
          photo?.activation ||
          'Deploy ENABLE_CCO_OPERATOR_CANARY + ENABLE_PHOTO_REVIEW_WRITE på Render',
        infraNote: `Operator-UI finns · ${pending ?? '—'} bilder i kö · 0 beslut · write AV`,
      });
    } else if ((pending ?? 0) > 0 && canaryUsed === 0) {
      blocker = trackBlocker({
        code: 'MANUAL_DRIFT_PENDING',
        ownerAction: 'Manuell batch via /photo-review.html (max 25/batch)',
        infraNote: `${pending} pending · canary PÅ men 0 beslut tagna`,
      });
    }
  }

  return {
    id: 'C',
    label: 'Photo Review',
    title: 'Migrerade bilder — manuell granskning',
    cutoverDelivered: done,
    infraReady: true,
    status: done ? 'DONE' : 'NOT_DELIVERED',
    metrics: {
      pendingPhotos: pending,
      patientsWithPending: photo?.patientsWithPendingPhotos ?? null,
      photosVisible: visible,
      canaryUsed,
      canaryMax: photo?.canaryMaxDecisions ?? config.photoReviewCanaryMax,
    },
    writeEnabled,
    readOnly: !writeEnabled,
    blocker,
    scripts: ['npm run photo-review:batch-status', 'npm run verify:photo-review-prod'],
    operatorTool: photo?.operatorToolPath || '/photo-review.html',
    operatorToolAlias: photo?.operatorToolAlias || '/cco-photo-review.html',
  };
}

function buildTrackD({ importReview, importCanary }) {
  const total = importReview?.total ?? null;
  const resolved = (importCanary?.decisionsUsed ?? 0) || (importReview?.resolved ?? 0);
  const writeEnabled = importReview?.writeEnabled === true;
  const done = total === 0;

  let blocker = null;
  if (!done) {
    if (!writeEnabled) {
      blocker = trackBlocker({
        code: 'CANARY_OFF',
        ownerAction: 'Deploy ENABLE_IMPORT_REVIEW_WRITE + ENABLE_CCO_OPERATOR_CANARY på Render',
        infraNote: `Operator-UI finns · ${total ?? '—'} osäkra · ${resolved} resolved · write AV`,
      });
    } else if ((total ?? 0) > 0 && resolved === 0) {
      blocker = trackBlocker({
        code: 'MANUAL_DRIFT_PENDING',
        ownerAction: 'Manuell batch via /cco-import-review.html (max 25/batch, stark match only)',
        infraNote: `${total} i kö · canary PÅ men 0 beslut`,
      });
    }
  }

  return {
    id: 'D',
    label: 'Import review',
    title: 'Osäkra kundmatchningar (halso@ + GetAccept)',
    cutoverDelivered: done,
    infraReady: true,
    status: done ? 'DONE' : 'NOT_DELIVERED',
    metrics: {
      total,
      halsoPending: importReview?.sources?.find((s) => s.id === 'halso')?.queueCount ?? null,
      getacceptPending:
        importReview?.sources?.find((s) => s.id === 'getaccept')?.queueCount ?? null,
      resolved,
      canaryMax: importReview?.canaryMaxDecisions ?? config.importReviewCanaryMax,
    },
    writeEnabled,
    readOnly: !writeEnabled,
    blocker,
    scripts: ['npm run import-review:batch-status', 'npm run verify:import-review-prod'],
    operatorTool: importReview?.operatorToolPath || '/cco-import-review.html',
  };
}

function buildPayload() {
  const generatedAt = new Date().toISOString();
  const drive = parseBackfillDryRun();
  const meridiq = parseMeridiqDryRun();
  const photo = runJson('node scripts/photo-review-batch-status.js');
  const importReview = collectImportReviewQueueStatus({ root: ROOT });
  const customerStats = countCustomerMigrationStats();
  const coupling = loadMasterCardDriveCoupling();
  const meridiqImported = countMeridiqJournalImports();
  const photoCanary = loadCanaryTrack('photo');
  const importCanary = loadCanaryTrack('import');
  const saOk = driveSaConfigured();
  const meridiqAuthOk = meridiqAuthConfigured() && !meridiq?.authMissing;

  const tracks = [
    buildTrackA({ drive, customerStats, coupling, saOk }),
    buildTrackB({ meridiq, customerStats, meridiqAuthOk, meridiqImported }),
    buildTrackC({ photo, photoCanary }),
    buildTrackD({ importReview, importCanary }),
  ];

  const tracksDelivered = tracks.filter((t) => t.cutoverDelivered).length;

  return {
    generatedAt,
    delivery: 'NOT_DELIVERED',
    tracksDelivered,
    tracksTotal: tracks.length,
    overall: tracksDelivered === tracks.length ? 'ALL_DELIVERED' : 'NOT_DELIVERED',
    summary:
      'Inget spår A–D cutover-klart. Underlag: skript + dry-run + operator-UI. Owner-blockers och manuell drift återstår.',
    infraNote: 'Detta är nuläge/underlag — inte leverans. Kö-siffror ≠ pågående cutover.',
    tracks,
    recommendedOrder: ['A', 'B', 'C', 'D'],
  };
}

function main() {
  const args = parseArgs(process.argv);
  const payload = buildPayload();
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (args.write) {
    fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stderr.write(`Wrote ${OUT}\n`);
  }
}

main();

module.exports = { buildPayload };
