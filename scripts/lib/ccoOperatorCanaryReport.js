'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { buildCanaryStatusPayload, loadState } = require('../../src/ops/ccoOperatorCanary');
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

  payload.recommendedNextWork = buildRecommendedNextWork(payload);

  return payload;
}

function buildRecommendedNextWork(payload) {
  const steps = [];
  if (payload.photo.writeEnabled && !payload.photo.limitReached) {
    steps.push(`Photo Review canary: ${payload.photo.decisionsRemaining} beslut kvar`);
  }
  if (payload.import.writeEnabled && !payload.import.limitReached) {
    steps.push(
      `Import Review canary: ${payload.import.decisionsRemaining} beslut kvar (stark match)`
    );
  }
  if (payload.mail.writeEnabled && !payload.mail.limitReached) {
    steps.push(`Mail Review canary: ${payload.mail.decisionsRemaining} beslut kvar`);
  }
  if (!steps.length) {
    steps.push('Canary-gränser nådda eller write AV — kör readiness och presentation-gate');
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
};
