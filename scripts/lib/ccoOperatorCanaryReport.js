'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const {
  buildCanaryStatusPayload,
  loadState,
  patientsAffectedFromAudit,
} = require('../../src/ops/ccoOperatorCanary');
const { config } = require('../../src/config');
const { aggregateDecisionStats } = require('../../src/ops/ccoPhotoReviewPilot');

const REPO = path.join(__dirname, '../..');

function probeJson(base, urlPath) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, base);
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          'x-cco-role': 'owner',
          'x-cco-tenant': 'hairtpclinic',
          Accept: 'application/json',
        },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json });
        });
      }
    );
    req.on('error', () => resolve({ status: 0, json: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, json: null });
    });
    req.end();
  });
}

function countDriveLinksInAssets(projectRoot) {
  try {
    const p = path.join(
      process.env.ARCANA_STATE_ROOT || path.join(projectRoot, 'data'),
      'cco-patient-assets.json'
    );
    if (!fs.existsSync(p)) return { driveLinksInUi: 0, visibleWithoutReview: 0 };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const items = Object.values(raw.items || {});
    let driveLinks = 0;
    let visibleWithoutReview = 0;
    for (const a of items) {
      const hay = `${a.originalDrivePath || ''}`.toLowerCase();
      if (hay.includes('drive.google.com') || hay.includes('docs.google.com')) driveLinks += 1;
      if (
        a.status === 'VISIBLE_ON_PATIENT_CARD' &&
        ['photo_before', 'photo_during', 'photo_after'].includes(a.category) &&
        a.namingStatus !== 'manual_resolved' &&
        !a.reviewedAt
      ) {
        visibleWithoutReview += 1;
      }
    }
    return { driveLinksInUi: driveLinks, visibleWithoutReview };
  } catch {
    return { driveLinksInUi: null, visibleWithoutReview: null };
  }
}

async function collectOperatorCanaryReport({
  base = 'https://arcana.hairtpclinic.com',
  projectRoot = REPO,
} = {}) {
  const [photoSum, photoProg, importSum, mailOp] = await Promise.all([
    probeJson(base, '/api/v1/cco/photo-review/summary'),
    probeJson(base, '/api/v1/cco/photo-review/progress'),
    probeJson(base, '/api/v1/ops/cco/import-review/summary'),
    probeJson(base, '/cco-mail-review-operator-status.json'),
  ]);

  const photoProgress = photoProg.json || {};
  const integrity = countDriveLinksInAssets(projectRoot);
  const { state } = loadState(projectRoot);

  const payload = buildCanaryStatusPayload({
    config,
    projectRoot,
    photoProgress: {
      ...photoProgress,
      decisions: photoProgress.decisions || aggregateDecisionStats(null),
    },
    importSummary: importSum.json,
    mailSummary: mailOp.json,
  });

  payload.photo.pendingPhotos = photoSum.json?.pendingPhotos ?? photoProgress.pendingPhotos;
  payload.photo.pilot = photoSum.json?.pilot ?? null;
  payload.photo.approved = state.photo?.approved ?? payload.photo.decisionsFromAudit?.approve ?? 0;
  payload.photo.rejected = state.photo?.rejected ?? payload.photo.decisionsFromAudit?.reject ?? 0;
  payload.photo.reassigned =
    state.photo?.reassigned ?? payload.photo.decisionsFromAudit?.reassign ?? 0;
  payload.photo.manualResolved =
    state.photo?.manualResolved ?? payload.photo.decisionsFromAudit?.manualResolved ?? 0;
  payload.photo.checksumOk = integrity.visibleWithoutReview === 0;
  payload.photo.driveLinksInUi = integrity.driveLinksInUi;
  payload.photo.visibleWithoutReview = integrity.visibleWithoutReview;
  payload.photo.coverageDelta = {
    visiblePhotos: photoSum.json?.photosVisibleCount ?? 0,
    pendingPhotos: photoSum.json?.pendingPhotos ?? 0,
  };
  payload.photo.storageKeyChanged = state.photo?.storageKeyChanged ?? 0;
  payload.photo.wrongPatient = state.photo?.wrongPatient ?? 0;
  payload.photo.patientsAffected = [];
  payload.photo.storageKeyUnchanged = payload.photo.storageKeyChanged === 0;
  payload.photo.checksumMismatch = payload.photo.checksumOk === false;

  payload.import.approved = state.import?.approved ?? 0;
  payload.import.rejected = state.import?.rejected ?? 0;
  payload.import.unresolved = state.import?.unresolved ?? 0;
  payload.import.needsOwnerSource = state.import?.needsOwnerSource ?? 0;
  payload.import.newAssets = state.import?.newAssets ?? 0;
  payload.import.customerIdMismatch = state.import?.customerIdMismatch ?? 0;
  payload.import.sourceBreakdown = importSum.json?.sources ?? [];

  payload.mail.approved = state.mail?.approved ?? 0;
  payload.mail.unresolved = state.mail?.unresolved ?? 0;
  payload.mail.excluded = state.mail?.excluded ?? 0;
  payload.mail.rejected = state.mail?.rejected ?? 0;
  payload.mail.remaining = mailOp.json?.remaining ?? null;
  payload.mail.mailboxBreakdown = mailOp.json?.mailboxCounts ?? null;
  payload.mail.operationalReadinessDelta = {
    remainingBefore: mailOp.json?.remaining ?? null,
    approvedInCanary: state.mail?.approved ?? 0,
    readyForWork: mailOp.json?.coverage?.readyForWork ?? null,
  };

  payload.recommendedNextWork = buildRecommendedNextWork(payload);
  payload.completionReport = formatCompletionReport(payload);

  return payload;
}

function formatCompletionReport(payload) {
  return {
    photo: {
      approved: payload.photo.approved ?? 0,
      rejected: payload.photo.rejected ?? 0,
      reassigned: payload.photo.reassigned ?? 0,
      manualResolved: payload.photo.manualResolved ?? 0,
      pending: payload.photo.pendingPhotos ?? null,
      patientsAffected: payload.photo.patientsAffected ?? [],
      checksumOk: payload.photo.checksumOk,
      storageKeyUnchanged: payload.photo.storageKeyUnchanged,
      driveLinksInUi: payload.photo.driveLinksInUi,
      wrongPatient: payload.photo.wrongPatient ?? 0,
    },
    import: {
      approved: payload.import.approved ?? 0,
      rejected: payload.import.rejected ?? 0,
      unresolved: payload.import.unresolved ?? 0,
      needsOwnerSource: payload.import.needsOwnerSource ?? 0,
      queueTotal: payload.import.queueTotal ?? null,
      newAssets: payload.import.newAssets ?? 0,
      customerIdMismatch: payload.import.customerIdMismatch ?? 0,
      sourceBreakdown: payload.import.sourceBreakdown ?? [],
    },
    mail: {
      approved: payload.mail.approved ?? 0,
      unresolved: payload.mail.unresolved ?? 0,
      excluded: payload.mail.excluded ?? 0,
      rejected: payload.mail.rejected ?? 0,
      remaining: payload.mail.remaining ?? null,
      mailboxBreakdown: payload.mail.mailboxBreakdown ?? null,
      operationalReadinessDelta: payload.mail.operationalReadinessDelta ?? null,
    },
  };
}

function buildRecommendedNextWork(payload) {
  const steps = [];
  const p = payload.photo || {};
  const i = payload.import || {};
  const m = payload.mail || {};

  if (p.writeEnabled && !p.limitReached) {
    steps.push(
      `Photo Review canary: ${p.decisionsRemaining} beslut kvar · pending ${p.pendingPhotos ?? '—'}`
    );
  } else if (p.limitReached) {
    steps.push('Photo canary: gräns 25 nådd — kör operator-canary-report och presentation-gate');
  }

  if (i.writeEnabled && !i.limitReached) {
    steps.push(
      `Import Review canary: ${i.decisionsRemaining} beslut kvar (endast stark match · ingen ny kund)`
    );
  } else if (i.limitReached) {
    steps.push('Import canary: gräns 25 nådd — granska source breakdown');
  }

  if (m.writeEnabled && !m.limitReached) {
    steps.push(
      `Mail Review canary: ${m.decisionsRemaining} beslut kvar · remaining ${m.remaining ?? '—'}`
    );
  } else if (m.limitReached) {
    steps.push('Mail canary: gräns 25 nådd — verifiera mailbox breakdown');
  }

  if (!steps.length) {
    steps.push(
      'Canary write AV på prod — sätt ENABLE_CCO_OPERATOR_CANARY + per-spår write · kör gate'
    );
  }
  if (
    (p.storageKeyChanged ?? 0) > 0 ||
    (p.wrongPatient ?? 0) > 0 ||
    (i.customerIdMismatch ?? 0) > 0
  ) {
    steps.unshift('STOP: säkerhetsavvikelse i canary — pausa write och eskalera till Fazli');
  }
  return steps;
}

function publishOperatorCanaryStatus(payload, root = REPO) {
  const publicPath = path.join(root, 'public/cco-operator-canary-status.json');
  const reportPath = path.join(root, 'data/reports/cco-operator-canary-status.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  collectOperatorCanaryReport,
  publishOperatorCanaryStatus,
  buildRecommendedNextWork,
  formatCompletionReport,
};
