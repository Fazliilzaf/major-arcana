#!/usr/bin/env node
const puppeteer = require('puppeteer');
const PREVIEW_URL = 'http://localhost:3100/major-arcana-preview/?nocache=1';
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errors = [];
  p.on('pageerror', e => errors.push(`pageerror: ${e.message}`));

  try { await p.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch (e) {}
  await sleep(5000);

  // Rensa eventuell tidigare snooze-state
  await p.evaluate(() => localStorage.removeItem('cco.snoozedThreads.v1'));

  console.log('\n=== Snooze ===');

  // Test 1 — modulen exponerad
  const r1 = await p.evaluate(() => ({
    hasModule: !!window.__Snooze,
    snoozeFn: typeof window.__Snooze?.snooze === 'function',
    unsnoozeFn: typeof window.__Snooze?.unsnooze === 'function',
    presetsCount: (window.__Snooze?.presets || []).length,
  }));
  console.log(`Test 1 — __Snooze API: module=${r1.hasModule} snooze=${r1.snoozeFn} unsnooze=${r1.unsnoozeFn} presets=${r1.presetsCount} ${r1.hasModule && r1.snoozeFn && r1.unsnoozeFn && r1.presetsCount === 4 ? '✅' : '❌'}`);

  // Test 2 — snooze() persists till localStorage + applyas till DOM
  const r2 = await p.evaluate(async () => {
    const card = document.querySelector('.thread-card[data-runtime-thread]');
    if (!card) return { error: 'no card' };
    const id = card.dataset.runtimeThread;
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    window.__Snooze.snooze(id, inOneHour);
    await new Promise(r => setTimeout(r, 200));
    return {
      threadId: id,
      isSnoozedAPI: window.__Snooze.isSnoozed(id),
      cardHasSnoozedClass: card.classList.contains('is-snoozed'),
      pillExists: !!card.querySelector('.snooze-pill'),
      pillText: card.querySelector('.snooze-pill-label')?.textContent,
      lsHasEntry: !!JSON.parse(localStorage.getItem('cco.snoozedThreads.v1') || '{}')[id],
    };
  });
  console.log(`Test 2 — snooze() funkar: API=${r2.isSnoozedAPI} class=${r2.cardHasSnoozedClass} pill=${r2.pillExists} text="${r2.pillText}" LS=${r2.lsHasEntry} ${r2.isSnoozedAPI && r2.cardHasSnoozedClass && r2.pillExists && r2.lsHasEntry ? '✅' : '❌'}`);

  // Test 3 — unsnooze() rensar
  const r3 = await p.evaluate(async () => {
    const card = document.querySelector('.thread-card[data-runtime-thread]');
    const id = card.dataset.runtimeThread;
    window.__Snooze.unsnooze(id);
    await new Promise(r => setTimeout(r, 200));
    return {
      isSnoozedAPI: window.__Snooze.isSnoozed(id),
      cardHasSnoozedClass: card.classList.contains('is-snoozed'),
      pillExists: !!card.querySelector('.snooze-pill'),
      lsHasEntry: !!JSON.parse(localStorage.getItem('cco.snoozedThreads.v1') || '{}')[id],
    };
  });
  console.log(`Test 3 — unsnooze() rensar: API=${r3.isSnoozedAPI} class=${r3.cardHasSnoozedClass} pill=${r3.pillExists} LS=${r3.lsHasEntry} ${!r3.isSnoozedAPI && !r3.cardHasSnoozedClass && !r3.pillExists && !r3.lsHasEntry ? '✅' : '❌'}`);

  // Test 4 — klick på data-quick-action="later" öppnar overlay
  const r4 = await p.evaluate(async () => {
    const btn = document.querySelector('.thread-card[data-runtime-thread] [data-quick-action="later"]');
    if (!btn) return { error: 'no later-btn' };
    btn.click();
    await new Promise(r => setTimeout(r, 300));
    const overlay = document.querySelector('.snooze-overlay');
    const presets = overlay?.querySelectorAll('.snooze-preset')?.length || 0;
    const customInput = overlay?.querySelector('.snooze-custom-input');
    // Stäng overlay
    document.querySelector('.snooze-overlay-close')?.click();
    await new Promise(r => setTimeout(r, 200));
    const closedOK = !document.querySelector('.snooze-overlay');
    return { overlayOpened: !!overlay, presets, hasCustomInput: !!customInput, closedOK };
  });
  console.log(`Test 4 — overlay öppnas/stängs: opened=${r4.overlayOpened} presets=${r4.presets} customInput=${r4.hasCustomInput} closed=${r4.closedOK} ${r4.overlayOpened && r4.presets === 4 && r4.hasCustomInput && r4.closedOK ? '✅' : '❌'}`);

  // Test 5 — snooze i förflyten triggar "återkommer"-pill
  const r5 = await p.evaluate(async () => {
    const card = document.querySelector('.thread-card[data-runtime-thread]');
    const id = card.dataset.runtimeThread;
    const past = new Date(Date.now() - 1000); // 1 sek i förflyten
    window.__Snooze.snooze(id, past);
    await new Promise(r => setTimeout(r, 200));
    const returnedPill = !!card.querySelector('.snooze-pill-returned');
    const returnedClass = card.classList.contains('is-just-returned');
    // Cleanup
    window.__Snooze.unsnooze(id);
    return { returnedPill, returnedClass };
  });
  console.log(`Test 5 — återkommer-pill: pill=${r5.returnedPill} class=${r5.returnedClass} ${r5.returnedPill && r5.returnedClass ? '✅' : '❌'}`);

  // Test 6 — formatRelative
  const r6 = await p.evaluate(() => ({
    in1h: window.__Snooze.formatRelative(new Date(Date.now() + 60 * 60 * 1000)),
    in4h: window.__Snooze.formatRelative(new Date(Date.now() + 4 * 60 * 60 * 1000)),
    in3d: window.__Snooze.formatRelative(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
  }));
  console.log(`Test 6 — formatRelative: 1h="${r6.in1h}" 4h="${r6.in4h}" 3d="${r6.in3d}" ${r6.in1h.includes('h') && r6.in4h.includes('h') && r6.in3d.includes('dag') ? '✅' : '❌'}`);

  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));

  await b.close();
})();
