#!/usr/bin/env node
const puppeteer = require('puppeteer');
const PREVIEW_URL = process.env.PREVIEW_URL || 'http://localhost:3100/major-arcana-preview/';
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  try { await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
  catch (e) { console.log(`(navigation: ${e.message.slice(0, 60)})`); }
  await sleep(3000);

  // Vänta tills minst ett thread-card mountats (FIX14 kan ta 2-4 sek)
  for (let i = 0; i < 10; i++) {
    const count = await page.evaluate(() =>
      document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]').length
    );
    if (count > 0) break;
    await sleep(500);
  }

  // Test 1: window.__KeyboardNav exposed
  const exposed = await page.evaluate(() => typeof window.__KeyboardNav?.showHelp === 'function');
  console.log(`Test 1 — window.__KeyboardNav exposed: ${exposed ? '✅' : '❌'}`);

  // Test 2: Press j → first card focused
  await page.keyboard.press('j');
  await sleep(200);
  const firstFocused = await page.evaluate(() => {
    const el = document.querySelector('.thread-card.is-keyboard-focused');
    return !!el;
  });
  console.log(`Test 2 — j fokuserar första tråden: ${firstFocused ? '✅' : '❌'}`);

  // Test 3: Press j again → next card
  await page.keyboard.press('j');
  await sleep(200);
  const secondFocused = await page.evaluate(() => {
    const focused = document.querySelectorAll('.thread-card.is-keyboard-focused');
    return focused.length === 1;
  });
  console.log(`Test 3 — j flyttar till nästa: ${secondFocused ? '✅' : '❌'}`);

  // Test 4: ? visar help-overlay
  await page.keyboard.press('?');
  await sleep(200);
  const helpOpen = await page.evaluate(() => {
    const el = document.getElementById('keyboard-help-overlay');
    return el && el.hasAttribute('data-open');
  });
  console.log(`Test 4 — ? öppnar help-overlay: ${helpOpen ? '✅' : '❌'}`);

  // Test 5: Esc stänger
  await page.keyboard.press('Escape');
  await sleep(200);
  const helpClosed = await page.evaluate(() => {
    const el = document.getElementById('keyboard-help-overlay');
    return el && !el.hasAttribute('data-open');
  });
  console.log(`Test 5 — Esc stänger help: ${helpClosed ? '✅' : '❌'}`);

  // Test 6: g i öppnar Inkorg-vy (testa att nav-button.click triggas)
  let navClicked = null;
  await page.evaluate(() => {
    window.__lastNav = null;
    const btn = document.querySelector('[data-nav-view="conversations"]');
    if (btn) {
      const origClick = btn.click.bind(btn);
      btn.click = () => { window.__lastNav = 'conversations'; return origClick(); };
    }
  });
  await page.keyboard.press('g');
  await sleep(100);
  await page.keyboard.press('i');
  await sleep(200);
  navClicked = await page.evaluate(() => window.__lastNav);
  console.log(`Test 6 — g i triggar Inkorg-nav: ${navClicked === 'conversations' ? '✅' : '❌'}`);

  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));

  await browser.close();
})();
