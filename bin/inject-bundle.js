#!/usr/bin/env node
/**
 * bin/inject-bundle.js — uppdaterar index.html med senaste hashade bundle.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'public/major-arcana-preview/index.html');
const LATEST_JSON = path.join(ROOT, 'public/major-arcana-preview/app.bundle.latest.json');

const CACHE_BUST = 'v12-real-customer-surface-v1';
const PATIENT_UI_PRELOAD = `./app/patient-master-ui.js?v=${CACHE_BUST}`;
const MOBILE_DEEPLINK_BOOT = `./app/mobile-deeplink-boot.js?v=${CACHE_BUST}`;

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
const staffCoreRel = latest.staffCore ? `./${latest.staffCore.filename}` : null;
const staffDeferredRel = latest.staffDeferred ? `./${latest.staffDeferred.filename}` : null;
console.log(`Senaste bundle: ${latest.filename} (hash=${latest.hash})`);
if (staffCoreRel) {
  console.log(`Staff core:     ${latest.staffCore.filename} (${latest.staffCore.minBytes} bytes)`);
  console.log(
    `Staff deferred: ${latest.staffDeferred.filename} (${latest.staffDeferred.minBytes} bytes)`
  );
}

const html = fs.readFileSync(INDEX_HTML, 'utf8');

const EXISTING_BUNDLE_RE =
  /\s*(?:<!--[^>]*Bundlade scripts[^>]*-->\s*)?(?:<script\s+src="\.\/app\.bundle(?:\.[a-z0-9-]+)?(?:\.[a-f0-9]+)?(?:\.min)?\.js(?:\?[^"]*)?"\s*><\/script>|<script>\s*\(function arcanaLoadAppBundle\(\)[\s\S]*?\}\)\(\);\s*<\/script>)\s*/g;
const EXISTING_PRELOAD_RE =
  /\s*<!-- Bundlade scripts preload[^>]*-->\s*\n?(?:\s*<link\s+rel="preload"\s+as="script"\s+href="\.\/[^"]+"\s*\/?>\s*)+/g;
const BUNDLE_URLS_RE =
  /\s*<!-- ARCANA bundle URLs[^>]*-->\s*\n?\s*<script>\s*window\.__ARCANA_BUNDLE_URLS__[\s\S]*?<\/script>\s*/g;
const BUNDLE_PRELOAD_SCRIPT_RE =
  /\s*<!-- ARCANA bundle preload[^>]*-->\s*\n?\s*<script>\s*\(function arcanaPreloadBundle\(\)[\s\S]*?<\/script>\s*/g;
const EARLY_PATIENT_UI_RE =
  /\s*<!-- Early patient-master-ui[^>]*-->\s*\n?\s*<script(?:\s+async)?\s+src="\.\/app\/patient-master-ui\.js[^"]*"\s*><\/script>\s*/g;

function buildBundleUrlsBlock(latestInfo) {
  const urls = {
    full: `./${latestInfo.filename}`,
    staffCore: latestInfo.staffCore ? `./${latestInfo.staffCore.filename}` : null,
    staffDeferred: latestInfo.staffDeferred ? `./${latestInfo.staffDeferred.filename}` : null,
  };
  return `\n    <!-- ARCANA bundle URLs (content-hash: ${latestInfo.hash}) -->\n    <script>window.__ARCANA_BUNDLE_URLS__=${JSON.stringify(urls)};</script>\n    `;
}

function buildBundlePreloadScript(latestInfo) {
  const full = `./${latestInfo.filename}`;
  const core = latestInfo.staffCore ? `./${latestInfo.staffCore.filename}` : full;
  const hasSplit = Boolean(latestInfo.staffCore);
  return `\n    <!-- ARCANA bundle preload (content-hash: ${latestInfo.hash}) -->\n    <script>\n      (function arcanaPreloadBundle() {\n        try {\n          var href = '${full}';\n          var mobile = window.matchMedia('(max-width: 768px)').matches;\n          var view = String(new URLSearchParams(window.location.search || '').get('view') || 'customers').trim();\n          if (${hasSplit ? 'true' : 'false'} && mobile && view === 'customers') {\n            href = '${core}';\n            window.__ARCANA_STAFF_BUNDLE_SPLIT__ = true;\n            window.__ARCANA_DEFER_APP_BUNDLE__ = true;\n          }\n          var link = document.createElement('link');\n          link.rel = 'preload';\n          link.as = 'script';\n          link.href = href;\n          document.head.appendChild(link);\n        } catch (preloadError) {\n          /* best-effort */\n        }\n      })();\n    </script>\n    `;
}

function injectHeadBundleMeta(html, latestInfo) {
  const urlsBlock = buildBundleUrlsBlock(latestInfo);
  const preloadScript = buildBundlePreloadScript(latestInfo);
  const staticPreload = `\n    <!-- Bundlade scripts preload (content-hash: ${latestInfo.hash}) -->\n    <link rel="preload" as="script" href="${MOBILE_DEEPLINK_BOOT}" />\n    <link rel="preload" as="script" href="${PATIENT_UI_PRELOAD}" />\n    `;

  let out = html;
  if (BUNDLE_URLS_RE.test(out)) {
    BUNDLE_URLS_RE.lastIndex = 0;
    out = out.replace(BUNDLE_URLS_RE, urlsBlock);
  } else if (BUNDLE_PRELOAD_SCRIPT_RE.test(out)) {
    BUNDLE_PRELOAD_SCRIPT_RE.lastIndex = 0;
    out = out.replace(BUNDLE_PRELOAD_SCRIPT_RE, urlsBlock + preloadScript);
  } else if (EXISTING_PRELOAD_RE.test(out)) {
    EXISTING_PRELOAD_RE.lastIndex = 0;
    out = out.replace(EXISTING_PRELOAD_RE, urlsBlock + preloadScript + staticPreload);
  } else {
    const charsetMeta = /<meta charset="UTF-8"\s*\/?>/;
    if (charsetMeta.test(out)) {
      out = out.replace(charsetMeta, `$&${urlsBlock}${preloadScript}${staticPreload}`);
    }
  }

  out = out.replace(
    /href="\.\/app\/mobile-deeplink-boot\.js\?v=[^"]+"/g,
    `href="${MOBILE_DEEPLINK_BOOT}"`
  );
  out = out.replace(
    /src="\.\/app\/mobile-deeplink-boot\.js\?v=[^"]+"/g,
    `src="${MOBILE_DEEPLINK_BOOT}"`
  );
  out = out.replace(
    /href="\.\/app\/patient-master-ui\.js\?v=[^"]+"/g,
    `href="${PATIENT_UI_PRELOAD}"`
  );
  out = out.replace(
    /src="\.\/app\/patient-master-ui\.js\?v=[^"]+"/g,
    `src="${PATIENT_UI_PRELOAD}"`
  );

  return out;
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

function buildDeferredBundleLoaderTag(latestInfo) {
  const fullRel = `./${latestInfo.filename}`;
  const coreRel = latestInfo.staffCore ? `./${latestInfo.staffCore.filename}` : '';
  const deferRel = latestInfo.staffDeferred ? `./${latestInfo.staffDeferred.filename}` : '';
  return `\n    <!-- Bundlade scripts: byggt av bin/build-bundle.js (content-hash: ${latestInfo.hash}) -->\n    <script>\n      (function arcanaLoadAppBundle() {\n        var urls = window.__ARCANA_BUNDLE_URLS__ || {};\n        var fullSrc = urls.full || '${fullRel}';\n        var coreSrc = urls.staffCore || '${coreRel}';\n        var deferSrc = urls.staffDeferred || '${deferRel}';\n\n        function injectScript(src, onload) {\n          var script = document.createElement('script');\n          script.src = src;\n          script.async = false;\n          if (onload) script.onload = onload;\n          document.body.appendChild(script);\n        }\n\n        function injectDeferredChunk() {\n          if (!deferSrc || window.__ARCANA_STAFF_DEFERRED_LOADING__) return;\n          window.__ARCANA_STAFF_DEFERRED_LOADING__ = true;\n          injectScript(deferSrc);\n        }\n        window.__ARCANA_LOAD_STAFF_DEFERRED__ = injectDeferredChunk;\n\n        function inject() {\n          if (window.__ARCANA_APP_BUNDLE_LOADING__) return;\n          window.__ARCANA_APP_BUNDLE_LOADING__ = true;\n\n          var useSplit = !!(window.__ARCANA_STAFF_BUNDLE_SPLIT__ && coreSrc && deferSrc);\n          if (useSplit) {\n            injectScript(coreSrc, function () {\n              if (typeof requestIdleCallback === 'function') {\n                requestIdleCallback(injectDeferredChunk, { timeout: 5000 });\n              } else {\n                window.setTimeout(injectDeferredChunk, 80);\n              }\n            });\n            return;\n          }\n          injectScript(fullSrc);\n        }\n\n        if (window.__ARCANA_DEFER_APP_BUNDLE__) {\n          var loaded = false;\n          function finish() {\n            if (loaded) return;\n            loaded = true;\n            inject();\n          }\n          window.addEventListener('arcana-deeplink-detail-ready', finish, { once: true });\n          window.addEventListener(\n            'DOMContentLoaded',\n            function () {\n              if (typeof requestIdleCallback === 'function') {\n                requestIdleCallback(finish, { timeout: 1600 });\n              } else {\n                window.setTimeout(finish, 120);\n              }\n            },\n            { once: true }\n          );\n          window.setTimeout(finish, 3200);\n          if (window.__ARCANA_DEEPLINK_HYDRATED__) finish();\n        } else {\n          inject();\n        }\n      })();\n    </script>\n    `;
}

let newHtml = html;
const existingMatches = [...html.matchAll(EXISTING_BUNDLE_RE)];

if (existingMatches.length > 0) {
  console.log(
    `Hittade ${existingMatches.length} befintlig(a) bundle-tag(s) — ersätter med ny hash`
  );
  const firstMatchStart = existingMatches[0].index;
  let stripped = html;
  for (let i = existingMatches.length - 1; i >= 0; i--) {
    const mm = existingMatches[i];
    stripped = stripped.slice(0, mm.index) + stripped.slice(mm.index + mm[0].length);
  }
  const newTag = buildDeferredBundleLoaderTag(latest);
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
    console.error('FEL: hittade inget script-block med >5 taggar och ingen befintlig bundle-tag.');
    process.exit(1);
  }

  console.log(
    `Mål-block: rad ${html.slice(0, target.start).split('\n').length}, ${target.count} script-taggar`
  );

  const BUNDLE_TAG = `\n    <!-- Bundlade scripts: ${target.count} filer → 1, byggt av bin/build-bundle.js (content-hash: ${latest.hash}) -->\n    <script src="${newBundleRel}"></script>\n    `;
  newHtml = html.slice(0, target.start) + BUNDLE_TAG + html.slice(target.end);
}

const withHeadMeta = injectHeadBundleMeta(newHtml, latest);
const withEarlyPatientUi = injectEarlyPatientUiScript(withHeadMeta);

if (withEarlyPatientUi === html) {
  console.log('Ingen ändring behövs — index.html pekar redan på senaste bundle.');
  process.exit(0);
}

fs.writeFileSync(INDEX_HTML, withEarlyPatientUi);

console.log(`✓ Index.html uppdaterad → ${newBundleRel}`);
if (staffCoreRel) {
  console.log(`  Mobil split: ${staffCoreRel} + ${staffDeferredRel} (lazy)`);
}
