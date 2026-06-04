#!/usr/bin/env node
'use strict';

/**
 * ORD-10 prod screenshots — 7 v9 sections.
 *   node scripts/capture-kunder-v9-prod-screenshots.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const PROD_URL = process.env.PROD_URL || 'https://arcana.hairtpclinic.com/kunder.html';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'ops', 'screenshots', 'ord-10');

const SECTIONS = [
  { file: '01-topnav.png', selectors: ['.top-nav'], label: 'topnav' },
  { file: '02-side-shell.png', selectors: ['.side-shell'], label: 'side-shell' },
  {
    file: '03-story-cards.png',
    selectors: ['[data-kunder-story-grid]', '.agg-insights', '.customers-surface'],
    label: 'story-cards',
  },
  { file: '04-filters.png', selectors: ['.customers-filters'], label: 'filters' },
  { file: '05-customer-list.png', selectors: ['.customers-list'], label: 'customer-row' },
  {
    file: '06-agg-shell.png',
    selectors: ['.intel-shell .agg-shell', '.intel-booking-view', '.intel-shell'],
    label: 'agg-shell',
  },
];

async function shotElement(page, selectors, outPath) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    const el = page.locator(selector).first();
    if (!(await el.count())) continue;
    try {
      await el.screenshot({ path: outPath, timeout: 20000 });
      return selector;
    } catch {
      /* try next selector */
    }
  }
  throw new Error(`No screenshot for: ${list.join(' | ')}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'sv-SE',
  });
  const page = await context.newPage();
  await page.goto(PROD_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  for (const section of SECTIONS) {
    const outPath = path.join(OUT_DIR, section.file);
    const used = await shotElement(page, section.selectors, outPath);
    console.log(`OK ${section.file} (${section.label}) via ${used}`);
  }

  const dossierPath = path.join(OUT_DIR, '07-dossier.png');
  const row = page.locator('.customer-row').first();
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(1200);
    const dossierHead = page.locator('.intel-customer-view .dossier-head');
    if (await dossierHead.count()) {
      await dossierHead.screenshot({ path: dossierPath });
      console.log('OK 07-dossier.png (dossier open)');
    } else {
      await page.locator('.intel-customer-view').screenshot({ path: dossierPath });
      console.log('OK 07-dossier.png (intel-customer-view fallback)');
    }
  } else {
    await page.locator('.intel-shell').screenshot({ path: dossierPath });
    console.log('OK 07-dossier.png (intel-shell — ingen rad utan auth)');
  }

  await browser.close();
  console.log(`\nScreenshots: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
