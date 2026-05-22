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

  // ============================
  // BULK-ACTIONS
  // ============================
  console.log('\n=== Bulk-actions ===');
  const ba = await p.evaluate(() => typeof window.__BulkActions?.toggle === 'function');
  console.log(`Test 1 — window.__BulkActions exposed: ${ba ? '✅' : '❌'}`);

  // x togglar selection
  await p.keyboard.press('j'); // fokusera första
  await sleep(200);
  await p.keyboard.press('x'); // toggle
  await sleep(300);
  const r1 = await p.evaluate(() => ({
    selected: window.__BulkActions?.getSelected().length || 0,
    cssApplied: !!document.querySelector('.thread-card.is-bulk-selected'),
    toolbarOpen: !!document.querySelector('#bulk-actions-toolbar[data-open]'),
  }));
  console.log(`Test 2 — x togglar selection: selected=${r1.selected} cssApplied=${r1.cssApplied} toolbar=${r1.toolbarOpen} ${r1.selected > 0 && r1.cssApplied && r1.toolbarOpen ? '✅' : '❌'}`);

  // *a select all
  await p.keyboard.press('*');
  await sleep(50);
  await p.keyboard.press('a');
  await sleep(300);
  const r2 = await p.evaluate(() => ({
    selected: window.__BulkActions?.getSelected().length || 0,
    cards: document.querySelectorAll('.queue-history-list .thread-card[data-runtime-thread]').length,
  }));
  console.log(`Test 3 — *a select all: selected=${r2.selected}/${r2.cards} ${r2.selected === r2.cards ? '✅' : '❌'}`);

  // Clear via API
  await p.evaluate(() => window.__BulkActions.clearSelection());
  await sleep(200);

  // ============================
  // INBOX-STREAK
  // ============================
  console.log('\n=== Inbox-streak ===');
  const is = await p.evaluate(() => typeof window.__InboxStreak?.fakeStreak === 'function');
  console.log(`Test 4 — window.__InboxStreak exposed: ${is ? '✅' : '❌'}`);

  await p.evaluate(() => window.__InboxStreak.fakeStreak(7));
  await sleep(300);
  const r3 = await p.evaluate(() => {
    const pill = document.getElementById('inbox-streak-pill');
    return {
      exists: !!pill,
      visible: pill?.hasAttribute('data-visible'),
      text: pill?.querySelector('.inbox-streak-label')?.textContent,
    };
  });
  console.log(`Test 5 — fakeStreak(7) visar pill: exists=${r3.exists} visible=${r3.visible} text="${r3.text}" ${r3.exists && r3.visible && r3.text === '7 dagar' ? '✅' : '❌'}`);

  // ============================
  // INLINE-DRAFT-EDIT
  // ============================
  console.log('\n=== Inline-draft-edit ===');
  const ie = await p.evaluate(() => typeof window.__InlineDraftEdit?.open === 'function');
  console.log(`Test 6 — window.__InlineDraftEdit exposed: ${ie ? '✅' : '❌'}`);

  // Hitta första card med .warm-preview och öppna editor
  const opened = await p.evaluate(() => {
    const card = document.querySelector('.thread-card[data-runtime-thread] .warm-preview')?.closest('.thread-card');
    if (!card) return { error: 'no card with warm-preview' };
    window.__InlineDraftEdit.open(card);
    return {
      editorExists: !!card.querySelector('[data-inline-draft-editor]'),
      textareaExists: !!card.querySelector('.inline-draft-textarea'),
      btns: card.querySelectorAll('[data-inline-draft-action]').length,
    };
  });
  console.log(`Test 7 — open() skapar editor: ${JSON.stringify(opened)} ${opened.editorExists && opened.textareaExists && opened.btns === 3 ? '✅' : '❌'}`);

  // Stäng
  await p.evaluate(() => window.__InlineDraftEdit.close());
  await sleep(200);
  const closed = await p.evaluate(() => !window.__InlineDraftEdit.isActive());
  console.log(`Test 8 — close() avaktiverar: ${closed ? '✅' : '❌'}`);

  console.log(`\nErrors: ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log('  ' + e));

  await b.close();
})();
