#!/usr/bin/env node
/**
 * bin/inject-bundle.js — uppdaterar index.html med senaste hashade bundle.
 *
 * Läser app.bundle.latest.json för att hitta hashen, ersätter sedan ev.
 * befintlig bundle-tag (oavsett hash) med ny tag som pekar på
 * ./app.bundle.<hash>.min.js. Permanent cache-bust per content-hash.
 *
 * Användning:
 *   node bin/inject-bundle.js          # injicera senaste bundle
 *   node bin/inject-bundle.js --revert # print revert-instruktion
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public/major-arcana-preview/index.html');
const LATEST_JSON = path.join(ROOT, 'public/major-arcana-preview/app.bundle.latest.json');

const REVERT = process.argv.includes('--revert');

if (REVERT) {
  console.log(
    'Revert: gör `git checkout -- public/major-arcana-preview/index.html` för att återställa.'
  );
  process.exit(0);
}

// 1. Läs latest.json för att hitta senaste bundle
if (!fs.existsSync(LATEST_JSON)) {
  console.error('FEL: app.bundle.latest.json saknas. Kör bin/build-bundle.js först.');
  process.exit(1);
}
const latest = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8'));
const newBundleRel = `./${latest.filename}`;
console.log(`Senaste bundle: ${latest.filename} (hash=${latest.hash})`);

const html = fs.readFileSync(INDEX_HTML, 'utf8');

// 2. Hitta ev. befintlig bundle-tag (oavsett hash, oavsett query-param)
//    Matchar: <script src="./app.bundle.min.js">,
//             <script src="./app.bundle.<hash>.min.js">,
//             <script src="./app.bundle.<hash>.min.js?v=...">
const EXISTING_BUNDLE_RE =
  /\s*(?:<!--[^>]*Bundlade scripts[^>]*-->\s*)?<script\s+src="\.\/app\.bundle(?:\.[a-f0-9]+)?(?:\.min)?\.js(?:\?[^"]*)?"\s*><\/script>\s*/g;

let newHtml = html;
const existingMatches = [...html.matchAll(EXISTING_BUNDLE_RE)];

if (existingMatches.length > 0) {
  console.log(`Hittade ${existingMatches.length} befintlig(a) bundle-tag(s) — ersätter med ny hash`);
  // Replace ALL existing bundle-tags med EN ny tag (vid första positionen).
  // Det här är idempotent: kör en gång → 1 tag, kör igen → fortfarande 1 tag.
  const firstMatchStart = existingMatches[0].index;
  // Bygg ny HTML utan alla befintliga bundle-tags
  let stripped = html;
  // Iterera baklänges så indices inte ändras
  for (let i = existingMatches.length - 1; i >= 0; i--) {
    const mm = existingMatches[i];
    stripped = stripped.slice(0, mm.index) + stripped.slice(mm.index + mm[0].length);
  }
  // Insertera ny bundle-tag vid första matchningens position (men i strippad HTML)
  // Räkna om position: alla matches före första-pos är 0, så firstMatchStart är OK
  const newTag = `\n    <!-- Bundlade scripts: byggt av bin/build-bundle.js (content-hash: ${latest.hash}) -->\n    <script src="${newBundleRel}"></script>\n    `;
  newHtml = stripped.slice(0, firstMatchStart) + newTag + stripped.slice(firstMatchStart);
} else {
  // 3. Ingen befintlig bundle — hitta script-block med >5 taggar och ersätt
  const SCRIPT_BLOCK_RE = /(\s*<script\s+src="\.\/[^"]+"\s*><\/script>\s*){5,}/g;
  let target = null;
  let bestCount = 0;
  let m;
  while ((m = SCRIPT_BLOCK_RE.exec(html)) !== null) {
    const count = (m[0].match(/<script/g) || []).length;
    if (count > bestCount) {
      bestCount = count;
      target = { start: m.index, end: m.index + m[0].length, raw: m[0], count };
    }
  }

  if (!target || target.count < 5) {
    console.error(
      'FEL: hittade inget script-block med >5 taggar och ingen befintlig bundle-tag.'
    );
    process.exit(1);
  }

  console.log(
    `Mål-block: rad ${html.slice(0, target.start).split('\n').length}, ${target.count} script-taggar`
  );

  const BUNDLE_TAG = `\n    <!-- Bundlade scripts: ${target.count} filer → 1, byggt av bin/build-bundle.js (content-hash: ${latest.hash}) -->\n    <script src="${newBundleRel}"></script>\n    `;
  newHtml = html.slice(0, target.start) + BUNDLE_TAG + html.slice(target.end);
}

if (newHtml === html) {
  console.log('Ingen ändring behövs — index.html pekar redan på senaste bundle.');
  process.exit(0);
}

fs.writeFileSync(INDEX_HTML, newHtml);

console.log(`✓ Index.html uppdaterad → ${newBundleRel}`);
console.log(`Bytes före: ${html.length}`);
console.log(`Bytes efter: ${newHtml.length} (${newHtml.length - html.length >= 0 ? '+' : ''}${newHtml.length - html.length})`);
console.log(
  '\nNästa steg: hard-reload i Chrome + kör verify-three-features.js + verify-demo-fixtures.js'
);
console.log('Om något bryter: git checkout -- public/major-arcana-preview/index.html');
