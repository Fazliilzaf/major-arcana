#!/usr/bin/env node
/**
 * bin/build-bundle.js — bundla alla 51 IIFE-script-filer från index.html
 * till EN enda app.bundle.js.
 *
 * Strategi: concat + minify (INTE ESM-bundling).
 * - Alla 51 script-filer är IIFE-pattern som registrerar sig via window.__X.
 * - Vi konkatenerar dem i exakt index.html-ordning så bootstrap-flödet bevaras.
 * - Minify:ar med esbuild för bytes-vinst (~50% reduction typically).
 *
 * Output:
 *   public/major-arcana-preview/app.bundle.js (concat, debugbart)
 *   public/major-arcana-preview/app.bundle.min.js (minified, för deploy)
 *
 * Index.html modifieras INTE av denna script — det görs separat i en
 * andra commit efter verifiering.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const INDEX_HTML = path.join(PREVIEW_DIR, 'index.html');
const OUT_CONCAT = path.join(PREVIEW_DIR, 'app.bundle.js');
const OUT_MIN = path.join(PREVIEW_DIR, 'app.bundle.min.js');

// 1. Läs script-taggar i ordning
const html = fs.readFileSync(INDEX_HTML, 'utf8');
const SCRIPT_RE = /<script\s+src="\.\/([^"?]+)(?:\?[^"]*)?"\s*><\/script>/g;
const scripts = [];
let m;
while ((m = SCRIPT_RE.exec(html)) !== null) {
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
  missing.forEach(f => console.error('  ' + f));
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
console.log(`✓ ${OUT_CONCAT.replace(ROOT + '/', '')}: ${concatSrc.length} bytes (concat)`);

// 4. Minify via esbuild
try {
  console.log('Minify:ar med esbuild…');
  const tmpIn = '/tmp/cco-bundle-in.js';
  fs.writeFileSync(tmpIn, concatSrc);
  // esbuild via npx
  execSync(`npx --yes esbuild --version`, { stdio: 'pipe' });
  const minified = execSync(
    `npx --yes esbuild ${tmpIn} --minify --target=es2020 --legal-comments=none`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
  );
  fs.writeFileSync(OUT_MIN, minified);
  const ratio = ((minified.length / concatSrc.length) * 100).toFixed(1);
  console.log(`✓ ${OUT_MIN.replace(ROOT + '/', '')}: ${minified.length} bytes (${ratio}% av concat)`);
} catch (e) {
  console.error('FEL vid minify:', e.message);
  process.exit(1);
}

// 5. Rapport
console.log('\n=== Bundle-resultat ===');
console.log(`Källfiler:    ${scripts.length}`);
console.log(`Källbytes:    ${totalBytes.toLocaleString('sv-SE')}`);
console.log(`Concat:       ${concatSrc.length.toLocaleString('sv-SE')} bytes (${((concatSrc.length/totalBytes)*100).toFixed(1)}%)`);
const minBytes = fs.statSync(OUT_MIN).size;
console.log(`Min:          ${minBytes.toLocaleString('sv-SE')} bytes (${((minBytes/totalBytes)*100).toFixed(1)}% av råkälla, ${((minBytes/concatSrc.length)*100).toFixed(1)}% av concat)`);
console.log('\nNästa steg: kör bin/inject-bundle.js för att modifiera index.html.');
