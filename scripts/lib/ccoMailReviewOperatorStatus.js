'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { normalizeMailProgress } = require('./ccoMailReadinessSnapshot');

function probeJson(base, urlPath, token) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, base);
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = https.request(url, { method: 'GET', headers, timeout: 15000 }, (res) => {
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
    });
    req.on('error', () => resolve({ status: 0, json: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, json: null });
    });
    req.end();
  });
}

async function collectMailReviewOperatorStatus({ base, root, token = null }) {
  const pageProbe = await new Promise((resolve) => {
    const url = new URL('/ambiguous-mail-enrichment-review.html', base);
    const req = https.request(url, { method: 'GET', timeout: 12000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', () => resolve(0));
    req.end();
  });

  let progress = normalizeMailProgress(
    {
      ambiguousTotal: 493,
      pending: 493,
      approved: 0,
      excluded: 0,
      unresolved: 0,
      remaining: 493,
      mailboxCounts: {},
      source: 'reference_fallback',
    },
    { root }
  );

  let apiStatus = 0;
  if (token) {
    const summary = await probeJson(
      base,
      '/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review/summary?tenantId=hair-tp-clinic',
      token
    );
    apiStatus = summary.status;
    if (summary.json?.ambiguousTotal != null) {
      const r = summary.json.report || {};
      progress = normalizeMailProgress(
        {
          source: 'prod_api',
          ambiguousTotal: summary.json.ambiguousTotal ?? r.ambiguousTotal,
          pending: summary.json.pending ?? r.remainingAmbiguous,
          approved: summary.json.approved ?? r.approved ?? 0,
          excluded: summary.json.excluded ?? 0,
          unresolved:
            (summary.json.unresolved ?? 0) +
            (summary.json.ownerAcceptedUnresolved ?? r.ownerAcceptedUnresolved ?? 0),
          remaining: r.remainingAmbiguous ?? summary.json.pending,
          mailboxCounts: summary.json.mailboxCounts || r.mailboxCounts || {},
          readyForWork: r.readyForWork === true,
        },
        { root }
      );
    }
  }

  const remaining = Number(progress.remaining ?? progress.pending ?? 0);
  const overall =
    pageProbe === 200 ? (remaining > 0 ? 'QUEUE_ACTIVE' : 'COVERAGE_IMPROVED') : 'UI_UNAVAILABLE';

  return {
    generatedAt: new Date().toISOString(),
    base,
    overall,
    operatorMode: 'READY',
    operatorToolPath: '/ambiguous-mail-enrichment-review.html',
    pageStatus: pageProbe,
    apiStatus,
    authAvailable: !!token,
    ambiguousTotal: progress.ambiguousTotal,
    remaining,
    approved: progress.approved,
    excluded: progress.excluded,
    unresolved: progress.unresolved,
    mailboxCounts: progress.mailboxCounts,
    mailboxCountsSource: progress.mailboxCountsSource,
    minApproveMatchFields: 3,
    rules: [
      'Ingen auto-write',
      'Ingen fuzzy merge',
      'Ingen customer merge',
      'Ingen Graph-fetch',
      'Ingen ny mailimport',
    ],
    nextAction:
      remaining > 0
        ? 'Öppna mail review — nästa bästa rad med ≥3 deterministiska fält'
        : 'Kör readiness — kö kan vara tom',
  };
}

function publishMailReviewOperatorStatus(payload, root) {
  const publicPath = path.join(root, 'public/cco-mail-review-operator-status.json');
  const reportPath = path.join(root, 'data/reports/cco-mail-review-operator-status.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  collectMailReviewOperatorStatus,
  publishMailReviewOperatorStatus,
};
