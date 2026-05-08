#!/usr/bin/env node
// Puppeteer-baserad CSS coverage-runner för CCO-prevjen.
// Startar lokal preview, simulerar UI-interaktioner, fångar coverage
// via CDP, sparar JSON med använda byte-ranges per CSS-fil.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://localhost:3100/major-arcana-preview/';
const OUTPUT = path.join(__dirname, 'coverage-output.json');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeClick(page, selector, label) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    await el.click({ delay: 30 });
    console.log(`  click  ${label || selector}`);
    await sleep(150);
    return true;
  } catch (e) {
    console.log(`  skip   ${label || selector} (${e.message.slice(0, 50)})`);
    return false;
  }
}

async function safeClickAll(page, selector, label) {
  try {
    const els = await page.$$(selector);
    for (const el of els.slice(0, 5)) {
      try { await el.click({ delay: 20 }); await sleep(100); } catch (_e) {}
    }
    if (els.length) console.log(`  click× ${els.length} ${label || selector}`);
  } catch (_e) {}
}

async function exerciseUI(page) {
  console.log('Bootstrap-vänta…');
  await sleep(2000);

  console.log('Klicka i topbar (vyer)…');
  // Mer-menyn
  await safeClick(page, '[data-more-toggle]', 'mer-meny toggle');
  await sleep(300);
  await safeClickAll(page, '.preview-more-item', 'mer-meny items');
  await safeClick(page, '[data-more-toggle]', 'mer-meny stäng');

  // Nav-vyer
  for (const view of ['conversations', 'later', 'sent', 'integrations', 'macros', 'settings', 'showcase']) {
    await safeClick(page, `[data-nav-view="${view}"]`, `view ${view}`);
    await sleep(200);
  }
  // Tillbaka till conversations
  await safeClick(page, '[data-nav-view="conversations"]', 'conversations');
  await sleep(400);

  console.log('Klicka i thread-list…');
  await safeClickAll(page, '.thread-card', 'thread-cards');
  await safeClickAll(page, '.action-icon', 'action-icons');

  console.log('Mailbox-meny…');
  await safeClick(page, 'label[for="mailbox-menu-toggle"]', 'mailbox toggle');
  await sleep(300);
  await safeClickAll(page, '.mailbox-option', 'mailbox-options');
  await safeClick(page, 'label[for="mailbox-menu-toggle"]', 'mailbox stäng');

  console.log('Filter-chips…');
  await safeClickAll(page, '.queue-secondary-signal-chip', 'filter-chips');

  console.log('Sökfält…');
  try {
    const search = await page.$('input[placeholder*="ök" i]');
    if (search) {
      await search.click();
      await search.type('test', { delay: 50 });
      await sleep(300);
      await search.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
    }
  } catch (_e) {}

  console.log('Focus-pane sektioner…');
  await safeClickAll(page, '.focus-intel-tab, .focus-intel-switcher button', 'focus tabs');
  await safeClickAll(page, '[data-focus-section]', 'focus-section');

  console.log('Studio / compose-actions…');
  await safeClickAll(page, '[data-quick-action]', 'quick-actions');

  console.log('Diverse…');
  await safeClick(page, '[data-mailbox-admin-open]', 'mailbox-admin-open');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(200);
  await safeClick(page, '[data-customer-settings-open]', 'customer-settings');
  await sleep(300);
  await page.keyboard.press('Escape');

  console.log('Theme-switcher…');
  await safeClick(page, '.preview-utility-button[aria-label*="läge"]', 'theme');
  await sleep(200);
  await safeClick(page, '.preview-utility-button[aria-label*="läge"]', 'theme');
  await sleep(200);

  // Tillbaka till conversations som final state
  await safeClick(page, '[data-nav-view="conversations"]', 'conversations final');
  await sleep(500);
}

(async () => {
  console.log(`Lansrar Chrome (Puppeteer-paketerad)…`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log(`Startar CSS coverage…`);
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });

  console.log(`Navigerar till ${PREVIEW_URL}`);
  try {
    await page.goto(PREVIEW_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.error(`Kunde inte ladda prevjen: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  console.log(`Simulerar UI-interaktioner…`);
  await exerciseUI(page);

  console.log(`Stoppar coverage…`);
  const cssCoverage = await page.coverage.stopCSSCoverage();

  const results = cssCoverage.map(c => ({
    url: c.url,
    textLength: (c.text || '').length,
    ranges: c.ranges,
  }));
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`Skrev ${results.length} CSS-filer till ${OUTPUT}`);
  for (const r of results) {
    const used = r.ranges.reduce((s, x) => s + (x.end - x.start), 0);
    const pct = r.textLength ? ((used / r.textLength) * 100).toFixed(1) : '0.0';
    console.log(`  ${pct.padStart(5)}% used  ${used}/${r.textLength}  ${r.url}`);
  }

  await browser.close();
})();
