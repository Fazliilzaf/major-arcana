#!/usr/bin/env node
/**
 * bin/ensure-bundle.js
 *
 * Pre-dev safety net: index.html refererar hashade bundles
 * (app.bundle.<hash>.min.js + staff-core/staff-deferred-varianter).
 * Vid fresh clone, efter manifest-uppdatering, eller om någon glömt
 * köra `npm run build:bundle && node bin/inject-bundle.js` finns
 * inte filerna på disk — då hänger appen silent på loading-flaggan.
 *
 * Detta script:
 *   1. Läser bundle-referenser ur index.html
 *   2. Om någon refererad bundle saknas på disk → kör build + inject
 *   3. Annars no-op (snabb, körs vid varje `npm run dev` / `dev:offline`)
 *
 * Render-deploy kör alltid `npm run build:bundle` i build-stage,
 * så detta är bara för lokal dev.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const LATEST_JSON = path.join(PREVIEW_DIR, 'app.bundle.latest.json');

function expectedBundleFiles() {
  if (!fs.existsSync(LATEST_JSON)) return null;
  try {
    const latest = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8'));
    const files = [];
    if (latest.filename) files.push(latest.filename);
    if (latest.staffCore?.filename) files.push(latest.staffCore.filename);
    if (latest.staffDeferred?.filename) files.push(latest.staffDeferred.filename);
    return files;
  } catch {
    return null;
  }
}

function rebuild() {
  console.log('[ensure-bundle] Bygger och injectar...');
  execSync('node bin/build-bundle.js', { cwd: ROOT, stdio: 'inherit' });
  execSync('node bin/inject-bundle.js', { cwd: ROOT, stdio: 'inherit' });
  console.log('[ensure-bundle] Klart.');
}

function main() {
  const expected = expectedBundleFiles();
  if (!expected) {
    console.log('[ensure-bundle] app.bundle.latest.json saknas — kör första-gångs-build.');
    rebuild();
    return;
  }
  const missing = expected.filter((f) => !fs.existsSync(path.join(PREVIEW_DIR, f)));
  if (missing.length === 0) {
    return;
  }
  console.log(`[ensure-bundle] ${missing.length} bundle-fil(er) saknas: ${missing.join(', ')}`);
  rebuild();
}

main();
