'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

function probeJson(base, urlPath, role = 'owner') {
  return new Promise((resolve) => {
    const url = new URL(urlPath, base);
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { 'x-cco-role': role, 'x-cco-tenant': 'hairtpclinic', Accept: 'application/json' },
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

async function collectPhotoReviewOperatorStatus({ base, role = 'owner' }) {
  const [summary, progress] = await Promise.all([
    probeJson(base, '/api/v1/cco/photo-review/summary', role),
    probeJson(base, '/api/v1/cco/photo-review/progress', role),
  ]);

  const s = summary.json || {};
  const p = progress.json || {};
  const pending = Number(s.pendingPhotos ?? s.pendingPhotosAll ?? 0);
  const writeEnabled = s.writeEnabled === true;

  let overall = 'PASS';
  if (summary.status !== 200) overall = 'FAIL';
  if (pending === 0 && summary.status === 200) overall = 'EMPTY';

  return {
    generatedAt: new Date().toISOString(),
    base,
    overall,
    operatorMode: 'READY',
    operatorToolPath: '/photo-review.html',
    writeEnabled,
    readOnly: !writeEnabled,
    phase: s.phase || (writeEnabled ? 'fas2' : 'fas1_readonly'),
    pendingPhotos: pending,
    pendingPhotosAll: s.pendingPhotosAll ?? pending,
    patientsWithPendingPhotos: s.patientsWithPendingPhotos ?? null,
    photosVisibleCount: s.photosVisibleCount ?? 0,
    decisionsTotal: p.decisions?.total ?? 0,
    decisionsApprove: p.decisions?.approve ?? 0,
    decisionsReject: p.decisions?.reject ?? 0,
    decisionsReassign: p.decisions?.reassign ?? 0,
    autoApprove: false,
    massApproval: false,
    day1ClinicalUse: false,
    apiSummaryStatus: summary.status,
    apiProgressStatus: progress.status,
    nextAction: writeEnabled
      ? 'En bild i taget — reviewer + reason + stage + bodyArea krävs'
      : 'Read-only beta — navigera kö, exportera session, write AV på prod',
  };
}

function publishPhotoReviewOperatorStatus(payload, root) {
  const publicPath = path.join(root, 'public/cco-photo-review-operator-status.json');
  const reportPath = path.join(root, 'data/reports/cco-photo-review-operator-status.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  collectPhotoReviewOperatorStatus,
  publishPhotoReviewOperatorStatus,
};
