'use strict';

/**
 * Post-cutover DOM-smoke för CCO Konversationer v2 4-zons-skalet.
 *
 * Cutover (#232) slår flaggan default ON ⇒ v2-skalet renderas live för alla.
 * CI:s live-smoke kräver autentiserad kö-data (server-503 utan), så den fångar
 * INTE render-regressioner i själva skalet. Det här testet laddar den riktiga
 * shell-modulen (cco-conversations-v2-shell.js) i en lättviktig DOM (linkedom),
 * matar in en MOCKAD ctx (samma shape som renderConversationsV2Shell bygger i
 * app.js) och verifierar att:
 *   1. render(ctx) monterar #cco-conv-v2-root utan att kasta,
 *   2. alla fyra zoner finns (lanes · inbox · tråd · kontext),
 *   3. mock-datan faktiskt flödar in (lane-räknare, trådnamn, vald tråd),
 *   4. om-rendering är idempotent (ingen dubbel-mount).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

const SHELL_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'cco-conversations-v2-shell.js'
);

function makeThread(overrides = {}) {
  return {
    id: 't-1',
    customerName: 'Anna Karlsson',
    subject: 'Boka PRP-behandling',
    preview: 'Hej, jag vill gärna boka en tid för PRP.',
    lastMessageAt: '2026-06-20T10:00:00Z',
    unread: true,
    ...overrides,
  };
}

function makeCtx(overrides = {}) {
  const threads = [
    makeThread(),
    makeThread({
      id: 't-2',
      customerName: 'Björn Lund',
      subject: 'Ombokning',
      unread: false,
    }),
  ];
  return {
    lanes: [
      { id: 'all', label: 'Alla', icon: '', count: threads.length, group: '' },
      { id: 'urgent', label: 'Brådskande', icon: '', count: 1, group: '' },
    ],
    activeLane: 'all',
    laneThreads: threads,
    allThreads: threads,
    selected: threads[0],
    handlers: {
      selectThread() {},
      setLane() {},
      action() {},
      openDossier() {},
    },
    ...overrides,
  };
}

/**
 * Laddar shell-modulen i en frisk linkedom-DOM och returnerar
 * { window, document, ArcanaConversationsV2 }. Modulen är en IIFE som binder
 * sig till sitt global-argument (window) — vi sätter global.window innan vi
 * exekverar källan så att getElementById/createElement går mot linkedom.
 */
function loadShell() {
  const dom = parseHTML(
    '<!doctype html><html><body>' +
      '<div class="preview-workspace"><div class="preview-canvas"></div></div>' +
      '</body></html>'
  );
  const { window, document } = dom;
  window.matchMedia = () => ({ matches: false });

  const previousWindow = global.window;
  const previousDocument = global.document;
  global.window = window;
  global.document = document;
  try {
    const source = fs.readFileSync(SHELL_PATH, 'utf8');
    // Kör källan i nuvarande scope så att `window`/`globalThis` = linkedom.
    new Function('window', 'globalThis', source)(window, window);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
  return { window, document, api: window.ArcanaConversationsV2 };
}

test('v2-skalet: render exponerar ArcanaConversationsV2.render', () => {
  const { api } = loadShell();
  assert.ok(api, 'window.ArcanaConversationsV2 ska finnas');
  assert.equal(typeof api.render, 'function');
});

test('v2-skalet: render(ctx) monterar #cco-conv-v2-root med alla fyra zoner', () => {
  const { document, api } = loadShell();
  api.render(makeCtx());

  const root = document.getElementById('cco-conv-v2-root');
  assert.ok(root, '#cco-conv-v2-root ska ha monterats');

  for (const zone of ['[data-v2-lanes]', '[data-v2-inbox]', '[data-v2-thread]', '[data-v2-ctx]']) {
    assert.ok(root.querySelector(zone), `zon saknas i skalet: ${zone}`);
  }
});

test('v2-skalet: mock-kö-data flödar in i lanes och inbox', () => {
  const { document, api } = loadShell();
  api.render(makeCtx());
  const root = document.getElementById('cco-conv-v2-root');

  // Inbox visar trådnamn från ctx.laneThreads.
  const inboxHtml = root.querySelector('[data-v2-inbox]').innerHTML;
  assert.match(inboxHtml, /Anna Karlsson/, 'inbox ska visa första trådens namn');
  assert.match(inboxHtml, /Björn Lund/, 'inbox ska visa andra trådens namn');

  // Inbox-raderna är klickbara trådar med data-thread-id.
  const rows = root.querySelectorAll('[data-thread-id]');
  assert.ok(rows.length >= 2, 'inbox ska ha minst två tråd-rader');

  // Vald tråd reflekteras i kontext/tråd-zonen.
  const threadHtml = root.querySelector('[data-v2-thread]').innerHTML;
  assert.match(threadHtml, /Anna Karlsson/, 'tråd-zonen ska visa den valda tråden');
});

test('v2-skalet: tom lane visar tomt-läge utan att kasta', () => {
  const { document, api } = loadShell();
  api.render(makeCtx({ laneThreads: [], allThreads: [], selected: null }));
  const root = document.getElementById('cco-conv-v2-root');
  const inboxHtml = root.querySelector('[data-v2-inbox]').innerHTML;
  assert.match(inboxHtml, /Inga konversationer/i, 'tom inbox ska visa tomt-läge');
});

test('v2-skalet: om-rendering är idempotent (ingen dubbel-mount)', () => {
  const { document, api } = loadShell();
  api.render(makeCtx());
  api.render(makeCtx());
  const roots = document.querySelectorAll('#cco-conv-v2-root');
  assert.equal(roots.length, 1, 'får bara finnas ett #cco-conv-v2-root efter om-rendering');
});
