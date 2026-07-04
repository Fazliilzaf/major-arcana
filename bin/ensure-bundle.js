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
const INDEX_HTML = path.join(PREVIEW_DIR, 'index.html');

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

/**
 * De bundle-filer som index.html FAKTISKT refererar (via __ARCANA_BUNDLE_URLS__
 * + loader-fallbacks). Detta är sanningen för vad browsern laddar — om någon av
 * dem saknas på disk 404:ar appen och faller tillbaka till scaffold-läget, även
 * om latest.json pekar på andra (existerande) filer. ensure-bundle måste därför
 * validera DESSA, inte bara latest.json.
 */
function referencedBundleFiles() {
  try {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    const files = new Set();
    const re = /app\.bundle(?:\.staff-core|\.staff-deferred)?\.[a-f0-9]+\.min\.js/g;
    let m;
    while ((m = re.exec(html)) !== null) files.add(m[0]);
    return [...files];
  } catch {
    return [];
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
  // Validera BÅDE latest.json:s filer OCH de index.html faktiskt refererar. Det
  // senare är avgörande: pekar index.html på en gammal/saknad hash (t.ex. efter
  // build:bundle utan inject, eller en stale committad hash) 404:ar appen och
  // visar scaffold — även om latest.json-filerna finns.
  const referenced = referencedBundleFiles();
  const toCheck = [...new Set([...expected, ...referenced])];
  const missing = toCheck.filter((f) => !fs.existsSync(path.join(PREVIEW_DIR, f)));
  if (missing.length === 0) {
    return;
  }
  console.log(
    `[ensure-bundle] ${missing.length} refererad(e) bundle-fil(er) saknas: ${missing.join(', ')} — bygger + injectar om.`
  );
  rebuild();
}

if (require.main === module) {
  main();
}

module.exports = { referencedBundleFiles, expectedBundleFiles };
