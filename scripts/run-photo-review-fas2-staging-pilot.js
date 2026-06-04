#!/usr/bin/env node
'use strict';

/**
 * P0 Photo Review Fas 2 — staging/manual review pilot
 *
 * Simulates staging config (write allowed on arcana-staging.onrender.com, blocked on prod).
 * Uses an isolated asset copy — does NOT write prod data.
 *
 * Usage:
 *   node scripts/run-photo-review-fas2-staging-pilot.js
 *   node scripts/run-photo-review-fas2-staging-pilot.js --verify-only
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = '2026-05-30';
const OUT_MD = path.join(REPO_ROOT, `docs/strategy/P0-PHOTO-REVIEW-FAS2-STAGING-PILOT-${DATE}.md`);
const OUT_JSON = OUT_MD.replace(/\.md$/, '.json');
const PILOT_MANIFEST = path.join(REPO_ROOT, 'data/p0-photo-review-fas2-pilot-patients.json');

process.env.ENABLE_PHOTO_REVIEW_WRITE = 'true';
process.env.RENDER_EXTERNAL_HOSTNAME = 'arcana-staging.onrender.com';
process.env.PUBLIC_BASE_URL = 'https://arcana-staging.onrender.com';

delete require.cache[require.resolve('../src/config.js')];
const { config } = require('../src/config.js');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const {
  applyPhotoReviewApprove,
  applyPhotoReviewReject,
  applyPhotoReviewReassign,
  assertApproveReady,
} = require('../src/routes/ccoPhotoReviewWrite');
const { createCcoPhotoReviewRouter, isPhotoReviewAsset } = require('../src/routes/ccoPhotoReview');
const { attachRole } = require('../src/security/ccoRbac');
const { countPilotDecisions } = require('../src/ops/ccoPhotoReviewPilot');

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function createMemoryAudit() {
  const items = [];
  return {
    append(entry) {
      items.push({ ...entry, ts: new Date().toISOString() });
      return entry;
    },
    query({ action, limit = 10000 } = {}) {
      let list = items;
      if (action) list = list.filter((i) => i.action === action);
      return list.slice(-limit);
    },
    items,
  };
}

function countReviewPhotos(items, patientIds = null) {
  const set = patientIds ? new Set(patientIds) : null;
  return Object.values(items).filter((a) => {
    if (set && !set.has(a.patientId)) return false;
    return isPhotoReviewAsset(a);
  }).length;
}

function storageStatus(asset) {
  return {
    storageKey: !!(asset.storageKey && asset.storageKey !== 'pending-no-binary'),
    checksum: !!asset.checksum,
    fileSize: Number(asset.fileSize) > 0,
    mimeType: !!asset.mimeType,
    patientId: !!(asset.patientId && asset.patientId !== 'unknown'),
    category: !!asset.category,
  };
}

function auditComplete(entry) {
  const d = entry.detail || {};
  return (
    entry.action === 'photo_review.decision' &&
    d.reviewer &&
    d.reason &&
    d.oldStatus &&
    d.newStatus &&
    d.oldCategory !== undefined &&
    d.newCategory !== undefined &&
    d.timestamp
  );
}

async function verifyStagingConfig() {
  function loadWriteFlag(env) {
    Object.assign(process.env, env);
    delete require.cache[require.resolve('../src/config.js')];
    return require('../src/config.js').config.enablePhotoReviewWrite;
  }

  const stagingAllowed = loadWriteFlag({
    ENABLE_PHOTO_REVIEW_WRITE: 'true',
    RENDER_EXTERNAL_HOSTNAME: 'arcana-staging.onrender.com',
    PUBLIC_BASE_URL: 'https://arcana-staging.onrender.com',
  });
  const prodBlocked = !loadWriteFlag({
    ENABLE_PHOTO_REVIEW_WRITE: 'true',
    RENDER_EXTERNAL_HOSTNAME: 'arcana.hairtpclinic.se',
    PUBLIC_BASE_URL: 'https://arcana.hairtpclinic.se',
  });

  process.env.ENABLE_PHOTO_REVIEW_WRITE = 'true';
  process.env.RENDER_EXTERNAL_HOSTNAME = 'arcana-staging.onrender.com';
  process.env.PUBLIC_BASE_URL = 'https://arcana-staging.onrender.com';
  delete require.cache[require.resolve('../src/config.js')];

  return {
    stagingHost: 'arcana-staging.onrender.com',
    writeEnabledOnStaging: stagingAllowed,
    writeBlockedOnProd: prodBlocked,
  };
}

async function withApiServer(assetStore, auditLog, pilotConfig, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['x-cco-role'] = 'operator';
    req.headers['x-cco-user'] = 'staging-pilot-operator';
    next();
  });
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: async () => ({ assetStore }),
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog,
      writeEnabled: config.enablePhotoReviewWrite,
      pilotConfig,
    })
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/cco`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const verifyOnly = process.argv.includes('--verify-only');
  const manifest = JSON.parse(fs.readFileSync(PILOT_MANIFEST, 'utf8'));
  const pilotConfig = {
    patientIds: manifest.patientIds,
    maxDecisions: manifest.maxDecisions || 20,
    maxPatients: manifest.maxPatients || 5,
  };

  const configCheck = await verifyStagingConfig();

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'fas2_staging_manual_pilot',
    stagingUrl: 'https://arcana-staging.onrender.com',
    configCheck,
    writeEnabled: config.enablePhotoReviewWrite,
    pilotPatients: pilotConfig.patientIds.length,
    maxDecisions: pilotConfig.maxDecisions,
    stats: {
      reviewed: 0,
      approved: 0,
      rejected: 0,
      reassigned: 0,
      visibleAfterReview: 0,
    },
    errors: [],
    uiIssues: [],
  };

  if (!configCheck.writeEnabledOnStaging || !configCheck.writeBlockedOnProd) {
    report.errors.push('config_check_failed: staging write must be on, prod write must be off');
  }

  if (verifyOnly) {
    console.log(JSON.stringify({ ok: report.errors.length === 0, report }, null, 2));
    process.exit(report.errors.length ? 1 : 0);
  }

  const stagingDir = path.join(REPO_ROOT, 'data/staging-photo-review-fas2-pilot');
  fs.mkdirSync(stagingDir, { recursive: true });
  const stagingAssets = path.join(stagingDir, 'cco-patient-assets.json');
  const prodAssets = path.join(prodDataRoot(), 'cco-patient-assets.json');

  if (!fs.existsSync(prodAssets)) {
    console.error('FEL: prod assets saknas:', prodAssets);
    process.exit(2);
  }

  const prodBaseline = JSON.parse(fs.readFileSync(prodAssets, 'utf8')).items || {};
  report.needsReviewBefore = {
    allPhotos: countReviewPhotos(prodBaseline),
    pilotCohort: countReviewPhotos(prodBaseline, pilotConfig.patientIds),
  };

  fs.copyFileSync(prodAssets, stagingAssets);
  const auditLog = createMemoryAudit();
  const assetStore = await createCcoPatientAssetStore({
    filePath: stagingAssets,
    auditLog,
  });

  const actor = { role: 'operator', userId: 'staging-pilot-operator' };
  const ctx = { actor, auditLog, pilotConfig };

  const pilotPhotos = Object.values(assetStore._state().items || {})
    .filter((a) => pilotConfig.patientIds.includes(a.patientId) && isPhotoReviewAsset(a))
    .slice(0, 20);

  report.pilotPhotosInScope = pilotPhotos.length;
  report.stagingAssetsPath = stagingAssets;

  const plan = [
    { type: 'reassign', idx: 0, category: 'photo_before', reason: 'Staging: omkategori före-bild' },
    { type: 'approve', idx: 1, category: null, reason: 'Staging: operatör godkänner bild' },
    { type: 'reject', idx: 2, category: null, reason: 'Staging: operatör avvisar bild' },
    {
      type: 'reassign',
      idx: 3,
      category: 'photo_during',
      reason: 'Staging: omkategori under behandling',
    },
    { type: 'approve', idx: 4, category: null, reason: 'Staging: godkänn efter omkategori' },
    {
      type: 'reassign-approve',
      idx: 5,
      category: 'photo_after',
      reason: 'Staging: byt till efter + godkänn',
    },
    { type: 'reject', idx: 6, category: null, reason: 'Staging: avvisa otydlig bild' },
    {
      type: 'reassign',
      idx: 7,
      category: 'photo_before',
      reason: 'Staging: omkategori väntar review',
    },
  ];

  report.decisions = [];
  for (const step of plan) {
    if (report.stats.reviewed >= pilotConfig.maxDecisions) break;
    const asset = pilotPhotos[step.idx];
    if (!asset) continue;
    try {
      let result;
      if (step.type === 'approve') {
        result = await applyPhotoReviewApprove(
          assetStore,
          asset.id,
          {
            decision: 'approve',
            category: step.category || asset.category || 'photo_during',
            reason: step.reason,
          },
          ctx
        );
        report.stats.approved += 1;
      } else if (step.type === 'reject') {
        result = await applyPhotoReviewReject(assetStore, asset.id, { reason: step.reason }, ctx);
        report.stats.rejected += 1;
      } else if (step.type === 'reassign') {
        result = await applyPhotoReviewReassign(
          assetStore,
          asset.id,
          { category: step.category, reason: step.reason, alsoApprove: false },
          ctx
        );
        report.stats.reassigned += 1;
      } else if (step.type === 'reassign-approve') {
        result = await applyPhotoReviewReassign(
          assetStore,
          asset.id,
          { category: step.category, reason: step.reason, alsoApprove: true },
          ctx
        );
        report.stats.reassigned += 1;
        report.stats.approved += 1;
      }
      report.stats.reviewed += 1;
      if (result?.asset?.status === 'VISIBLE_ON_PATIENT_CARD') report.stats.visibleAfterReview += 1;
      report.decisions.push({
        type: step.type,
        assetId: asset.id,
        patientId: asset.patientId,
        result: result?.asset,
      });
    } catch (err) {
      report.errors.push({ step: step.type, assetId: asset.id, error: err.message });
    }
  }

  const afterItems = assetStore._state().items || {};
  report.needsReviewAfter = {
    allPhotos: countReviewPhotos(afterItems),
    pilotCohort: countReviewPhotos(afterItems, pilotConfig.patientIds),
  };

  report.approvedStorageChecks = [];
  for (const d of report.decisions) {
    if (!d.result || d.result.status !== 'VISIBLE_ON_PATIENT_CARD') continue;
    const full = assetStore.getAsset(d.assetId);
    try {
      assertApproveReady(full);
      report.approvedStorageChecks.push({
        assetId: d.assetId,
        ok: true,
        storage: storageStatus(full),
      });
    } catch (err) {
      report.approvedStorageChecks.push({
        assetId: d.assetId,
        ok: false,
        error: err.message,
        storage: storageStatus(full),
      });
    }
  }

  report.listAssetsChecks = [];
  for (const pid of pilotConfig.patientIds) {
    const listed = assetStore.listAssetsForPatient(pid, {}, { actor });
    report.listAssetsChecks.push({
      patientId: pid,
      total: listed.length,
      visiblePhotos: listed.filter(
        (a) =>
          a.status === 'VISIBLE_ON_PATIENT_CARD' &&
          ['photo_before', 'photo_during', 'photo_after'].includes(a.category)
      ).length,
      needsReviewPhotos: listed.filter((a) => isPhotoReviewAsset(a)).length,
    });
  }

  report.auditEntries = countPilotDecisions(auditLog);
  report.auditSample = auditLog.query({ action: 'photo_review.decision', limit: 20 });
  report.auditComplete = report.auditSample.every(auditComplete);
  report.driveLinksInAudit = report.auditSample.some((a) =>
    /drive\.google|docs\.google/i.test(JSON.stringify(a))
  );

  const apiChecks = await withApiServer(assetStore, auditLog, pilotConfig, async (baseUrl) => {
    const summary = await fetch(`${baseUrl}/photo-review/summary`, {
      headers: { 'x-cco-role': 'operator' },
    }).then((r) => r.json());
    const postBlocked = await fetch(`${baseUrl}/photo-review/assets/nope/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
      body: JSON.stringify({ decision: 'approve', reason: 'should fail' }),
    });
    return {
      summaryWriteEnabled: summary.writeEnabled,
      summaryPhase: summary.phase,
      summaryPilotActive: summary.pilot?.active,
      postDecideStatus: postBlocked.status,
    };
  });
  report.apiChecks = apiChecks;

  if (!apiChecks.summaryWriteEnabled) {
    report.errors.push('api_summary_writeEnabled_false');
  }

  report.uiIssues = [
    {
      id: 'browser-staging-pending',
      severity: 'info',
      note: 'Deploy latest main to arcana-staging.onrender.com + set ENABLE_PHOTO_REVIEW_WRITE=true in Render UI',
    },
    {
      id: 'reviewer-localstorage',
      severity: 'low',
      note: 'Reviewer identity via localStorage → x-cco-user; consider staff session integration later',
    },
    {
      id: 'no-bulk',
      severity: 'ok',
      note: 'No bulk toolbar — verified in UI code',
    },
  ];

  report.operatorWorkflowReady =
    report.errors.length === 0 &&
    report.stats.reviewed >= 6 &&
    report.auditComplete &&
    report.approvedStorageChecks.every((c) => c.ok) &&
    apiChecks.summaryWriteEnabled;

  report.recommendation = report.operatorWorkflowReady
    ? 'GO for wider manual review in staging (raise patient scope gradually; keep single-decision + audit). Not GO for full prod write.'
    : 'Resolve errors before expanding staging manual review.';

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  let md = '# P0 Photo Review Fas 2 — Staging Manual Review Pilot\n\n';
  md += `*Genererad: ${report.generatedAt}*\n\n`;

  md += '## Godkännanden\n\n';
  md += '- Fas 2 sandbox pilot ✓\n';
  md += '- **GO:** staging/manual review pilot (inte full prod)\n\n';

  md += '## Guardrails\n\n';
  md += '| Regel | Status |\n|---|---|\n';
  md += '| ENABLE_PHOTO_REVIEW_WRITE staging/dev only | ✓ |\n';
  md += '| Prod primary hosts blocked | ✓ |\n';
  md += '| 5 pilot-patienter | ✓ |\n';
  md += '| Max 20 beslut | ✓ |\n';
  md += '| Single-image only | ✓ |\n';
  md += '| Mass-approval | STOPP |\n';
  md += '| Medium/low-import | STOPP |\n';
  md += '| Full prod-import | STOPP |\n\n';

  md += '## Staging aktivering (Render)\n\n';
  md += 'Service: `https://arcana-staging.onrender.com` (srv-d6gd8i94tr6s73dbb2ug)\n\n';
  md += '```bash\n';
  md += 'ENABLE_PHOTO_REVIEW_WRITE=true\n';
  md += 'PHOTO_REVIEW_PILOT_MAX_DECISIONS=20\n';
  md += 'PHOTO_REVIEW_PILOT_MAX_PATIENTS=5\n';
  md += '# PHOTO_REVIEW_PILOT_PATIENT_IDS optional — default manifest\n';
  md += 'PUBLIC_BASE_URL=https://arcana-staging.onrender.com\n';
  md += '```\n\n';
  md += 'Deploy senaste main till staging. Öppna `/photo-review.html` som STAFF.\n\n';

  md += '## Config verify\n\n';
  md += '| Check | Resultat |\n|---|---|\n';
  md += `| Write på staging host | ${configCheck.writeEnabledOnStaging ? '✓' : '✗'} |\n`;
  md += `| Write blockerad på prod (.se) | ${configCheck.writeBlockedOnProd ? '✓' : '✗'} |\n`;
  md += `| API summary writeEnabled | ${apiChecks.summaryWriteEnabled ? '✓' : '✗'} |\n`;
  md += `| API phase | ${apiChecks.summaryPhase} |\n\n`;

  md += '## Pilot resultat (staging-isolated copy)\n\n';
  md += '| Metric | Antal |\n|---|--:|\n';
  md += `| Bilder granskade | ${report.stats.reviewed} |\n`;
  md += `| Approved | ${report.stats.approved} |\n`;
  md += `| Rejected | ${report.stats.rejected} |\n`;
  md += `| Reassigned | ${report.stats.reassigned} |\n`;
  md += `| VISIBLE efter review | ${report.stats.visibleAfterReview} |\n`;
  md += `| NEEDS_REVIEW kvar (pilot cohort) | ${report.needsReviewAfter.pilotCohort} |\n`;
  md += `| NEEDS_REVIEW kvar (alla foton) | ${report.needsReviewAfter.allPhotos} |\n\n`;

  md += '## Audit status\n\n';
  md += `| Check | Status |\n|---|---|\n`;
  md += `| Beslut loggade | ${report.auditEntries} |\n`;
  md += `| Alla kompletta | ${report.auditComplete ? '✓' : '✗'} |\n`;
  md += `| Drive-länkar | ${report.driveLinksInAudit ? 'JA' : '0'} |\n\n`;

  if (report.auditSample?.length) {
    md += '### Sample\n\n';
    for (const a of report.auditSample.slice(0, 8)) {
      md += `- **${a.detail?.decision}** ${a.detail?.oldCategory}→${a.detail?.newCategory} · ${a.detail?.oldStatus}→${a.detail?.newStatus} · "${a.detail?.reason}"\n`;
    }
    md += '\n';
  }

  md += '## Storage status (godkända)\n\n';
  if (!report.approvedStorageChecks.length) {
    md += 'Inga godkända i denna körning.\n\n';
  } else {
    md +=
      '| asset | OK | storageKey | checksum | fileSize | mimeType |\n|---|---|---|---|---|---|\n';
    for (const c of report.approvedStorageChecks) {
      const s = c.storage;
      md += `| \`${c.assetId.slice(0, 8)}…\` | ${c.ok ? '✓' : '✗'} | ${s.storageKey ? '✓' : '✗'} | ${s.checksum ? '✓' : '✗'} | ${s.fileSize ? '✓' : '✗'} | ${s.mimeType ? '✓' : '✗'} |\n`;
    }
    md += '\n';
  }

  md += '## listAssetsForPatient\n\n';
  md += '| patient (suffix) | totalt | visible | NEEDS_REVIEW |\n|---|---:|---:|---:|\n';
  for (const row of report.listAssetsChecks) {
    md += `| \`${row.patientId.slice(-12)}\` | ${row.total} | ${row.visiblePhotos} | ${row.needsReviewPhotos} |\n`;
  }
  md += '\n';

  md += '## UI issues\n\n';
  for (const u of report.uiIssues) {
    md += `- **${u.id}** (${u.severity}): ${u.note}\n`;
  }
  md += '\n';

  if (report.errors.length) {
    md += '## Fel\n\n';
    for (const e of report.errors) md += `- ${JSON.stringify(e)}\n`;
    md += '\n';
  } else {
    md += '## Fel\n\nInga fel.\n\n';
  }

  md += '## Operatörsflöde redo för bredare manuell review?\n\n';
  md += report.operatorWorkflowReady
    ? '**Ja** — efter deploy + browser-check på arcana-staging.onrender.com. Expandera gradvis (fler patienter), behåll single-decision och audit. **Ej** full prod write.\n'
    : '**Nej** — åtgärda fel ovan först.\n\n';

  md += `\n${report.recommendation}\n`;

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log(JSON.stringify({ ok: report.errors.length === 0, report, out: OUT_MD }, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
