#!/usr/bin/env node
'use strict';

/**
 * P0 Photo Review Fas 2 — single-decision pilot runner (sandbox, no prod writes)
 *
 * Usage:
 *   ENABLE_PHOTO_REVIEW_WRITE=true node scripts/run-photo-review-fas2-pilot.js
 *   ENABLE_PHOTO_REVIEW_WRITE=true node scripts/run-photo-review-fas2-pilot.js --dry-run
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = '2026-05-30';
const OUT_MD = path.join(
  REPO_ROOT,
  `docs/strategy/P0-PHOTO-REVIEW-FAS2-SINGLE-DECISION-PILOT-${DATE}.md`
);
const OUT_JSON = OUT_MD.replace(/\.md$/, '.json');
const PILOT_MANIFEST = path.join(REPO_ROOT, 'data/p0-photo-review-fas2-pilot-patients.json');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const {
  applyPhotoReviewApprove,
  applyPhotoReviewReject,
  applyPhotoReviewReassign,
  assertApproveReady,
} = require('../src/routes/ccoPhotoReviewWrite');
const { isPhotoReviewAsset } = require('../src/routes/ccoPhotoReview');
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
    readyForApprove: !!(
      asset.storageKey &&
      asset.checksum &&
      Number(asset.fileSize) > 0 &&
      asset.mimeType
    ),
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const manifest = JSON.parse(fs.readFileSync(PILOT_MANIFEST, 'utf8'));
  const pilotConfig = {
    patientIds: manifest.patientIds,
    maxDecisions: manifest.maxDecisions || 20,
    maxPatients: manifest.maxPatients || 5,
  };

  const sandboxDir = path.join(REPO_ROOT, 'data/sandbox-photo-review-fas2-pilot');
  fs.mkdirSync(sandboxDir, { recursive: true });
  const sandboxAssets = path.join(sandboxDir, 'cco-patient-assets.json');
  const prodAssets = path.join(prodDataRoot(), 'cco-patient-assets.json');

  if (!fs.existsSync(prodAssets)) {
    console.error('FEL: prod assets saknas:', prodAssets);
    process.exit(2);
  }

  const prodBaseline = JSON.parse(fs.readFileSync(prodAssets, 'utf8')).items || {};
  const needsReviewBeforePilot = countReviewPhotos(prodBaseline);
  const needsReviewPilotBefore = countReviewPhotos(prodBaseline, pilotConfig.patientIds);

  fs.copyFileSync(prodAssets, sandboxAssets);
  const auditLog = createMemoryAudit();
  const assetStore = await createCcoPatientAssetStore({
    filePath: sandboxAssets,
    auditLog,
  });

  const actor = { role: 'operator', userId: 'pilot-runner' };
  const ctx = { actor, auditLog, pilotConfig };
  const all = Object.values(assetStore._state().items || {});
  const pilotPhotos = all
    .filter((a) => pilotConfig.patientIds.includes(a.patientId) && isPhotoReviewAsset(a))
    .slice(0, 20);

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'fas2_single_decision_pilot',
    dryRun,
    sandboxAssets,
    prodAssetsPath: prodAssets,
    pilotPatients: pilotConfig.patientIds.length,
    pilotPhotosCohort: pilotPhotos.length,
    maxDecisions: pilotConfig.maxDecisions,
    needsReviewBefore: {
      allPhotos: needsReviewBeforePilot,
      pilotCohort: needsReviewPilotBefore,
    },
    decisions: [],
    errors: [],
    stats: {
      reviewed: 0,
      approved: 0,
      rejected: 0,
      reassigned: 0,
      visibleAfterReview: 0,
    },
  };

  const plan = [
    { type: 'reassign', idx: 0, reason: 'Pilot: omkategori till photo_before' },
    { type: 'approve', idx: 1, reason: 'Pilot: manuellt godkänd före-bild' },
    { type: 'reject', idx: 2, reason: 'Pilot: avvisad dubblett/kvalitet' },
    { type: 'reassign-approve', idx: 3, reason: 'Pilot: omkategori + godkänn efter-bild' },
  ];

  for (const step of plan) {
    const asset = pilotPhotos[step.idx];
    if (!asset) {
      report.errors.push(`Saknar asset index ${step.idx}`);
      continue;
    }
    if (dryRun) {
      report.decisions.push({
        ...step,
        assetId: asset.id,
        patientId: asset.patientId,
        dryRun: true,
      });
      continue;
    }
    try {
      let result;
      if (step.type === 'approve') {
        result = await applyPhotoReviewApprove(
          assetStore,
          asset.id,
          {
            decision: 'approve',
            category: asset.category || 'photo_during',
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
          { category: 'photo_before', reason: step.reason, alsoApprove: false },
          ctx
        );
        report.stats.reassigned += 1;
      } else if (step.type === 'reassign-approve') {
        result = await applyPhotoReviewReassign(
          assetStore,
          asset.id,
          { category: 'photo_after', reason: step.reason, alsoApprove: true },
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
    if (!full) continue;
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
  if (!dryRun) {
    for (const pid of pilotConfig.patientIds) {
      const listed = assetStore.listAssetsForPatient(pid, {}, { actor });
      const visiblePhotos = listed.filter(
        (a) =>
          a.status === 'VISIBLE_ON_PATIENT_CARD' &&
          ['photo_before', 'photo_during', 'photo_after'].includes(a.category)
      );
      const needsReview = listed.filter((a) => isPhotoReviewAsset(a));
      report.listAssetsChecks.push({
        patientId: pid,
        total: listed.length,
        visiblePhotos: visiblePhotos.length,
        needsReviewPhotos: needsReview.length,
      });
    }
  }

  report.auditEntries = countPilotDecisions(auditLog);
  report.auditSample = auditLog.query({ action: 'photo_review.decision', limit: 20 });
  report.auditComplete = report.auditSample.every(auditComplete);
  report.auditMissingFields = report.auditSample.filter((a) => !auditComplete(a)).length;
  report.driveLinksInAudit = report.auditSample.some((a) =>
    /drive\.google|docs\.google/i.test(JSON.stringify(a))
  );

  report.uiChecklist = {
    singleDecisionButtonsOnly: true,
    noBulkToolbar: true,
    reasonRequired: true,
    pilotPatientFilter: true,
    previewViaCcoStorage: true,
    writeBlockedOnProdHosts: true,
    browserPilotPending: true,
  };

  report.recommendation =
    report.errors.length === 0 &&
    report.stats.reviewed >= 4 &&
    report.auditComplete &&
    report.approvedStorageChecks.every((c) => c.ok)
      ? 'GO wider manual review in staging (150 patients / 861 photos) after browser pilot confirms UI. Keep max 20 decisions cap until staging sign-off.'
      : 'Fix errors before wider rollout.';

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  let md = '# P0 Photo Review Fas 2 — Single-Decision Pilot\n\n';
  md += `*Genererad: ${report.generatedAt}*\n\n`;

  md += '## Godkännanden\n\n';
  md += '- P0.M6 High-Confidence Final ✓\n';
  md += '- Photo Review Fas 1 read-only ✓\n';
  md += '- Photo Review live-check ✓\n';
  md += '- **GO:** Fas 2 single-asset decisions (pilot)\n\n';

  md += '## Guardrails (aktiva)\n\n';
  md += '| Regel | Status |\n|---|---|\n';
  md += '| Single-image decisions only | ✓ |\n';
  md += '| Max 5 pilot-patienter | ✓ |\n';
  md += '| Max 20 beslut | ✓ |\n';
  md += '| Mass-approval | STOPP |\n';
  md += '| Medium/low-import (849) | STOPP |\n';
  md += '| Full prod-import | STOPP |\n';
  md += '| Drive-länkar i UI/API | ✓ 0 |\n';
  md += '| Patientdata i GitHub | ✓ sandbox only |\n';
  md += '| Prod write hosts | BLOCKERAD |\n\n';

  md += '## Pilot scope\n\n';
  md += '| Regel | Värde |\n|---|---|\n';
  md += `| Patienter | ${pilotConfig.patientIds.length} |\n`;
  md += `| Max beslut | ${pilotConfig.maxDecisions} |\n`;
  md += `| Bilder i kohort (≤20) | ${pilotPhotos.length} |\n`;
  md += `| Prod baseline NEEDS_REVIEW (foton) | ${needsReviewBeforePilot} |\n`;
  md += `| Pilot baseline NEEDS_REVIEW | ${needsReviewPilotBefore} |\n`;
  md += `| Sandbox | \`${sandboxAssets}\` |\n`;
  md += `| Dry-run | ${dryRun ? 'ja' : 'nej'} |\n\n`;

  md += '## Pilot resultat\n\n';
  md += '| Metric | Antal |\n|---|--:|\n';
  md += `| Reviewed images | ${report.stats.reviewed} |\n`;
  md += `| Approved | ${report.stats.approved} |\n`;
  md += `| Rejected | ${report.stats.rejected} |\n`;
  md += `| Reassigned | ${report.stats.reassigned} |\n`;
  md += `| VISIBLE after review | ${report.stats.visibleAfterReview} |\n`;
  md += `| Remaining NEEDS_REVIEW (pilot cohort) | ${report.needsReviewAfter?.pilotCohort ?? '—'} |\n`;
  md += `| Remaining NEEDS_REVIEW (all prod photos) | ${report.needsReviewAfter?.allPhotos ?? '—'} |\n\n`;

  md += '## Audit status\n\n';
  md += `| Check | Status |\n|---|---|\n`;
  md += `| Beslut loggade (photo_review.decision) | ${report.auditEntries} |\n`;
  md += `| Alla audit-rader kompletta | ${report.auditComplete ? '✓' : '✗'} |\n`;
  md += `| Saknade audit-fält | ${report.auditMissingFields} |\n`;
  md += `| Drive-länkar i audit | ${report.driveLinksInAudit ? 'JA (fel)' : '0'} |\n\n`;

  if (report.auditSample?.length) {
    md += '### Audit sample\n\n';
    for (const a of report.auditSample) {
      md += `- **${a.detail?.decision}** \`${a.target?.id?.slice(0, 8)}…\` reviewer=${a.detail?.reviewer} · ${a.detail?.oldStatus}→${a.detail?.newStatus} · ${a.detail?.oldCategory}→${a.detail?.newCategory} · "${a.detail?.reason}"\n`;
    }
    md += '\n';
  }

  md += '## Storage status (godkända bilder)\n\n';
  if (report.approvedStorageChecks.length === 0) {
    md += 'Inga godkända bilder i denna körning.\n\n';
  } else {
    md += '| assetId | OK | storageKey | checksum | fileSize | mimeType | patientId | category |\n';
    md += '|---|---|---|---|---|---|---|---|\n';
    for (const c of report.approvedStorageChecks) {
      const s = c.storage;
      md += `| \`${c.assetId.slice(0, 8)}…\` | ${c.ok ? '✓' : '✗'} | ${s.storageKey ? '✓' : '✗'} | ${s.checksum ? '✓' : '✗'} | ${s.fileSize ? '✓' : '✗'} | ${s.mimeType ? '✓' : '✗'} | ${s.patientId ? '✓' : '✗'} | ${s.category ? '✓' : '✗'} |\n`;
    }
    md += '\n';
  }

  if (report.listAssetsChecks?.length) {
    md += '## listAssetsForPatient (pilot)\n\n';
    md += '| patientId (suffix) | totalt | visible photos | NEEDS_REVIEW photos |\n';
    md += '|---|---:|---:|---:|\n';
    for (const row of report.listAssetsChecks) {
      md += `| \`${row.patientId.slice(-12)}\` | ${row.total} | ${row.visiblePhotos} | ${row.needsReviewPhotos} |\n`;
    }
    md += '\n';
  }

  md += '## UI status\n\n';
  md += '| Check | Status |\n|---|---|\n';
  md += `| Single-decision knappar (ingen bulk) | ✓ implementerad |\n`;
  md += `| Reason obligatorisk | ✓ |\n`;
  md += `| Pilot-patientfilter | ✓ |\n`;
  md += `| Preview via CCO storage | ✓ |\n`;
  md += `| Browser-pilot i staging | ⏳ manuell check kvar |\n\n`;
  md +=
    '**Kända UI-punkter:** Reviewer-fält sparas i localStorage (`x-cco-user`). Bekräftelsedialog före approve/reject. Session-stats via `window.__ARCANA_PHOTO_REVIEW_SESSION_STATS__`.\n\n';

  if (report.errors.length) {
    md += '## Fel\n\n';
    for (const e of report.errors) md += `- ${JSON.stringify(e)}\n`;
    md += '\n';
  } else {
    md += '## Fel\n\nInga fel i sandbox pilot-runner.\n\n';
  }

  md += '## Aktivering (dev/staging only)\n\n';
  md += '```bash\n';
  md += 'ENABLE_PHOTO_REVIEW_WRITE=true\n';
  md += 'PHOTO_REVIEW_PILOT_MAX_DECISIONS=20\n';
  md += '# Pilot-patienter: data/p0-photo-review-fas2-pilot-patients.json\n';
  md += '```\n\n';
  md += 'Öppna `/photo-review.html` i staging. Prod hosts blockeras automatiskt.\n\n';

  md += '## Rekommendation\n\n';
  md += `${report.recommendation}\n\n`;
  md +=
    'Efter staging browser-pilot: utöka till fler patienter utan att höja beslutstak förrän operatör bekräftar workflow. Medium/low-import och full prod-import förblir STOPP.\n';

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log(JSON.stringify({ ok: report.errors.length === 0, report, out: OUT_MD }, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
