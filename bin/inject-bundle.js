#!/usr/bin/env node
/**
 * bin/inject-bundle.js — uppdaterar index.html med senaste hashade bundle.
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

if (!fs.existsSync(LATEST_JSON)) {
  console.error('FEL: app.bundle.latest.json saknas. Kör bin/build-bundle.js först.');
  process.exit(1);
}
const latest = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8'));
const newBundleRel = `./${latest.filename}`;
console.log(`Senaste bundle: ${latest.filename} (hash=${latest.hash})`);

const html = fs.readFileSync(INDEX_HTML, 'utf8');

const EXISTING_BUNDLE_RE =
  /\s*(?:<!--[^>]*Bundlade scripts[^>]*-->\s*)?<script\s+src="\.\/app\.bundle(?:\.[a-f0-9]+)?(?:\.min)?\.js(?:\?[^"]*)?"\s*><\/script>\s*/g;
const EXISTING_PRELOAD_RE =
  /\s*<!-- Bundlade scripts preload[^>]*-->\s*\n?(?:\s*<link\s+rel="preload"\s+as="script"\s+href="\.\/[^"]+"\s*\/?>\s*)+/g;
const EARLY_PATIENT_UI_RE =
  /\s*<!-- Early patient-master-ui[^>]*-->\s*\n?\s*<script(?:\s+async)?\s+src="\.\/app\/patient-master-ui\.js[^"]*"\s*><\/script>\s*/g;
const PATIENT_UI_PRELOAD = './app/patient-master-ui.js?v=build-sweep-i';

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

function injectEarlyPatientUiScript(html) {
  const tag = `\n                  <!-- Early patient-master-ui (async): blockar inte HTML parse efter skeleton -->\n                  <script async src="${PATIENT_UI_PRELOAD}"></script>\n`;
  if (EARLY_PATIENT_UI_RE.test(html)) {
    EARLY_PATIENT_UI_RE.lastIndex = 0;
    return html.replace(EARLY_PATIENT_UI_RE, tag);
  }
  const anchor = /<\/script>\s*\n\s*<div data-patient-identity-rail hidden>/;
  if (anchor.test(html)) {
    return html.replace(anchor, `</script>${tag}\n<div data-patient-identity-rail hidden>`);
  }
  return html;
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
const withEarlyPatientUi = injectEarlyPatientUiScript(withPreload);

if (withEarlyPatientUi === html) {
  console.log('Ingen ändring behövs — index.html pekar redan på senaste bundle.');
  process.exit(0);
}

fs.writeFileSync(INDEX_HTML, withEarlyPatientUi);

console.log(`✓ Index.html uppdaterad → ${newBundleRel}`);
