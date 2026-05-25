#!/usr/bin/env node
/**
 * bin/build-bundle.js — bundla IIFE-script till hashade bundles.
 *
 * Output:
 *   app.bundle.<hash>.min.js              — full (desktop + fallback)
 *   app.bundle.staff-core.<hash>.min.js   — mobil staff första chunk
 *   app.bundle.staff-deferred.<hash>.min.js — journal m.m. lazy chunk
 *   app.bundle.latest.json
 */
const fs = require('fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const OUT_CONCAT = path.join(PREVIEW_DIR, 'app.bundle.js');
const LATEST_JSON = path.join(PREVIEW_DIR, 'app.bundle.latest.json');
const MANIFEST = path.join(__dirname, 'bundle-manifest.json');
const DEFERRED_MANIFEST = path.join(__dirname, 'bundle-manifest-staff-deferred.json');

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`FEL: ${filePath} saknas.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sources = manifest.sources || [];
  if (sources.length === 0) {
    console.error(`FEL: ${filePath} sources-array är tom.`);
    process.exit(1);
  }
  return sources;
}

function verifySources(sources, label) {
  const missing = sources.filter((s) => !fs.existsSync(path.join(PREVIEW_DIR, s)));
  if (missing.length) {
    console.error(`FEL: saknar filer i ${label}:`);
    missing.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
}

function concatSources(sources, label) {
  let totalBytes = 0;
  const parts = [];
  parts.push(`/* Major Arcana CCO bundle — ${label} — ${sources.length} filer.\n`);
  parts.push(' * Genererad av bin/build-bundle.js\n');
  parts.push(' */\n\n');

  for (const s of sources) {
    const fp = path.join(PREVIEW_DIR, s);
    const code = fs.readFileSync(fp, 'utf8');
    parts.push('\n/* ============================================================ */\n');
    parts.push(`/* === ${s} === */\n`);
    parts.push('/* ============================================================ */\n');
    parts.push(code);
    parts.push('\n');
    totalBytes += code.length;
  }

  return { concatSrc: parts.join(''), totalBytes };
}

function minifyConcat(concatSrc) {
  console.log('Minify:ar med esbuild…');
  const tmpIn = path.join(require('node:os').tmpdir(), `cco-bundle-in-${process.pid}.js`);
  fs.writeFileSync(tmpIn, concatSrc);
  execSync('npx --yes esbuild --version', { stdio: 'pipe' });
  return execSync(
    `npx --yes esbuild ${tmpIn} --minify --target=es2020 --legal-comments=none`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
}

function buildHashedBundle({ sources, label, namePrefix = '' }) {
  verifySources(sources, label);
  const { concatSrc, totalBytes } = concatSources(sources, label);
  const minified = minifyConcat(concatSrc);
  const hash = crypto.createHash('sha256').update(minified).digest('hex').slice(0, 10);
  const middle = namePrefix ? `.${namePrefix}` : '';
  const hashedFilename = `app.bundle${middle}.${hash}.min.js`;
  const outMin = path.join(PREVIEW_DIR, hashedFilename);
  fs.writeFileSync(outMin, minified);
  console.log(
    `✓ ${hashedFilename}: ${minified.length.toLocaleString('sv-SE')} bytes min (${sources.length} filer)`
  );
  return {
    filename: hashedFilename,
    hash,
    sourceCount: sources.length,
    concatBytes: concatSrc.length,
    minBytes: minified.length,
    rawBytes: totalBytes,
  };
}

const fullSources = readManifest(MANIFEST);
const deferredSources = readManifest(DEFERRED_MANIFEST);
const deferredSet = new Set(deferredSources);
const staffCoreSources = fullSources.filter((s) => !deferredSet.has(s));

if (staffCoreSources.length + deferredSources.length !== fullSources.length) {
  const unknownDeferred = deferredSources.filter((s) => !fullSources.includes(s));
  if (unknownDeferred.length) {
    console.error('FEL: deferred manifest innehåller filer som saknas i full manifest:');
    unknownDeferred.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
}

console.log(`Full manifest: ${fullSources.length} filer`);
console.log(`Staff core:    ${staffCoreSources.length} filer`);
console.log(`Staff defer:   ${deferredSources.length} filer`);

// Debug concat (full only)
const fullConcat = concatSources(fullSources, 'full');
fs.writeFileSync(OUT_CONCAT, fullConcat.concatSrc);
console.log(`✓ ${path.relative(ROOT, OUT_CONCAT)}: ${fullConcat.concatSrc.length} bytes (concat debug)`);

const full = buildHashedBundle({ sources: fullSources, label: 'full', namePrefix: '' });
const staffCore = buildHashedBundle({
  sources: staffCoreSources,
  label: 'staff-core',
  namePrefix: 'staff-core',
});
const staffDeferred = buildHashedBundle({
  sources: deferredSources,
  label: 'staff-deferred',
  namePrefix: 'staff-deferred',
});

const latestInfo = {
  filename: full.filename,
  hash: full.hash,
  sourceCount: full.sourceCount,
  concatBytes: full.concatBytes,
  minBytes: full.minBytes,
  generatedAt: new Date().toISOString(),
  staffCore: {
    filename: staffCore.filename,
    hash: staffCore.hash,
    sourceCount: staffCore.sourceCount,
    minBytes: staffCore.minBytes,
  },
  staffDeferred: {
    filename: staffDeferred.filename,
    hash: staffDeferred.hash,
    sourceCount: staffDeferred.sourceCount,
    minBytes: staffDeferred.minBytes,
  },
};
fs.writeFileSync(LATEST_JSON, `${JSON.stringify(latestInfo, null, 2)}\n`);
console.log(`✓ ${path.relative(ROOT, LATEST_JSON)} skriven`);

const ALL_BUNDLES_RE = /^app\.bundle(?:\.(?:staff-core|staff-deferred))?\.[a-f0-9]{6,}\.min\.js$/;
const allBundles = fs
  .readdirSync(PREVIEW_DIR)
  .filter((f) => ALL_BUNDLES_RE.test(f))
  .map((f) => ({ name: f, mtime: fs.statSync(path.join(PREVIEW_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

const KEEP = 6;
const toDelete = allBundles.slice(KEEP);
if (toDelete.length) {
  console.log(`Rensar ${toDelete.length} gamla bundle-filer:`);
  for (const b of toDelete) {
    fs.unlinkSync(path.join(PREVIEW_DIR, b.name));
    console.log(`  - ${b.name}`);
  }
}

const saved = full.minBytes - staffCore.minBytes;
console.log('\n=== Bundle-resultat ===');
console.log(`Full:           ${full.minBytes.toLocaleString('sv-SE')} bytes`);
console.log(`Staff core:     ${staffCore.minBytes.toLocaleString('sv-SE')} bytes (−${saved.toLocaleString('sv-SE')} vs full)`);
console.log(`Staff deferred: ${staffDeferred.minBytes.toLocaleString('sv-SE')} bytes (lazy)`);
console.log('\nNästa steg: kör bin/inject-bundle.js för att modifiera index.html.');
