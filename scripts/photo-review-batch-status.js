#!/usr/bin/env node
'use strict';

/**
 * Read-only counts for Photo Review from prod asset snapshot (stdout JSON).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const { classify, isPhotoCategory } = require('../src/ops/ccoAssetImportPipeline');

const PHOTO_CATS = new Set(['photo_before', 'photo_during', 'photo_after']);

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
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

function main() {
  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    process.stdout.write(
      JSON.stringify({ source: 'unavailable', error: 'missing cco-patient-assets.json' }) + '\n'
    );
    process.exit(0);
  }
  const items = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {};
  const pending = Object.values(items).filter(isPhotoReviewAsset);
  const visible = Object.values(items).filter(
    (a) => PHOTO_CATS.has(a.category) && a.status === 'VISIBLE_ON_PATIENT_CARD'
  );
  const payload = {
    source: 'local_prod_snapshot',
    pendingPhotos: pending.length,
    patientsWithPendingPhotos: new Set(pending.map((a) => a.patientId)).size,
    photosVisibleCount: visible.length,
    writeEnabled: false,
    readOnly: true,
    autoApprove: false,
    massApproval: false,
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

main();
