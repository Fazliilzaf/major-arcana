#!/usr/bin/env node
'use strict';

/**
 * Read-only counts + write/canary readiness for Photo Review.
 * stdout: single JSON line
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const { classify, isPhotoCategory } = require('../src/ops/ccoAssetImportPipeline');

delete require.cache[require.resolve('../src/config.js')];
const { config } = require('../src/config.js');

const PHOTO_CATS = new Set(['photo_before', 'photo_during', 'photo_after']);

function prodDataRoot() {
  if (process.env.ARCANA_CCO_PROD_DATA_ROOT) {
    return process.env.ARCANA_CCO_PROD_DATA_ROOT;
  }
  const candidates = [
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    ),
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data/cco-prod'
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'cco-patient-assets.json'))) return candidate;
  }
  return candidates[0];
}

function isPhotoReviewAsset(asset) {
  if (!asset || asset.status !== 'NEEDS_REVIEW') return false;
  if (PHOTO_CATS.has(asset.category)) return true;
  const classification = classify({
    mimeType: asset.mimeType,
    fileName: asset.originalFileName,
    sourceFolder: asset.originalDrivePath,
  });
  return (
    isPhotoCategory(classification.category) || String(asset.mimeType || '').startsWith('image/')
  );
}

function loadCanaryTrack() {
  try {
    const { loadState, getTrackSummary } = require('../src/ops/ccoOperatorCanary');
    const { state } = loadState(REPO);
    return getTrackSummary(state, 'photo', config.photoReviewCanaryMax);
  } catch {
    return null;
  }
}

function main() {
  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    process.stdout.write(
      JSON.stringify({
        source: 'unavailable',
        error: 'missing cco-patient-assets.json',
        writeEnabled: config.enablePhotoReviewWrite,
        canaryMaxDecisions: config.photoReviewCanaryMax,
      }) + '\n'
    );
    process.exit(0);
  }

  const items = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {};
  const pending = Object.values(items).filter(isPhotoReviewAsset);
  const visible = Object.values(items).filter(
    (a) => PHOTO_CATS.has(a.category) && a.status === 'VISIBLE_ON_PATIENT_CARD'
  );
  const canary = loadCanaryTrack();
  const writeEnabled = config.enablePhotoReviewWrite === true;

  const payload = {
    source: 'local_prod_snapshot',
    pendingPhotos: pending.length,
    patientsWithPendingPhotos: new Set(pending.map((a) => a.patientId)).size,
    photosVisibleCount: visible.length,
    writeEnabled,
    readOnly: !writeEnabled,
    canaryMode: writeEnabled && config.enableCcoOperatorCanary === true,
    canaryMaxDecisions: config.photoReviewCanaryMax,
    canaryDecisionsUsed: canary?.decisionsUsed ?? 0,
    canaryDecisionsRemaining: canary?.decisionsRemaining ?? config.photoReviewCanaryMax,
    canaryLimitReached: canary?.limitReached ?? false,
    autoApprove: false,
    massApproval: false,
    operatorToolPath: '/photo-review.html',
    operatorToolAlias: '/cco-photo-review.html',
    activation: writeEnabled
      ? 'CANARY_PÅ — granska via /photo-review.html (max 25 beslut/batch)'
      : 'Sätt ENABLE_CCO_OPERATOR_CANARY + ENABLE_PHOTO_REVIEW_WRITE + ENABLE_PHOTO_REVIEW_CANARY_ON_PROD på Render',
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

main();
