#!/usr/bin/env node
/**
 * bin/check-bundle-fresh.js
 *
 * Fas 28-C (2026-05-18): varnar om bundle-source-filer ändrats efter
 * senaste bundle-build. Förhindrar "glömde köra npm run build:bundle"-
 * buggar vid lokal dev där index.html laddar gammal bundle medan
 * source-filerna har ny kod.
 *
 * Användning:
 *   node bin/check-bundle-fresh.js          # 0 om fresh, 1 om stale
 *   node bin/check-bundle-fresh.js --quiet  # samma men ingen output vid OK
 *   npm run check:bundle                    # via npm script
 *
 * Pre-commit-hook (valfri):
 *   bash scripts/install-pre-commit-hook.sh
 *
 * Render-deploy kör alltid build:bundle som del av buildCommand, så
 * detta gäller bara LOKAL dev där manuell build glömts.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(__dirname, 'bundle-manifest.json');
const DEFERRED_MANIFEST = path.join(__dirname, 'bundle-manifest-staff-deferred.json');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const LATEST_JSON = path.join(PREVIEW_DIR, 'app.bundle.latest.json');

const QUIET = process.argv.includes('--quiet');

function log(...args) {
  if (!QUIET) console.log(...args);
}
function warn(...args) {
  console.warn(...args);
}

if (!fs.existsSync(MANIFEST)) {
  log('[check-bundle] Ingen bundle-manifest, skippar.');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

if (sources.length === 0) {
  log('[check-bundle] Tom manifest, skippar.');
  process.exit(0);
}

// Hitta senaste bundle (eller använd latest.json)
let latestBundlePath = null;
let latestBundleMtime = 0;
let latestMeta = null;
const splitBundlePaths = [];

if (fs.existsSync(LATEST_JSON)) {
  try {
    latestMeta = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8'));
    if (latestMeta.hash) {
      const candidate = path.join(PREVIEW_DIR, `app.bundle.${latestMeta.hash}.min.js`);
      if (fs.existsSync(candidate)) {
        latestBundlePath = candidate;
        latestBundleMtime = fs.statSync(candidate).mtimeMs;
      }
    }
    for (const key of ['staffCore', 'staffDeferred']) {
      const entry = latestMeta?.[key];
      if (entry?.hash) {
        const prefix = key === 'staffCore' ? 'staff-core' : 'staff-deferred';
        const splitPath = path.join(PREVIEW_DIR, `app.bundle.${prefix}.${entry.hash}.min.js`);
        if (fs.existsSync(splitPath)) {
          splitBundlePaths.push(splitPath);
          latestBundleMtime = Math.max(latestBundleMtime, fs.statSync(splitPath).mtimeMs);
        }
      }
    }
  } catch (_e) {}
}

// Fallback: leta efter alla app.bundle.*.min.js och ta senaste mtime
if (!latestBundlePath) {
  const files = fs
    .readdirSync(PREVIEW_DIR)
    .filter((f) => /^app\.bundle\.[a-f0-9]+\.min\.js$/.test(f));
  for (const f of files) {
    const p = path.join(PREVIEW_DIR, f);
    const m = fs.statSync(p).mtimeMs;
    if (m > latestBundleMtime) {
      latestBundleMtime = m;
      latestBundlePath = p;
    }
  }
}

if (!latestBundlePath) {
  warn('');
  warn('⚠️  [check-bundle] Ingen bundle hittad lokalt.');
  warn('   Källfilerna finns men ingen app.bundle.<hash>.min.js är byggd.');
  warn('   Render bygger automatiskt vid deploy — lokal dev kan behöva:');
  warn('     npm run build:bundle');
  warn('');
  process.exit(1);
}

// Kolla om någon source-fil är nyare än bundle
const staleSources = [];
for (const src of sources) {
  const srcPath = path.join(PREVIEW_DIR, src);
  if (!fs.existsSync(srcPath)) continue;
  const m = fs.statSync(srcPath).mtimeMs;
  if (m > latestBundleMtime) {
    staleSources.push({
      file: src,
      ageDiffSec: Math.round((m - latestBundleMtime) / 1000),
    });
  }
}

const deferredSources = fs.existsSync(DEFERRED_MANIFEST)
  ? JSON.parse(fs.readFileSync(DEFERRED_MANIFEST, 'utf8')).sources || []
  : [];

const splitManifestIssues = [];
if (deferredSources.length > 0) {
  const unknownDeferred = deferredSources.filter((s) => !sources.includes(s));
  if (unknownDeferred.length) {
    splitManifestIssues.push(
      `deferred manifest har ${unknownDeferred.length} fil(er) som saknas i full manifest`
    );
  }
  if (latestMeta?.staffCore && splitBundlePaths.length < 2) {
    splitManifestIssues.push('latest.json har staffCore/staffDeferred men split-bundles saknas lokalt');
  }
}

if (staleSources.length === 0 && splitManifestIssues.length === 0) {
  const splitNote =
    splitBundlePaths.length > 0
      ? ` (+ ${splitBundlePaths.length} split-chunk(s))`
      : '';
  log(`[check-bundle] ✓ Bundle är fresh — alla source-filer äldre än bundle${splitNote}.`);
  process.exit(0);
}

if (splitManifestIssues.length > 0) {
  warn('');
  warn('⚠️  [check-bundle] Split-manifest/bundle mismatch:');
  splitManifestIssues.forEach((issue) => warn(`   - ${issue}`));
  warn('');
  process.exit(1);
}

warn('');
warn(`⚠️  [check-bundle] Bundle är STALE — ${staleSources.length} source-fil(er) ändrad(e) efter build.`);
warn('');
warn('   Senaste bundle:', path.basename(latestBundlePath));
warn('   Senaste build:', new Date(latestBundleMtime).toISOString());
warn('');
warn('   Ändrade källfiler:');
for (const s of staleSources.slice(0, 8)) {
  warn(`     - ${s.file}  (+${s.ageDiffSec}s nyare än bundle)`);
}
if (staleSources.length > 8) {
  warn(`     ... och ${staleSources.length - 8} till`);
}
warn('');
warn('   Fix: kör  npm run build:bundle');
warn('   (Eller pusha ändå — Render bygger automatiskt vid deploy.)');
warn('');
process.exit(1);
