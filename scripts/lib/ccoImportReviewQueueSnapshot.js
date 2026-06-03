'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadSummary } = require('../../src/ops/ccoImportReviewReadService');

function loadReference(root) {
  const refPath = path.join(root, 'config/cco-import-review-queue-reference.json');
  if (!fs.existsSync(refPath)) return null;
  return JSON.parse(fs.readFileSync(refPath, 'utf8'));
}

function collectImportReviewQueueStatus({ root }) {
  const ref = loadReference(root) || {};
  let live = null;
  try {
    live = loadSummary(path.join(root, 'data'), root);
  } catch {
    live = null;
  }

  if (live && !live.referenceFallback && live.sources?.length) {
    return {
      generatedAt: live.generatedAt,
      total: live.total,
      status: live.status,
      statusLabel: live.statusLabel,
      rule: live.rule,
      policy: live.policy,
      sources: live.sources.map((s) => ({
        id: s.id,
        label: s.label,
        queueCount: s.queueCount,
        status: s.status,
        note: s.note || null,
      })),
      dataSource: live.dataSource,
      liveQueuePath: live.liveQueuePath,
      operatorNote: live.operatorNote || 'Read-only kö — ingen auto-import · ingen ny kund',
      operatorToolPath: '/cco-import-review.html',
      writeEnabled: false,
      operatorScope: true,
      driveOrphanNote: live.driveOrphanNote,
    };
  }

  const sources = (ref.sources || []).map((s) => ({
    id: s.id,
    label: s.label,
    queueCount: s.queueCount,
    note: s.note || null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    total: ref.total ?? 1497,
    status: ref.status || 'WAITING_MANUAL_REVIEW',
    statusLabel: 'Manuell review krävs',
    rule: ref.rule || 'Ingen auto-import · ingen ny kund vid osäker match',
    policy: ref.policy || 'Safe-match klar — ny riskimport kräver explicit GO',
    sources,
    dataSource: 'reference_snapshot',
    liveQueuePath: null,
    operatorNote: 'Read-only kö — ingen auto-import · ingen ny kund',
    operatorToolPath: '/cco-import-review.html',
    writeEnabled: false,
    operatorScope: true,
  };
}

function publishImportReviewQueueStatus(payload, root) {
  const publicPath = path.join(root, 'public/cco-import-review-queue-status.json');
  const reportPath = path.join(root, 'data/reports/cco-import-review-queue-status.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  collectImportReviewQueueStatus,
  publishImportReviewQueueStatus,
};
