#!/usr/bin/env node
'use strict';

/**
 * ORD-10 — Kunder v9 visual restoration gate (static + module checks).
 *   npm run cco:verify-kunder-v9-visual
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const KUNDER = path.join(REPO, 'public/kunder.html');
const REAL_JS = path.join(REPO, 'public/cco-kunder-real.js');
const MOCKUP = path.join(REPO, 'uploads/CCO-Kunder-Mockup-v9-DESKTOP.html');
const PLAN = path.join(REPO, 'docs/strategy/CCO-KUNDER-V9-VISUAL-RESTORATION-PLAN-2026-06-04.md');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const html = fs.readFileSync(KUNDER, 'utf8');
const js = fs.readFileSync(REAL_JS, 'utf8');

const customersStart = html.indexOf('<section class="customers-shell">');
let customersHtml = html;
if (customersStart >= 0) {
  const closeIdx = html.indexOf('</section>', customersStart);
  customersHtml = closeIdx >= 0 ? html.slice(customersStart, closeIdx + '</section>'.length) : html;
}

const V9_SHELL = [
  'app-grid',
  'side-shell',
  'customers-surface',
  'agg-insights',
  'customer-row-head',
  'intel-shell',
  'agg-shell',
  'dossier-head',
];

if (!html.includes('story-grid') && !html.includes('data-kunder-agg-insights')) {
  fail('kunder.html saknar story-grid eller data-kunder-agg-insights');
} else {
  pass('v9 insights host (story-grid eller agg-insights real)');
}

for (const cls of V9_SHELL) {
  if (!html.includes(cls)) fail(`kunder.html saknar v9-shell: .${cls}`);
  else pass(`v9-shell .${cls}`);
}

if (!fs.existsSync(MOCKUP))
  fail('canonical mockup saknas: uploads/CCO-Kunder-Mockup-v9-DESKTOP.html');
else pass('canonical mockup uploads/');

if (!fs.existsSync(PLAN)) fail('restoration plan doc saknas');
else pass('CCO-KUNDER-V9-VISUAL-RESTORATION-PLAN');

if (html.includes('data-kunder-story-grid')) pass('story-grid host data-kunder-story-grid');
else if (html.includes('data-kunder-agg-insights')) pass('agg-insights host data-kunder-agg-insights (ORD-12)');
else if (html.includes('data-kunder-story-grid')) pass('story-grid host data-kunder-story-grid (ORD-12 P1)');
else fail('insights host saknas');

if (!html.includes('grid-template-columns: 200px minmax(0, 1fr) 360px')) {
  fail('app-grid saknar v9 200/1fr/360 kolumner');
} else {
  pass('app-grid 200px / 1fr / 360px');
}

const blocked = [
  { re: /\bCUSTOMER_ROWS\b/, label: 'CUSTOMER_ROWS' },
  { re: /1\s*247/, label: 'mock 1247' },
  { re: /49\s*MSEK/, label: 'mock 49 MSEK' },
  { re: /485\s*200\s*kr/, label: 'mock 485200' },
  { re: /Anna Karlsson/, label: 'Anna Karlsson' },
  { re: /agg-insight-body/, label: 'mock agg-insight-body' },
  { re: /agg-ai-list/, label: 'mock agg-ai-list' },
  { re: /AI-åtgärd startad/, label: 'fake AI toast' },
  { re: /drive\.google\.com/, label: 'Drive URL' },
  { re: /Snitt LTV:\s*24\s*800/, label: 'mock Snitt LTV pill' },
  { re: /watch-widget" id="watchWidget"/, label: 'watch widget markup' },
  { re: /voice-sheet-original/, label: 'voice mock sheet' },
];

for (const { re, label } of blocked) {
  if (re.test(customersHtml)) fail(`customers-shell: ${label}`);
  else pass(`customers-shell utan ${label}`);
}

if (!js.includes('renderAggInsights') && !js.includes('renderStoryCards')) {
  fail('cco-kunder-real.js saknar renderAggInsights/renderStoryCards');
} else {
  pass('renderAggInsights / renderStoryCards');
}

if (!js.includes('topStoryRiskPatients') || !js.includes('STORY_RISK_RULE_IDS')) {
  fail('cco-kunder-real.js saknar ORD-12 P1 story-list wiring');
} else {
  pass('ORD-12 P1 story-list helpers');
}

if (!js.includes('story-list') || !js.includes('Data saknas')) {
  fail('cco-kunder-real.js saknar story-list / Data saknas fallback');
} else {
  pass('story-list + Data saknas i real.js');
}

if (!js.includes('data-kunder-story-grid')) fail('cco-kunder-real.js binder inte story-grid');
else pass('cco-kunder-real.js story-grid');

if (!js.includes('data-kunder-population-chart') || !js.includes('kunder-population-chart')) {
  fail('cco-kunder-real.js saknar population chart');
} else {
  pass('cco-kunder-real.js population chart');
}

if (!js.includes('CcoKunderSmartNextStep')) fail('cco-kunder-real.js saknar Smart Nästa Steg');
else pass('Smart Nästa Steg i real.js');

if (!js.includes('dossier-smart-next') && !js.includes('renderPanel')) {
  fail('dossier smart-next wiring saknas');
} else {
  pass('dossier smart-next wiring');
}

if (!html.includes("getElementById('customerList')")) {
  fail('kalender-demo guard saknas i kunder.html');
} else {
  pass('kalender-demo guard (customerList)');
}

if (!js.includes("classList.add('kunder-v9')")) fail('body.kunder-v9 saknas');
else pass('body.kunder-v9');

if (!js.includes('story-card-headline')) fail('cco-kunder-real.js saknar story-card-headline');
else pass('story-card-headline i render');

const renderStoryBlock = js.slice(js.indexOf('function renderStoryCards'), js.indexOf('function renderRightPanel'));
const storyKinds = ['idag', 'risker', 'mojligheter', 'klart'];
for (const kind of storyKinds) {
  if (!renderStoryBlock.includes(`data-kind="${kind}"`)) fail(`renderStoryCards saknar data-kind="${kind}"`);
}
pass('renderStoryCards: 4 story-kinds (Idag/Risker/Möjligheter/Klar)');

const chartBlock = js.slice(js.indexOf('function populationChartHtml'), js.indexOf('function automationInsightsHtml'));
const chartSlices = (chartBlock.match(/\{\s*label:/g) || []).length;
if (chartSlices < 6) fail(`populationChartHtml: förväntat ≥6 population slices, hittade ${chartSlices}`);
else pass(`populationChartHtml: ${chartSlices} population slices`);

if (!js.includes('function aggregateAutomationInsights')) fail('aggregateAutomationInsights saknas');
else pass('aggregateAutomationInsights');

if (!js.includes('function automationInsightsHtml')) fail('automationInsightsHtml saknas');
else pass('automationInsightsHtml');

const aiRowInTemplate = (js.match(/class="agg-ai-row/g) || []).length;
if (aiRowInTemplate < 3) fail(`automationInsightsHtml: förväntat ≥3 agg-ai-row, hittade ${aiRowInTemplate}`);
else pass(`automationInsightsHtml: ${aiRowInTemplate} agg-ai-row-mallar`);

if (!js.includes('Data saknas')) fail('cco-kunder-real.js saknar "Data saknas" fallback');
else pass('"Data saknas" fallback');

if (!html.includes('kunder-v9-insights')) fail('kunder.html saknar .kunder-v9-insights override host');
else pass('kunder-v9-insights CSS host');

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log('\nAll ORD-10 Kunder v9 visual checks passed.');
