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
  'story-grid',
  'customer-row-head',
  'intel-shell',
  'agg-shell',
  'dossier-head',
];

for (const cls of V9_SHELL) {
  if (!html.includes(cls)) fail(`kunder.html saknar v9-shell: .${cls}`);
  else pass(`v9-shell .${cls}`);
}

if (!fs.existsSync(MOCKUP))
  fail('canonical mockup saknas: uploads/CCO-Kunder-Mockup-v9-DESKTOP.html');
else pass('canonical mockup uploads/');

if (!fs.existsSync(PLAN)) fail('restoration plan doc saknas');
else pass('CCO-KUNDER-V9-VISUAL-RESTORATION-PLAN');

if (!html.includes('data-kunder-story-grid')) {
  fail('story-grid host data-kunder-story-grid saknas');
} else {
  pass('story-grid host för real data');
}

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

if (!js.includes('renderStoryCards')) fail('cco-kunder-real.js saknar renderStoryCards');
else pass('renderStoryCards');

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

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log('\nAll ORD-10 Kunder v9 visual checks passed.');
