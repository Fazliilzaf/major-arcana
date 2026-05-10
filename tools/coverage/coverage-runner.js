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

  // ========================================================================
  // 2026-05-09: nya features — säkerställ CSS-coverage genom att trigga dem
  // ========================================================================
  console.log('Feature-triggers (Cmd+K, keyboard-nav, bulk, streak, inline-draft)…');

  // Cmd+K snabbsök
  try {
    await page.keyboard.down('MetaLeft');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('MetaLeft');
    await sleep(400);
    await page.keyboard.type('test', { delay: 30 });
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(200);
    console.log('  Cmd+K opened/typed/closed');
  } catch (_e) {}

  // Keyboard-nav
  try {
    await page.keyboard.press('KeyJ'); await sleep(100); // focus first
    await page.keyboard.press('KeyJ'); await sleep(100); // next
    await page.keyboard.press('KeyK'); await sleep(100); // prev
    await page.keyboard.press('Slash'); await sleep(300); // ? hjälp
    await page.keyboard.press('Escape'); await sleep(200);
    console.log('  keyboard-nav j/k/?');
  } catch (_e) {}

  // Bulk-actions: x toggle + *a select all
  try {
    await page.keyboard.press('KeyJ'); await sleep(100);
    await page.keyboard.press('KeyX'); await sleep(300); // toggla bulk
    await page.keyboard.press('Digit8'); await sleep(50); // * (Shift+8)
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.press('Digit8'); await sleep(50);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.press('KeyA'); await sleep(300); // *a
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.press('Digit8'); await sleep(50);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.press('KeyN'); await sleep(200); // *n clear
    console.log('  bulk-actions x / *a / *n');
  } catch (_e) {}

  // Inbox-streak: trigga pillen via __InboxStreak.fakeStreak
  try {
    await page.evaluate(() => {
      if (window.__InboxStreak?.fakeStreak) window.__InboxStreak.fakeStreak(7);
    });
    await sleep(300);
    console.log('  inbox-streak fakeStreak(7)');
  } catch (_e) {}

  // Inline-draft-edit: öppna via __InlineDraftEdit.open
  try {
    await page.evaluate(() => {
      const card = document.querySelector('.thread-card[data-runtime-thread] .warm-preview')?.closest('.thread-card');
      if (card && window.__InlineDraftEdit?.open) window.__InlineDraftEdit.open(card);
    });
    await sleep(400);
    await page.evaluate(() => window.__InlineDraftEdit?.close?.());
    await sleep(200);
    console.log('  inline-draft-edit open/close');
  } catch (_e) {}

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
  // Pretend success even on slow nav — vissa nätverksanrop (fonts.googleapis.com)
  // kan blocka networkidle. Använd kort timeout, fortsätt även vid timeout.
  try {
    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (navErr) {
    console.log(`(navigation: ${navErr.message.slice(0, 80)}) — fortsätter ändå`);
  }
  await sleep(3000);

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
