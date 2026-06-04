#!/usr/bin/env node
/**
 * verify-demo-fixtures.js
 *
 * Verifierar att FIX12 + FIX14-shims är BORTA och att appen fortfarande
 * renderar demo-fixtures korrekt via den vanliga rendererpathen.
 *
 * Bakgrund: state.runtime.threads i app.js har 6 demo-fixtures inbäddade
 * (rad 2145-2285) med worklistSource: "demo". Mock-worklist-API serverar
 * /auth/me etc med 200 OK så authRequired = false → focus-pane renderar
 * normalt utan att behöva FIX12-overriden.
 */
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

  console.log('\n=== Demo-fixtures (efter FIX12+14 elimination) ===');

  // Test 1 — data-modulen exponerad (FIXTURES bevarad för seedning)
  const r1 = await p.evaluate(() => ({
    hasModule: !!window.__DemoFixtures,
    fixturesCount: Object.keys(window.__DemoFixtures?.data || {}).length,
    seedFn: typeof window.__DemoFixtures?.seedCustomers === 'function',
  }));
  console.log(`Test 1 — __DemoFixtures (data only): module=${r1.hasModule} fixtures=${r1.fixturesCount} seed=${r1.seedFn} ${r1.hasModule && r1.fixturesCount === 6 && r1.seedFn ? '✅' : '❌'}`);

  // Test 2 — FIX12-shim är BORTA
  const r2 = await p.evaluate(() => ({
    focusShim: !!window.__DemoFixtureFocusShim,
  }));
  console.log(`Test 2 — FIX12-shim borta: focusShim=${r2.focusShim} ${!r2.focusShim ? '✅' : '❌'}`);

  // Test 3 — FIX14-shim är BORTA
  const r3 = await p.evaluate(() => ({
    cardShim: !!window.__DemoFixtureCardShim,
  }));
  console.log(`Test 3 — FIX14-shim borta: cardShim=${r3.cardShim} ${!r3.cardShim ? '✅' : '❌'}`);

  // Test 4 — gamla shim-filerna 404:ar
  const r4 = await p.evaluate(async () => {
    const focus = await fetch('./app/demo-fixture-focus-shim.js?v=test').then(r => r.status).catch(() => 0);
    const card = await fetch('./app/demo-fixture-card-shim.js?v=test').then(r => r.status).catch(() => 0);
    return { focus, card };
  });
  console.log(`Test 4 — shim-filer 404: focus=${r4.focus} card=${r4.card} ${r4.focus === 404 && r4.card === 404 ? '✅' : '❌'}`);

  // Test 5 — demo-kort renderas via vanliga renderer (data-worklist-source="demo")
  const r5 = await p.evaluate(() => {
    const cards = document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread^="demo-"]');
    const allFromVanillaRenderer = Array.from(cards).every(c => {
      // Vanliga renderer producerar inte data-worklist-source="demo" på samma sätt
      // som FIX14:s buildCardHtml gjorde — vi vill bara verifiera att korten finns.
      return c.dataset.runtimeThread.startsWith('demo-');
    });
    return { count: cards.length, allFromRenderer: allFromVanillaRenderer };
  });
  console.log(`Test 5 — demo-kort renderade: count=${r5.count} ${r5.count >= 1 ? '✅' : '❌'}`);

  // Test 6 — focus-pane fungerar utan FIX12 (klick på första demo-kort triggar fokus)
  const r6 = await p.evaluate(async () => {
    const card = document.querySelector('.queue-history-list .thread-card[data-runtime-thread^="demo-"]');
    if (!card) return { error: 'no demo card' };
    card.click();
    await new Promise(r => setTimeout(r, 800));
    const focusContent = document.querySelector('.focus-section-conversation')?.innerText?.slice(0, 100) || '';
    const hasFix12Marker = !!document.querySelector('.demo-fixture-focus-content, .conversation-entry-demo');
    return {
      focusHasContent: focusContent.length > 20,
      hasFix12Marker,
      contentSnippet: focusContent.slice(0, 80),
    };
  });
  console.log(`Test 6 — focus-pane utan FIX12: hasContent=${r6.focusHasContent} hasFix12Marker=${r6.hasFix12Marker} ${r6.focusHasContent && !r6.hasFix12Marker ? '✅' : '❌'}`);
  if (r6.contentSnippet) console.log(`  snippet: "${r6.contentSnippet.replace(/\s+/g, ' ')}"`);

  // Test 7 — auth_required är inte triggat (mock-API räddar appen)
  const r7 = await p.evaluate(() => ({
    authMarker: !!document.querySelector('.session-required, [data-auth-required], .auth-required'),
    focusEmpty: document.querySelector('[data-focus-conversation-layout]')?.classList?.contains('is-runtime-empty'),
  }));
  console.log(`Test 7 — ingen auth_required-state: marker=${r7.authMarker} focusEmpty=${r7.focusEmpty} ${!r7.authMarker && !r7.focusEmpty ? '✅' : '❌'}`);

  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));

  await b.close();
})();
