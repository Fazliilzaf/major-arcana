#!/usr/bin/env node
/**
 * bin/build-bundle.js — bundla alla IIFE-script-filer till EN bundle med
 * content-hash i filnamn för permanent cache-busting.
 *
 * Strategi: concat + minify + content-hash.
 * - Alla script-filer är IIFE-pattern som registrerar sig via window.__X.
 * - Vi konkatenerar i exakt index.html-ordning så bootstrap-flödet bevaras.
 * - Minify:ar med esbuild för bytes-vinst.
 * - Filnamnet får content-hash: app.bundle.<hash>.min.js
 * - Skriver app.bundle.latest.json med pekare till senaste hash så
 *   inject-bundle.js kan hitta den.
 *
 * Output:
 *   public/major-arcana-preview/app.bundle.js            (concat, debugbart)
 *   public/major-arcana-preview/app.bundle.<hash>.min.js (minified, hashad)
 *   public/major-arcana-preview/app.bundle.latest.json   (pekare med hash)
 *
 * Gamla hashade bundle-filer rensas automatiskt (bevarar bara senaste 2).
 *
 * Index.html modifieras separat av bin/inject-bundle.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const INDEX_HTML = path.join(PREVIEW_DIR, 'index.html');
const OUT_CONCAT = path.join(PREVIEW_DIR, 'app.bundle.js');
const LATEST_JSON = path.join(PREVIEW_DIR, 'app.bundle.latest.json');

// 1. Läs script-taggar i ordning
const html = fs.readFileSync(INDEX_HTML, 'utf8');
const SCRIPT_RE = /<script\s+src="\.\/([^"?]+)(?:\?[^"]*)?"\s*><\/script>/g;
const scripts = [];
let m;
while ((m = SCRIPT_RE.exec(html)) !== null) {
  // Skippa självreferens till tidigare bundle (annars dubbel-bundling)
  if (/^app\.bundle(\.[a-f0-9]+)?(\.min)?\.js$/.test(m[1])) continue;
  scripts.push(m[1]);
}

if (scripts.length === 0) {
  console.error('FEL: hittade inga ./*.js script-taggar i index.html');
  process.exit(1);
}

console.log(`Hittade ${scripts.length} script-taggar i index.html`);

// 2. Verifiera att alla filer finns
const missing = [];
for (const s of scripts) {
  if (!fs.existsSync(path.join(PREVIEW_DIR, s))) missing.push(s);
}
if (missing.length) {
  console.error(`FEL: saknar filer:`);
  missing.forEach((f) => console.error('  ' + f));
  process.exit(1);
}

// 3. Konkatenera
let totalBytes = 0;
const parts = [];
parts.push('/* Major Arcana CCO bundle — concat av ' + scripts.length + ' filer.\n');
parts.push(' * Genererad av bin/build-bundle.js\n');
parts.push(' * Bevarar exakt index.html-ordning så IIFE-bootstrap-flödet är identiskt.\n');
parts.push(' */\n\n');

for (const s of scripts) {
  const fp = path.join(PREVIEW_DIR, s);
  const code = fs.readFileSync(fp, 'utf8');
  parts.push('\n/* ============================================================ */\n');
  parts.push('/* === ' + s + ' === */\n');
  parts.push('/* ============================================================ */\n');
  parts.push(code);
  parts.push('\n');
  totalBytes += code.length;
}

const concatSrc = parts.join('');
fs.writeFileSync(OUT_CONCAT, concatSrc);
console.log(`✓ ${path.relative(ROOT, OUT_CONCAT)}: ${concatSrc.length} bytes (concat)`);

// 4. Minify via esbuild
let minified;
try {
  console.log('Minify:ar med esbuild…');
  const tmpIn = '/tmp/cco-bundle-in.js';
  fs.writeFileSync(tmpIn, concatSrc);
  execSync(`npx --yes esbuild --version`, { stdio: 'pipe' });
  minified = execSync(
    `npx --yes esbuild ${tmpIn} --minify --target=es2020 --legal-comments=none`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
} catch (e) {
  console.error('FEL vid minify:', e.message);
  process.exit(1);
}

// 5. Content-hash → permanent cache-bust per innehåll
const hash = crypto.createHash('sha256').update(minified).digest('hex').slice(0, 10);
const hashedFilename = `app.bundle.${hash}.min.js`;
const OUT_MIN = path.join(PREVIEW_DIR, hashedFilename);
fs.writeFileSync(OUT_MIN, minified);
console.log(`✓ ${path.relative(ROOT, OUT_MIN)}: ${minified.length} bytes (${((minified.length / concatSrc.length) * 100).toFixed(1)}% av concat)`);

// 6. Skriv latest.json så inject-bundle.js + andra verktyg kan hitta hashen
const latestInfo = {
  filename: hashedFilename,
  hash,
  sourceCount: scripts.length,
  concatBytes: concatSrc.length,
  minBytes: minified.length,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(LATEST_JSON, JSON.stringify(latestInfo, null, 2) + '\n');
console.log(`✓ ${path.relative(ROOT, LATEST_JSON)} skriven (hash=${hash})`);

// 7. Cleanup: rensa gamla hashed bundle-filer (behåll bara senaste 2 + den nya)
const ALL_BUNDLES_RE = /^app\.bundle\.[a-f0-9]{6,}\.min\.js$/;
const allBundles = fs
  .readdirSync(PREVIEW_DIR)
  .filter((f) => ALL_BUNDLES_RE.test(f))
  .map((f) => ({ name: f, mtime: fs.statSync(path.join(PREVIEW_DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

const KEEP = 2; // behåll senaste 2 (inkl. den nya) för rollback-möjlighet
const toDelete = allBundles.slice(KEEP);
if (toDelete.length) {
  console.log(`Rensar ${toDelete.length} gamla bundle-filer:`);
  for (const b of toDelete) {
    fs.unlinkSync(path.join(PREVIEW_DIR, b.name));
    console.log(`  - ${b.name}`);
  }
}

// 8. Rapport
console.log('\n=== Bundle-resultat ===');
console.log(`Källfiler:    ${scripts.length}`);
console.log(`Källbytes:    ${totalBytes.toLocaleString('sv-SE')}`);
console.log(
  `Concat:       ${concatSrc.length.toLocaleString('sv-SE')} bytes (${((concatSrc.length / totalBytes) * 100).toFixed(1)}%)`
);
console.log(
  `Min:          ${minified.length.toLocaleString('sv-SE')} bytes (${((minified.length / totalBytes) * 100).toFixed(1)}% av råkälla)`
);
console.log(`Hash:         ${hash}`);
console.log(`Filnamn:      ${hashedFilename}`);
console.log('\nNästa steg: kör bin/inject-bundle.js för att modifiera index.html.');
