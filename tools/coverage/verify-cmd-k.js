#!/usr/bin/env node
// Smoke-test för Cmd+K snabbsök
const puppeteer = require('puppeteer');
const PREVIEW_URL = process.env.PREVIEW_URL || 'http://localhost:3100/major-arcana-preview/';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text().slice(0, 120)}`);
  });

  try {
    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log(`(navigation: ${e.message.slice(0, 80)})`);
  }
  await sleep(3000);

  // Test 1: window.__CmdK exposed?
  const cmdKExposed = await page.evaluate(() => typeof window.__CmdK === 'object' && typeof window.__CmdK.open === 'function');
  console.log(`Test 1 — window.__CmdK exposed: ${cmdKExposed ? '✅' : '❌'}`);

  // Test 2: Open via API
  await page.evaluate(() => window.__CmdK.open());
  await sleep(300);
  const overlayVisible = await page.evaluate(() => {
    const o = document.getElementById('cmd-k-overlay');
    return o && o.hasAttribute('data-open');
  });
  console.log(`Test 2 — overlay öppnas via __CmdK.open(): ${overlayVisible ? '✅' : '❌'}`);

  // Test 3: Default-results visas
  const defaultResults = await page.evaluate(() => {
    const list = document.querySelector('#cmd-k-overlay .cmd-k-list');
    return list ? list.querySelectorAll('.cmd-k-result').length : 0;
  });
  console.log(`Test 3 — default-resultat (förväntat >5): ${defaultResults} ${defaultResults > 5 ? '✅' : '❌'}`);

  // Test 4: Sök för "kund"
  await page.type('#cmd-k-overlay .cmd-k-input', 'kund');
  await sleep(300);
  const searchResults = await page.evaluate(() => {
    const list = document.querySelector('#cmd-k-overlay .cmd-k-list');
    return list ? list.querySelectorAll('.cmd-k-result').length : 0;
  });
  console.log(`Test 4 — sökresultat för "kund" (förväntat ≥1): ${searchResults} ${searchResults >= 1 ? '✅' : '❌'}`);

  // Test 5: Esc stänger
  await page.keyboard.press('Escape');
  await sleep(200);
  const closedAfterEsc = await page.evaluate(() => {
    const o = document.getElementById('cmd-k-overlay');
    return o && !o.hasAttribute('data-open');
  });
  console.log(`Test 5 — Esc stänger overlay: ${closedAfterEsc ? '✅' : '❌'}`);

  // Test 6: Cmd+K öppnar
  await page.keyboard.down('Meta');
  await page.keyboard.press('k');
  await page.keyboard.up('Meta');
  await sleep(300);
  const openedAfterCmdK = await page.evaluate(() => {
    const o = document.getElementById('cmd-k-overlay');
    return o && o.hasAttribute('data-open');
  });
  console.log(`Test 6 — Cmd+K öppnar overlay: ${openedAfterCmdK ? '✅' : '❌'}`);

  console.log(`\n=== Errors (${errors.length}) ===`);
  errors.slice(0, 10).forEach(e => console.log('  ' + e));

  await browser.close();
})();
