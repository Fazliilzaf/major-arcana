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
const EXISTING_BUNDLE_RE =
  /\s*(?:<!--[^>]*Bundlade scripts[^>]*-->\s*)?<script\s+src="\.\/app\.bundle(?:\.[a-f0-9]+)?(?:\.min)?\.js(?:\?[^"]*)?"\s*><\/script>\s*/g;
const EXISTING_PRELOAD_RE =
  /\s*<!-- Bundlade scripts preload[^>]*-->\s*\n?(?:\s*<link\s+rel="preload"\s+as="script"\s+href="\.\/[^"]+"\s*\/?>\s*)+/g;
const HEAD_PATIENT_UI_RE =
  /\s*<!-- Early patient-master-ui \(head\)[^>]*-->\s*\n?\s*<script\s+src="\.\/app\/patient-master-ui\.js[^"]*"\s*><\/script>\s*/g;
const BODY_PATIENT_UI_RE =
  /\s*<!-- Early patient-master-ui[^>]*-->\s*\n?\s*<script\s+src="\.\/app\/patient-master-ui\.js[^"]*"\s*><\/script>\s*/g;
const PATIENT_UI_PRELOAD = './app/patient-master-ui.js?v=build-sweep-h';

function injectBundlePreload(html, bundleRel, hash) {
  const preloadBlock = `\n    <!-- Bundlade scripts preload (content-hash: ${hash}) -->\n    <link rel="preload" as="script" href="${bundleRel}" />\n    <link rel="preload" as="script" href="${PATIENT_UI_PRELOAD}" />\n    `;
  if (EXISTING_PRELOAD_RE.test(html)) {
    EXISTING_PRELOAD_RE.lastIndex = 0;
    return html.replace(EXISTING_PRELOAD_RE, preloadBlock);
  }
  const charsetMeta = /<meta charset="UTF-8"\s*\/?>/;
  if (charsetMeta.test(html)) {
    return html.replace(charsetMeta, `$&${preloadBlock}`);
  }
  return html;
}

function injectHeadEarlyPatientUi(html) {
  const tag = `\n    <!-- Early patient-master-ui (head): mobil deep link -->\n    <script src="${PATIENT_UI_PRELOAD}"></script>\n`;
  if (HEAD_PATIENT_UI_RE.test(html)) {
    HEAD_PATIENT_UI_RE.lastIndex = 0;
    html = html.replace(HEAD_PATIENT_UI_RE, tag);
  } else {
    const anchor = /(<\/script>\s*\n\s*<meta\s*\n\s*name="viewport")/;
    if (anchor.test(html)) {
      html = html.replace(anchor, `</script>${tag}\n    <meta\n      name="viewport"`);
    }
  }
  BODY_PATIENT_UI_RE.lastIndex = 0;
  return html.replace(BODY_PATIENT_UI_RE, '\n');
}

let newHtml = html;
const existingMatches = [...html.matchAll(EXISTING_BUNDLE_RE)];

if (existingMatches.length > 0) {
  console.log(`Hittade ${existingMatches.length} befintlig(a) bundle-tag(s) — ersätter med ny hash`);
  const firstMatchStart = existingMatches[0].index;
  let stripped = html;
  for (let i = existingMatches.length - 1; i >= 0; i--) {
    const mm = existingMatches[i];
    stripped = stripped.slice(0, mm.index) + stripped.slice(mm.index + mm[0].length);
  }
  const newTag = `\n    <!-- Bundlade scripts: byggt av bin/build-bundle.js (content-hash: ${latest.hash}) -->\n    <script src="${newBundleRel}"></script>\n    `;
  newHtml = stripped.slice(0, firstMatchStart) + newTag + stripped.slice(firstMatchStart);
} else {
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

const withPreload = injectBundlePreload(newHtml, newBundleRel, latest.hash);
const withEarlyPatientUi = injectHeadEarlyPatientUi(withPreload);

if (withEarlyPatientUi === html) {
  console.log('Ingen ändring behövs — index.html pekar redan på senaste bundle.');
  process.exit(0);
}

fs.writeFileSync(INDEX_HTML, withEarlyPatientUi);

console.log(`✓ Index.html uppdaterad → ${newBundleRel}`);
console.log(`Bytes före: ${html.length}`);
console.log(`Bytes efter: ${withEarlyPatientUi.length} (${withEarlyPatientUi.length - html.length >= 0 ? '+' : ''}${withEarlyPatientUi.length - html.length})`);
console.log(
  '\nNästa steg: hard-reload i Chrome + kör verify-three-features.js + verify-demo-fixtures.js'
);
console.log('Om något bryter: git checkout -- public/major-arcana-preview/index.html');
