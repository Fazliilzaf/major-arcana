#!/usr/bin/env node
/**
 * scripts/inventory-kunder-html-features.js
 *
 * ORD-17 DEL B.1 prep: inventerar features i /kunder.html (legacy v9-experiment)
 * mot preview-SPA för att kontrollera vad som måste portas innan radering.
 *
 * Användning:
 *   node scripts/inventory-kunder-html-features.js
 *
 * Output: lista av features per status:
 *   ✅ porterat (finns i preview-SPA)
 *   ❌ saknas (måste porteras INNAN /kunder.html raderas)
 *   ⚠ partial (delvis porterat)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const KUNDER_HTML = path.join(ROOT, 'public/kunder.html');
const PREVIEW_DIR = path.join(ROOT, 'public/major-arcana-preview');
const PREVIEW_INDEX = path.join(PREVIEW_DIR, 'index.html');

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return '';
  }
}

function fileExists(p) {
  try {
    return fs.statSync(p).isFile();
  } catch (_) {
    return false;
  }
}

const results = [];

function check(feature, source, foundInPreview, detail) {
  const status = foundInPreview === true ? '✅' : foundInPreview === 'partial' ? '⚠' : '❌';
  results.push({ status, feature, source, detail });
}

function main() {
  console.log('# ORD-17 DEL B.1 — /kunder.html feature-inventering\n');

  if (!fileExists(KUNDER_HTML)) {
    console.log('OBS: public/kunder.html finns inte — antingen redan raderad eller fel path.');
    console.log('Inventeringen ger 0 resultat. Kontrollera path.');
    return;
  }

  const kunderHtml = readFile(KUNDER_HTML);
  const previewIndex = readFile(PREVIEW_INDEX);
  const previewCustomersCss = readFile(path.join(PREVIEW_DIR, 'cco-v9-customers.css'));
  const patientMasterUi = readFile(path.join(PREVIEW_DIR, 'app/patient-master-ui.js'));

  // ORD-18: Smart Next + Capability-matrix portas via SPA-bundle, läs senaste bundle
  let bundleContent = '';
  try {
    const latestPath = path.join(PREVIEW_DIR, 'app.bundle.latest.json');
    if (fileExists(latestPath)) {
      const latest = JSON.parse(readFile(latestPath));
      if (latest.filename) {
        bundleContent = readFile(path.join(PREVIEW_DIR, latest.filename));
      }
    }
  } catch (_) {
    /* silent — bundle är optional för inventering */
  }

  const previewBlob = [previewIndex, previewCustomersCss, patientMasterUi, bundleContent].join(
    '\n'
  );

  // 1. Smart Nästa Steg (cco-kunder-smart-next-step.js)
  const hasSmartNextSpa = /smart-next-step|smartNextStep|SmartNextStep/.test(previewBlob);
  check(
    'Smart Nästa Steg',
    'cco-kunder-smart-next-step.js',
    hasSmartNextSpa,
    hasSmartNextSpa ? 'Hittad i preview-SPA' : 'MÅSTE PORTAS innan radering'
  );

  // 2. 4 agg-cards (Idag / Möjlighet / Trend / Risk)
  const hasAggCardsSpa = /agg-insight/.test(previewBlob);
  check(
    '4 agg-cards (Idag/Möjlighet/Trend/Risk)',
    'kunder.html .agg-insights',
    hasAggCardsSpa,
    hasAggCardsSpa ? 'Porterat i ORD-16 steg 6' : 'SAKNAS'
  );

  // 3. Watch-frame "NÄSTA"
  const hasWatchFrameSpa = /watch-frame|watchframe|watch-widget/.test(previewBlob);
  check(
    'Watch-frame "NÄSTA"',
    'kunder.html .watch-frame',
    hasWatchFrameSpa,
    hasWatchFrameSpa ? 'Hittad i preview-SPA' : 'PORTAS I ORD-16 STEG 10 (kommande)'
  );

  // 4. Capability-matrix (cco-kunder-actions.js)
  const hasCapMatrixSpa = /capability|buildMatrix|CcoKunderActions/.test(previewBlob);
  check(
    'Capability-matrix',
    'cco-kunder-actions.js',
    hasCapMatrixSpa,
    hasCapMatrixSpa ? 'Hittad i preview-SPA' : 'MÅSTE PORTAS innan radering'
  );

  // 5. Filter-chips (kunder.html canonical)
  const hasFilterChipsSpa = /v9FlagFilter|data-v9-flag-filter|filter-chip/.test(previewBlob);
  check(
    'Filter-chips (Alla/Aktiva/VIP/Risk/Nya/Dormant)',
    'kunder.html .filter-chip',
    hasFilterChipsSpa,
    hasFilterChipsSpa ? 'Porterat i ORD-16 steg 3' : 'SAKNAS'
  );

  // 6. Segment-sidemy (SEGMENT/BEHANDLING/STATUS)
  const hasSidebarSpa = /v9-segment-sidebar|data-v9-segment/.test(previewBlob);
  check(
    'Segment-sidebar (SEGMENT/BEHANDLING/STATUS)',
    'kunder.html .segment-sidebar',
    hasSidebarSpa,
    hasSidebarSpa ? 'Porterat i ORD-16 steg 5' : 'SAKNAS'
  );

  // 7. Customer-row layout
  const hasRowSpa = /cr-avatar|cr-name-block/.test(previewBlob);
  check(
    'Customer-row layout (avatar/namn/badges/AI)',
    'kunder.html .customer-row',
    hasRowSpa,
    hasRowSpa ? 'Porterat i ORD-16 steg 4' : 'SAKNAS'
  );

  // 8. Dossier-hero
  const hasHeroSpa = /v9-dossier-hero|dossier-hero/.test(previewBlob);
  check(
    'Dossier-hero (avatar + Smart Next Step)',
    'kunder.html dossier head',
    hasHeroSpa,
    hasHeroSpa ? 'Porterat i ORD-16 steg 7' : 'SAKNAS'
  );

  // 9. Dossier pill-tabs
  const hasTabsSpa = /v9-dossier-tabs|data-v9-tab-accent/.test(previewBlob);
  check(
    'Dossier pill-tabs (6 tabs)',
    'kunder.html dossier tabs',
    hasTabsSpa,
    hasTabsSpa ? 'Porterat i ORD-16 steg 8' : 'SAKNAS'
  );

  // 10. Aggregate-vy (höger default)
  const hasAggregateSpa = /v9-aggregate-panel|data-v9-aggregate-panel/.test(previewBlob);
  check(
    'Höger aggregat-vy default',
    'kunder.html right-panel',
    hasAggregateSpa,
    hasAggregateSpa ? 'Porterat i ORD-16 steg 9' : 'SAKNAS'
  );

  // Render-resultat
  const groups = { '✅': [], '❌': [], '⚠': [] };
  for (const r of results) groups[r.status].push(r);

  console.log(`## ✅ Porterade (${groups['✅'].length})`);
  for (const r of groups['✅'])
    console.log(`  ${r.status} ${r.feature} (${r.source}) — ${r.detail}`);

  console.log(`\n## ❌ Saknas (${groups['❌'].length})`);
  if (groups['❌'].length === 0) {
    console.log('  Inget saknas! /kunder.html kan raderas säkert.');
  } else {
    for (const r of groups['❌'])
      console.log(`  ${r.status} ${r.feature} (${r.source}) — ${r.detail}`);
  }

  console.log(`\n## ⚠ Partial (${groups['⚠'].length})`);
  for (const r of groups['⚠'])
    console.log(`  ${r.status} ${r.feature} (${r.source}) — ${r.detail}`);

  const safeToDelete = groups['❌'].length === 0;
  console.log(`\n## Slutsats`);
  console.log(`Safe to delete /kunder.html: ${safeToDelete ? 'YES' : 'NO'}`);
  if (!safeToDelete) {
    console.log(
      `(${groups['❌'].length} features saknas — porta dem först, sen kör ORD-17 DEL B.2-B.3)`
    );
  }

  process.exit(safeToDelete ? 0 : 1);
}

main();
