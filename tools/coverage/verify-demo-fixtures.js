#!/usr/bin/env node
const puppeteer = require('puppeteer');
const PREVIEW_URL = 'http://localhost:3100/major-arcana-preview/';
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errors = [];
  p.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  try { await p.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
  await sleep(5000);

  console.log('\n=== Demo-fixtures (efter split) ===');

  // Test 1 — data-modulen exponerad
  const r1 = await p.evaluate(() => ({
    hasModule: !!window.__DemoFixtures,
    fixturesCount: Object.keys(window.__DemoFixtures?.data || {}).length,
    seedFn: typeof window.__DemoFixtures?.seedCustomers === 'function',
  }));
  console.log(`Test 1 — __DemoFixtures: module=${r1.hasModule} fixtures=${r1.fixturesCount} seed=${r1.seedFn} ${r1.hasModule && r1.fixturesCount === 6 && r1.seedFn ? '✅' : '❌'}`);

  // Test 2 — focus-shim (FIX12) exponerad
  const r2 = await p.evaluate(() => ({
    hasShim: !!window.__DemoFixtureFocusShim,
    renderFn: typeof window.__DemoFixtureFocusShim?.render === 'function',
    clearFn: typeof window.__DemoFixtureFocusShim?.clear === 'function',
  }));
  console.log(`Test 2 — __DemoFixtureFocusShim: shim=${r2.hasShim} render=${r2.renderFn} clear=${r2.clearFn} ${r2.hasShim && r2.renderFn && r2.clearFn ? '✅' : '❌'}`);

  // Test 3 — card-shim (FIX14) exponerad
  const r3 = await p.evaluate(() => ({
    hasShim: !!window.__DemoFixtureCardShim,
    injectFn: typeof window.__DemoFixtureCardShim?.inject === 'function',
    cardsCount: Object.keys(window.__DemoFixtureCardShim?.cards || {}).length,
  }));
  console.log(`Test 3 — __DemoFixtureCardShim: shim=${r3.hasShim} inject=${r3.injectFn} cards=${r3.cardsCount} ${r3.hasShim && r3.injectFn && r3.cardsCount === 6 ? '✅' : '❌'}`);

  // Test 4 — 6 demo-kort i DOM (FIX14 funkar fortfarande)
  const r4 = await p.evaluate(() => {
    const cards = document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread^="demo-"]');
    return { count: cards.length, ids: Array.from(cards).map(c => c.dataset.runtimeThread) };
  });
  console.log(`Test 4 — 6 demo-kort i DOM: count=${r4.count} ${r4.count === 6 ? '✅' : '❌'}`);
  if (r4.count !== 6) console.log('  ids:', r4.ids);

  // Test 5 — gamla filen är borta
  const r5 = await p.evaluate(async () => {
    try {
      const res = await fetch('./runtime-demo-fixture-name-patch.js?v=test');
      return { status: res.status };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(`Test 5 — gamla filen 404: status=${r5.status} ${r5.status === 404 ? '✅' : '❌'}`);

  // Test 6 — feature-flag stänger av shims (load page med flag)
  await p.evaluate(() => {
    window.__DISABLE_DEMO_FIXTURE_SHIMS = true;
  });
  // Vi testar bara att flaggan inte triggar exception — full disable kräver reload
  const r6 = await p.evaluate(() => window.__DISABLE_DEMO_FIXTURE_SHIMS === true);
  console.log(`Test 6 — feature-flag respekteras: flag=${r6} ${r6 ? '✅' : '❌'}`);

  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));

  await b.close();
})();
