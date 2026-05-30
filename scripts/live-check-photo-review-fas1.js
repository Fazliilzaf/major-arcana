#!/usr/bin/env node
'use strict';

/**
 * P0 Photo Review Fas 1 — API live-check mot prod asset store (ingen write)
 *
 * Usage:
 *   node scripts/live-check-photo-review-fas1.js
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const REPO_ROOT = path.resolve(__dirname, '..');
const { createCcoPhotoReviewRouter } = require('../src/routes/ccoPhotoReview');
const { attachRole } = require('../src/security/ccoRbac');

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function createProdAssetStore() {
  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  const items = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {};
  return {
    _state() {
      return { items };
    },
    getAsset(id) {
      return items[id] || null;
    },
  };
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/cco`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function timedFetch(url) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { 'x-cco-role': 'operator' } });
  const body = await res.json();
  return { ms: Date.now() - t0, status: res.status, body };
}

async function main() {
  const app = express();
  app.use((req, _res, next) => {
    req.headers['x-cco-role'] = 'operator';
    next();
  });
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: async () => ({ assetStore: createProdAssetStore() }),
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
      writeEnabled: false,
    })
  );

  const report = await withServer(app, async (baseUrl) => {
    const summary = await timedFetch(`${baseUrl}/photo-review/summary`);
    const patients = await timedFetch(`${baseUrl}/photo-review/patients?limit=200`);
    const firstPatientId = patients.body?.patients?.[0]?.patientId;
    let detail = null;
    if (firstPatientId) {
      detail = await timedFetch(
        `${baseUrl}/photo-review/patients/${encodeURIComponent(firstPatientId)}`
      );
    }

    const postBlocked = await fetch(`${baseUrl}/photo-review/assets/x/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
      body: JSON.stringify({ decision: 'approve' }),
    });

    return {
      ok: summary.status === 200 && patients.status === 200,
      summary: {
        status: summary.status,
        ms: summary.ms,
        pendingPhotos: summary.body.pendingPhotos,
        patientsWithPendingPhotos: summary.body.patientsWithPendingPhotos,
        readOnly: summary.body.readOnly,
        writeEnabled: summary.body.writeEnabled,
      },
      patients: {
        status: patients.status,
        ms: patients.ms,
        total: patients.body.total,
        returned: patients.body.patients?.length || 0,
      },
      detail: detail
        ? {
            patientId: firstPatientId,
            status: detail.status,
            ms: detail.ms,
            pendingPhotos: detail.body.pendingPhotos,
            itemsReturned: detail.body.items?.length || 0,
            samplePreviewAvailable: detail.body.items?.[0]?.previewAvailable ?? null,
          }
        : null,
      postDecideBlocked: postBlocked.status === 404,
      totalApiMs: summary.ms + patients.ms + (detail?.ms || 0),
    };
  });

  console.log(JSON.stringify({ ok: report.ok, phase: 'fas1_readonly', report }, null, 2));
  process.exit(report.ok && report.postDecideBlocked ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
