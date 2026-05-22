#!/usr/bin/env node
// Verifierar mock-API + om FIX14 fortfarande behövs.
// Loggar:
//  - vilka fetch-anrop som interceptas av mock-API
//  - state.runtime.authRequired efter bootstrap
//  - antal demo-cards i .queue-history-list
//  - om FIX14:s buildFix14CardHtml faktiskt kördes

const puppeteer = require('puppeteer');
const PREVIEW_URL = process.env.PREVIEW_URL || 'http://localhost:3100/major-arcana-preview/';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log(`Lansrar Chrome…`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const mockApiCalls = [];
  const consoleMessages = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[mock-api]')) mockApiCalls.push(text);
    if (text.includes('[fix-shim]') || text.includes('FIX14') || text.includes('demo')) {
      consoleMessages.push(`[${msg.type()}] ${text.slice(0, 120)}`);
    }
  });

  // Aktivera mock-API debug-logg INNAN sidan laddas
  await page.evaluateOnNewDocument(() => {
    window.__DEBUG_MOCK_API = true;
  });

  console.log(`Navigerar till ${PREVIEW_URL}`);
  try {
    await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    console.log(`(navigation: ${e.message.slice(0, 80)}) — fortsätter`);
  }
  await sleep(4000); // vänta på bootstrap

  console.log(`\n=== Mock-API anrop (${mockApiCalls.length}) ===`);
  for (const call of mockApiCalls.slice(0, 10)) {
    console.log('  ' + call.slice(0, 110));
  }
  if (mockApiCalls.length > 10) console.log(`  ... och ${mockApiCalls.length - 10} till`);

  // Inspektera state + DOM
  const inspection = await page.evaluate(() => {
    const result = {
      hasMockApi: typeof window.fetch === 'function' && window.fetch.toString().includes('mockedFetch'),
      authRequired: null,
      threadsInState: 0,
      cardsInDom: 0,
      cardsWithDemoPrefix: 0,
      fix14CardsInjected: 0,
      mockApiActive: false,
    };
    try {
      // state via window.__App eller globalt
      const state = window.__App?.state || window.state || null;
      if (state) {
        result.authRequired = state.runtime?.authRequired ?? state.status?.authRequired ?? null;
        result.threadsInState = Array.isArray(state.runtime?.threads) ? state.runtime.threads.length : 0;
      }
    } catch (_e) {}

    const list = document.querySelector('.queue-history-list');
    if (list) {
      const allCards = list.querySelectorAll('[data-runtime-thread]');
      result.cardsInDom = allCards.length;
      result.cardsWithDemoPrefix = list.querySelectorAll('[data-runtime-thread^="demo-"]').length;
      // FIX14-cards har data-v8-version="warm-r8" attribute
      result.fix14CardsInjected = list.querySelectorAll('article[data-v8-version="warm-r8"][data-runtime-thread^="demo-"]').length;
    }

    result.mockApiActive = !!window.__DEBUG_MOCK_API;
    return result;
  });

  console.log(`\n=== DOM/state-inspektion ===`);
  console.log(`  fetch är wrappad?         ${inspection.hasMockApi}`);
  console.log(`  state.runtime.authRequired: ${inspection.authRequired}`);
  console.log(`  state.runtime.threads.length: ${inspection.threadsInState}`);
  console.log(`  cards i .queue-history-list: ${inspection.cardsInDom}`);
  console.log(`  ↳ med "demo-"-prefix:        ${inspection.cardsWithDemoPrefix}`);
  console.log(`  ↳ med data-v8-version=warm-r8 (FIX14): ${inspection.fix14CardsInjected}`);

  console.log(`\n=== Slutsats ===`);
  if (inspection.cardsWithDemoPrefix > 0 && inspection.fix14CardsInjected === 0) {
    console.log(`  ✅ Demo-cards renderas NATURELLT (utan FIX14-injection)`);
    console.log(`     FIX14 kan tas bort — mock-API täcker dess use-case.`);
  } else if (inspection.cardsWithDemoPrefix > 0 && inspection.fix14CardsInjected > 0) {
    console.log(`  ⚠️  Demo-cards finns men har FIX14-markering`);
    console.log(`     FIX14 körs fortfarande — mock-API täcker INTE alls.`);
  } else if (inspection.cardsWithDemoPrefix === 0) {
    console.log(`  ❌ INGA demo-cards i DOM!`);
    console.log(`     Mock-API kan ha brutit något — undersök console-meddelanden.`);
  }

  console.log(`\n=== Console-meddelanden (${consoleMessages.length}) ===`);
  for (const msg of consoleMessages.slice(0, 15)) {
    console.log('  ' + msg);
  }

  await browser.close();
})();
