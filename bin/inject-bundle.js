#!/usr/bin/env node
/**
 * bin/inject-bundle.js — ersätter 50 script-taggar i index.html med 1
 * referens till app.bundle.min.js. Reversibelt via git checkout.
 *
 * Användning:
 *   node bin/inject-bundle.js          # injicera bundle
 *   node bin/inject-bundle.js --revert # återställ 50 taggar (om bundlen finns kvar)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public/major-arcana-preview/index.html');
const BUNDLE_REL = './app.bundle.min.js';

const REVERT = process.argv.includes('--revert');

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const SCRIPT_BLOCK_RE = /(\s*<script\s+src="\.\/[^"]+"\s*><\/script>\s*)+/g;

// Hitta första matchande block med >5 scripts (det är vårt mål-block)
let target = null;
let bestCount = 0;
let m;
const RE = new RegExp(SCRIPT_BLOCK_RE.source, 'g');
while ((m = RE.exec(html)) !== null) {
  const count = (m[0].match(/<script/g) || []).length;
  if (count > bestCount) {
    bestCount = count;
    target = { start: m.index, end: m.index + m[0].length, raw: m[0], count };
  }
}

if (!target || target.count < 5) {
  console.error('FEL: hittade inget script-block med >5 taggar i index.html');
  process.exit(1);
}

console.log(`Mål-block: rad ${html.slice(0, target.start).split('\n').length}, ${target.count} script-taggar`);

const BUNDLE_TAG = `\n    <!-- Bundlade scripts: ${target.count} filer → 1, byggt av bin/build-bundle.js -->\n    <script src="${BUNDLE_REL}"></script>\n    `;

if (REVERT) {
  // Hitta bundle-taggen och ersätt med original 50-taggar — kräver att man
  // har ett git checkout-state att återgå till. Detta script kan inte
  // återskapa originalen, så --revert betyder bara: print instruktion.
  console.log('Revert: gör `git checkout -- public/major-arcana-preview/index.html` för att återställa.');
  process.exit(0);
}

const newHtml = html.slice(0, target.start) + BUNDLE_TAG + html.slice(target.end);
fs.writeFileSync(INDEX_HTML, newHtml);

console.log(`✓ Index.html: ${target.count} script-taggar → 1 (${BUNDLE_REL})`);
console.log(`Bytes före: ${html.length}`);
console.log(`Bytes efter: ${newHtml.length} (-${html.length - newHtml.length})`);
console.log('\nNästa steg: hard-reload i Chrome + kör verify-three-features.js + verify-demo-fixtures.js');
console.log('Om något bryter: git checkout -- public/major-arcana-preview/index.html');
