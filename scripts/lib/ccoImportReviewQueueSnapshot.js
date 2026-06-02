'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadReference(root) {
  const refPath = path.join(root, 'config/cco-import-review-queue-reference.json');
  if (!fs.existsSync(refPath)) return null;
  return JSON.parse(fs.readFileSync(refPath, 'utf8'));
}

function tryLiveQueue(root) {
  const candidates = [
    process.env.ARCANA_CCO_DATA_ROOT,
    path.join(root, 'data'),
    path.join(
      process.env.HOME || '',
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    ),
  ].filter(Boolean);

  for (const base of candidates) {
    const p = path.join(base, 'cco-import-review-queue.json');
    if (!fs.existsSync(p)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      const items = Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.queue)
          ? raw.queue
          : [];
      const bySource = {};
      for (const row of items) {
        const src = String(row.source || row.importSource || 'unknown').toLowerCase();
        bySource[src] = (bySource[src] || 0) + 1;
      }
      return {
        source: 'live_queue_file',
        path: p,
        total: items.length || raw.total || null,
        bySource,
        status: raw.status || 'WAITING_MANUAL_REVIEW',
      };
    } catch {
      /* next */
    }
  }
  return null;
}

function collectImportReviewQueueStatus({ root }) {
  const ref = loadReference(root) || {};
  const live = tryLiveQueue(root);
  const sources = (ref.sources || []).map((s) => ({
    id: s.id,
    label: s.label,
    queueCount: live?.bySource?.[s.id] ?? s.queueCount,
    note: s.note || null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    total: live?.total ?? ref.total ?? 1497,
    status: live?.status || ref.status || 'WAITING_MANUAL_REVIEW',
    rule: ref.rule || 'Ingen auto-import · ingen ny kund vid osäker match',
    policy: ref.policy || 'Safe-match klar — ny riskimport kräver explicit GO',
    sources,
    dataSource: live ? 'live_queue_file' : 'reference_snapshot',
    liveQueuePath: live?.path || null,
    operatorNote: 'Read-only kö — ingen auto-import · ingen ny kund',
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
