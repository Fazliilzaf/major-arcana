#!/usr/bin/env node
/**
 * scripts/verify-ord16-progress.js
 *
 * Regress-test för ORD-16 v9-portering (SPA preview → mockup-design).
 * Testar prod (Frankfurt) per steg 1-10. Default: hämtar prod.
 * För lokal test: VERIFY_BASE=http://localhost:3000 node scripts/verify-ord16-progress.js
 *
 * Steg-status:
 *   1. flag + tokens (filer 200, default off)
 *   2. toolbar + status pills (5 pills, real counts)
 *   3. filter-chips (5 chips, real counts, klick-toggle)
 *   4. v9 customer-row (60 rader, BEM .cr-*, real data)
 *   5. segment-sidebar (13 segments, real counts)
 *   6. agg-cards (4 cards med kicker/body/action)
 *   7. dossier-hero (avatar + namn + kontakt + smart-next-pill)
 *   8. dossier-body (tabs porterade)
 *   9. höger aggregat-vy
 *  10. watch-frame + mobile
 */
'use strict';

const https = require('node:https');

const BASE = process.env.VERIFY_BASE || 'https://arcana.hairtpclinic.com';
const PREVIEW = `${BASE}/major-arcana-preview`;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      })
      .on('error', reject);
  });
}

async function headStatus(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => resolve(res.statusCode));
    req.on('error', reject);
    req.end();
  });
}

const results = [];
function record(step, name, pass, detail) {
  results.push({ step, name, pass, detail });
}

async function step1Filesistatus() {
  const files = ['app/cco-v9-flag.js', 'cco-v9-tokens.css', 'cco-v9-customers.css'];
  let allOk = true;
  const detail = [];
  for (const f of files) {
    const code = await headStatus(`${PREVIEW}/${f}`);
    detail.push(`${f}=${code}`);
    if (code !== 200) allOk = false;
  }
  record(1, 'files 200', allOk, detail.join(' | '));
}

async function step1FlagDefaultOff() {
  const { body } = await fetchText(`${PREVIEW}/?view=customers`);
  const hasFlagScript = /cco-v9-flag\.js/.test(body);
  const hasTokens = /cco-v9-tokens\.css/.test(body);
  record(
    1,
    'index.html mountar flag+tokens',
    hasFlagScript && hasTokens,
    `flag=${hasFlagScript} tokens=${hasTokens}`
  );
}

async function step2ToolbarMarkup() {
  const { body } = await fetchText(`${PREVIEW}/?view=customers`);
  const hasCount = /data-v9-customer-count/.test(body);
  const cmdCount = (body.match(/data-customer-command="[^"]+"/g) || []).length;
  record(
    2,
    'toolbar markup',
    hasCount && cmdCount >= 4,
    `count-attr=${hasCount} commands=${cmdCount}`
  );
}

async function step3ChipsMarkup() {
  const { body } = await fetchText(`${PREVIEW}/?view=customers`);
  const flagCount = (body.match(/data-v9-flag-filter|data-flag-filter/g) || []).length;
  record(3, 'chip-markup live', flagCount >= 5, `chip-attrs=${flagCount}`);
}

async function step4RowMarkup() {
  const { body } = await fetchText(`${PREVIEW}/cco-v9-customers.css`);
  const hasRowCss = /\.cr-avatar|\.cr-name-block/.test(body);
  record(4, 'row BEM-CSS finns', hasRowCss, `cr-css=${hasRowCss}`);
}

async function step5SidebarMarkup() {
  const { body } = await fetchText(`${PREVIEW}/cco-v9-customers.css`);
  const hasSidebar = /customers-v9-segment-sidebar|v9-segment/.test(body);
  record(5, 'segment-sidebar CSS', hasSidebar, `sidebar-css=${hasSidebar}`);
}

async function step6AggCards() {
  const { body } = await fetchText(`${PREVIEW}/cco-v9-customers.css`);
  const hasAgg = /agg-insight|v9-insight/.test(body);
  record(6, 'agg-insight CSS', hasAgg, `agg-css=${hasAgg}`);
}

async function step7DossierHero() {
  const { body } = await fetchText(`${PREVIEW}/cco-v9-customers.css`);
  const hasHero = /dossier-hero|v9-dossier/.test(body);
  record(7, 'dossier-hero CSS', hasHero, `hero-css=${hasHero}`);
}

async function step8DossierBodyTabs() {
  const css = (await fetchText(`${PREVIEW}/cco-v9-customers.css`)).body;
  const js = (await fetchText(`${PREVIEW}/app/patient-master-ui.js?v=build-bundle-split-a`)).body;
  const hasCss =
    /\.v9-dossier-tabs/.test(css) &&
    /\[data-v9-tab-accent="studio"\]/.test(css) &&
    /\.v9-dossier-body/.test(css);
  const hasJs =
    /V9_DOSSIER_TABS/.test(js) &&
    /renderV9DossierTabs/.test(js) &&
    /data-patient-tab-panel="anteckningar"/.test(js);
  record(8, 'dossier-body pill tabs', hasCss && hasJs, `css=${hasCss} js=${hasJs}`);
}

async function step9AggregatePanel() {
  const css = (await fetchText(`${PREVIEW}/cco-v9-customers.css`)).body;
  const js = (await fetchText(`${PREVIEW}/app/patient-master-ui.js?v=build-bundle-split-a`)).body;
  const hasCss = /\.v9-aggregate-panel/.test(css) && /\.agg-ai-list/.test(css);
  const hasJs =
    /renderV9AggregatePanel/.test(js) && /data-v9-aggregate-panel/.test(js) && /Snitt LTV/.test(js);
  record(9, 'right aggregate panel', hasCss && hasJs, `css=${hasCss} js=${hasJs}`);
}

async function backendDiag() {
  const { body } = await fetchText(`${BASE}/api/v1/_diag/version`);
  let commit = 'unknown';
  try {
    commit = JSON.parse(body).commit?.slice(0, 8) || 'unknown';
  } catch (_) {}
  record(0, 'backend commit', true, commit);
}

async function main() {
  console.log(`# ORD-16 progress against ${BASE}\n`);

  await backendDiag();
  await step1Filesistatus();
  await step1FlagDefaultOff();
  await step2ToolbarMarkup();
  await step3ChipsMarkup();
  await step4RowMarkup();
  await step5SidebarMarkup();
  await step6AggCards();
  await step7DossierHero();
  await step8DossierBodyTabs();
  await step9AggregatePanel();

  let pass = 0,
    fail = 0;
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗';
    console.log(`[step ${r.step}] ${mark} ${r.name} — ${r.detail}`);
    if (r.pass) pass++;
    else fail++;
  }
  console.log(`\nResult: ${pass} pass · ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
