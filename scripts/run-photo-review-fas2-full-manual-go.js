#!/usr/bin/env node
'use strict';

/**
 * Photo Review Fas 2 — full manual review GO / preflight
 *
 * Verifierar att full-cohort write kan aktiveras säkert (staging/dev).
 * Skriver INTE beslut — endast preflight.
 *
 * Usage:
 *   node scripts/run-photo-review-fas2-full-manual-go.js
 *   node scripts/run-photo-review-fas2-full-manual-go.js --expect-host=arcana-staging.onrender.com
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

process.env.ENABLE_PHOTO_REVIEW_WRITE = process.env.ENABLE_PHOTO_REVIEW_WRITE || 'true';
process.env.PHOTO_REVIEW_FULL_COHORT = 'true';
if (!process.env.RENDER_EXTERNAL_HOSTNAME) {
  process.env.RENDER_EXTERNAL_HOSTNAME = 'arcana-staging.onrender.com';
}

delete require.cache[require.resolve('../src/config.js')];
const { config } = require('../src/config.js');
const { isPhotoReviewAsset } = require('../src/routes/ccoPhotoReview');
const { pilotSummary } = require('../src/ops/ccoPhotoReviewPilot');

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function main() {
  const expectHost = process.argv.find((a) => a.startsWith('--expect-host='))?.split('=')[1];
  const host = process.env.RENDER_EXTERNAL_HOSTNAME || process.env.PUBLIC_BASE_URL || 'localhost';
  const checks = [];
  const stop = [];

  const writeEnabled = config.enablePhotoReviewWrite;
  checks.push({
    id: 'write_enabled',
    ok: writeEnabled,
    detail: writeEnabled ? 'ENABLE_PHOTO_REVIEW_WRITE=true' : 'write blocked',
  });
  if (!writeEnabled) stop.push('ENABLE_PHOTO_REVIEW_WRITE=false eller prod-host block');

  const fullCohort = config.photoReviewFullCohort;
  checks.push({
    id: 'full_cohort',
    ok: fullCohort,
    detail: fullCohort ? 'PHOTO_REVIEW_FULL_COHORT=true' : 'pilot cap active',
  });
  if (!fullCohort) stop.push('PHOTO_REVIEW_FULL_COHORT saknas — 5-patient/20-beslut cap gäller');

  const pilot = pilotSummary(
    { fullCohort: true, patientIds: [], maxDecisions: 0 },
    { query: () => [] }
  );
  checks.push({ id: 'pilot_unrestricted', ok: !pilot.active && pilot.fullCohort, detail: pilot });

  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    stop.push(`prod assets saknas: ${assetsPath}`);
    console.error(JSON.stringify({ ok: false, stop, checks }, null, 2));
    process.exit(2);
  }

  const items = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {};
  const all = Object.values(items);
  const pending = all.filter(isPhotoReviewAsset);
  const patients = new Set(pending.map((a) => a.patientId)).size;

  let missingStorage = 0;
  let missingChecksum = 0;
  let missingPatient = 0;
  let driveLinks = 0;
  for (const a of pending) {
    if (!a.patientId) missingPatient += 1;
    if (!a.storageKey || a.storageKey === 'pending-no-binary') missingStorage += 1;
    if (!a.checksum) missingChecksum += 1;
    const blob = JSON.stringify(a);
    if (/drive\.google\.com|docs\.google\.com/i.test(blob)) driveLinks += 1;
  }

  checks.push({
    id: 'queue_size',
    ok: pending.length > 0,
    detail: { pendingPhotos: pending.length, patients },
  });
  checks.push({
    id: 'storage',
    ok: missingStorage === 0,
    detail: { missingStorageKey: missingStorage },
  });
  checks.push({ id: 'checksum', ok: missingChecksum === 0, detail: { missingChecksum } });
  checks.push({
    id: 'patient_id',
    ok: missingPatient === 0,
    detail: { missingPatientId: missingPatient },
  });
  checks.push({ id: 'no_drive', ok: driveLinks === 0, detail: { driveLinkRefs: driveLinks } });

  if (missingStorage) stop.push(`${missingStorage} bilder saknar storageKey`);
  if (missingChecksum) stop.push(`${missingChecksum} bilder saknar checksum`);
  if (missingPatient) stop.push(`${missingPatient} bilder saknar patientId`);
  if (driveLinks) stop.push(`${driveLinks} Drive-länk-referenser i kön`);

  if (expectHost && !String(host).includes(expectHost)) {
    checks.push({ id: 'host', ok: false, detail: { host, expectHost } });
    stop.push(`fel host: ${host} (förväntat ${expectHost})`);
  } else {
    checks.push({ id: 'host', ok: true, detail: host });
  }

  const ok = stop.length === 0;
  const out = {
    ok,
    go: ok ? 'FULL_MANUAL_REVIEW' : 'STOP',
    host,
    baseline: { pendingPhotos: pending.length, patients },
    checks,
    stop,
    activation: {
      env: ['ENABLE_PHOTO_REVIEW_WRITE=true', 'PHOTO_REVIEW_FULL_COHORT=true'],
      ui: '/photo-review.html',
      reportEvery100: 'window.__ARCANA_PHOTO_REVIEW_MILESTONES__',
      progressScript: 'node scripts/photo-review-fas2-progress-report.js',
      finalScript: 'node scripts/photo-review-fas2-progress-report.js --final',
    },
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
