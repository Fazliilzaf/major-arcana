'use strict';

/**
 * DOM-smoke för CCO Konversationer v2 4-zons-skalet.
 *
 * CI:s live-smoke kräver autentiserad kö-data, så den fångar inte
 * render-regressioner i själva skalet. Det här testet laddar den riktiga
 * shell-modulen i en lättviktig DOM. Test-fixturen representerar endast den
 * redan autentiserade runtime-state som app.js lämnar till renderaren; den är
 * inte en runtime-fallback eller en alternativ datakälla.
 *   1. render(ctx) monterar #cco-conv-v2-root utan att kasta,
 *   2. alla fyra zoner finns (lanes · inbox · tråd · kontext),
 *   3. exakt samma scoped conversation keys som legacy-staten flödar in,
 *   4. mock-datan faktiskt flödar in (lane-räknare, trådnamn, vald tråd),
 *   5. om-rendering är idempotent (ingen dubbel-mount).
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
const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

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
  assert.equal(typeof api._paritySnapshot, 'function');
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

test('v2-skalet: fixture-ködata flödar in i lanes och inbox', () => {
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
  assert.deepEqual(
    Array.from(rows)
      .slice(0, 2)
      .map((row) => row.getAttribute('data-thread-id')),
    ['t-1', 't-2'],
    'v2 får inte nöja sig med antal — samma scoped conversation keys ska renderas'
  );

  // Vald tråd reflekteras i kontext/tråd-zonen.
  const threadHtml = root.querySelector('[data-v2-thread]').innerHTML;
  assert.match(threadHtml, /Anna Karlsson/, 'tråd-zonen ska visa den valda tråden');
});

test('v2-skalet: parity snapshot bevarar exakta scoped keys från befintlig runtime-state', () => {
  const { api } = loadShell();
  const ctx = makeCtx({
    allThreads: [
      makeThread({ id: 'contact@hairtpclinic.com:conv-a', customerName: 'Anna' }),
      makeThread({ id: 'kons@hairtpclinic.com:conv-b', customerName: 'Björn' }),
      makeThread({ id: 'contact@hairtpclinic.com:conv-a', customerName: 'Anna dubblett' }),
    ],
    laneThreads: [
      makeThread({ id: 'kons@hairtpclinic.com:conv-b', customerName: 'Björn' }),
    ],
    selected: makeThread({ id: 'kons@hairtpclinic.com:conv-b', customerName: 'Björn' }),
  });

  assert.deepEqual(api._paritySnapshot(ctx), {
    scopedConversationKeys: ['contact@hairtpclinic.com:conv-a', 'kons@hairtpclinic.com:conv-b'],
    laneConversationKeys: ['kons@hairtpclinic.com:conv-b'],
    selectedConversationKey: 'kons@hairtpclinic.com:conv-b',
  });
});

test('v2-skalet: canonical fallback-nyckel används konsekvent när id saknas', () => {
  const { document, api } = loadShell();
  const fallbackThread = makeThread({ id: '', conversationKey: 'contact@hairtpclinic.com:conv-fallback' });
  api.render(
    makeCtx({
      laneThreads: [fallbackThread],
      allThreads: [fallbackThread],
      selected: fallbackThread,
    })
  );

  const row = document.querySelector('[data-thread-id]');
  assert.equal(row.getAttribute('data-thread-id'), 'contact@hairtpclinic.com:conv-fallback');
  assert.equal(
    api._findThreadById({ allThreads: [fallbackThread], laneThreads: [] }, 'contact@hairtpclinic.com:conv-fallback'),
    fallbackThread
  );
});

test('v2-skalet: auth-krav visar aldrig trådar som fallback', () => {
  const { document, api } = loadShell();
  api.render(makeCtx({ laneThreads: [], allThreads: [], selected: null, authRequired: true }));
  const root = document.getElementById('cco-conv-v2-root');
  assert.match(root.querySelector('[data-v2-inbox]').textContent, /Logga in igen i admin/i);
});

test('v2-skalet: för brett mailbox-urval visar ett ärligt scope-fel utan trådar', () => {
  const { document, api } = loadShell();
  api.render(
    makeCtx({
      laneThreads: [],
      allThreads: [],
      selected: null,
      error: 'CCO v2 kan visa en eller två brevlådor åt gången. Välj 1–2 brevlådor och försök igen.',
    })
  );
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  assert.match(inbox.textContent, /en eller två brevlådor/i);
  assert.equal(inbox.querySelectorAll('[data-thread-id]').length, 0);
});

test('v2-skalet: runtime-fel skickas vidare från samma runtime-state som legacy använder', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(
    appSource,
    /authRequired: state\.runtime\?\.authRequired === true,\s*error: asText\(state\.runtime\?\.error\)/,
    'v2 måste få det fail-closed runtime-felet från den befintliga worklist-laddaren'
  );
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

test('v2-skalet: mailboxväljaren använder scoped handler och stannar vid två val', () => {
  const { window, document, api } = loadShell();
  const scopes = [];
  api.render(
    makeCtx({
      mailboxes: [
        { id: 'kons@hairtpclinic.com', label: 'Kons', email: 'kons@hairtpclinic.com' },
        { id: 'contact@hairtpclinic.com', label: 'Contact', email: 'contact@hairtpclinic.com' },
        { id: 'fazli@hairtpclinic.com', label: 'Fazli', email: 'fazli@hairtpclinic.com' },
      ],
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      handlers: {
        ...makeCtx().handlers,
        setMailboxScope(ids) {
          scopes.push(ids);
        },
      },
    })
  );

  const contact = document.querySelector('[data-v2-mailbox="contact@hairtpclinic.com"]');
  contact.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(scopes, [['kons@hairtpclinic.com', 'contact@hairtpclinic.com']]);

  // Runtime laddar om och matar tillbaka auktoritativ scope vid nästa render.
  api.render(
    makeCtx({
      mailboxes: [
        { id: 'kons@hairtpclinic.com', label: 'Kons', email: 'kons@hairtpclinic.com' },
        { id: 'contact@hairtpclinic.com', label: 'Contact', email: 'contact@hairtpclinic.com' },
        { id: 'fazli@hairtpclinic.com', label: 'Fazli', email: 'fazli@hairtpclinic.com' },
      ],
      selectedMailboxIds: ['kons@hairtpclinic.com', 'contact@hairtpclinic.com'],
    })
  );

  const fazli = document.querySelector('[data-v2-mailbox="fazli@hairtpclinic.com"]');
  assert.equal(fazli.disabled, true, 'tredje mailbox ska inte kunna ge ett för brett scope');
});

test('v2-skalet: ett gammalt överbrett mailbox-scope återställs genom ett tydligt val', () => {
  const { window, document, api } = loadShell();
  const scopes = [];
  api.render(
    makeCtx({
      mailboxes: [
        { id: 'kons@hairtpclinic.com', label: 'Kons' },
        { id: 'contact@hairtpclinic.com', label: 'Contact' },
        { id: 'fazli@hairtpclinic.com', label: 'Fazli' },
      ],
      selectedMailboxIds: [
        'kons@hairtpclinic.com',
        'contact@hairtpclinic.com',
        'fazli@hairtpclinic.com',
      ],
      handlers: {
        ...makeCtx().handlers,
        setMailboxScope(ids) {
          scopes.push(ids);
        },
      },
    })
  );

  document
    .querySelector('[data-v2-mailbox="contact@hairtpclinic.com"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.deepEqual(scopes, [['contact@hairtpclinic.com']]);
});

test('v2-skalet: Inkorg och Skickat filtrerar samma scoped trådar utan ny datakälla', () => {
  const { window, document, api } = loadShell();
  const inboxThread = makeThread({ id: 'inbox-1', customerName: 'Inkommande' });
  const sentThread = makeThread({
    id: 'sent-1',
    customerName: 'Skickat',
    raw: { lastOutboundAt: '2026-06-20T11:00:00Z', lastInboundAt: '2026-06-20T10:00:00Z' },
  });
  api.render(makeCtx({ laneThreads: [inboxThread, sentThread], allThreads: [inboxThread, sentThread] }));

  const inbox = document.querySelector('[data-v2-inbox]');
  assert.match(inbox.textContent, /Inkommande/);
  assert.doesNotMatch(inbox.textContent, /Skickat/);

  document
    .querySelector('[data-v2-folder="sent"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.match(inbox.textContent, /Skickat/);
  assert.doesNotMatch(inbox.textContent, /Inkommande/);
});

test('v2-skalet: flikbadgar räknar hela scoped urvalet även när Bokning är aktiv', () => {
  const { window, document, api } = loadShell();
  const bookingUnreadVip = makeThread({
    id: 'booking-unread-vip',
    customerName: 'Bokning',
    vip: true,
    intentLabel: 'booking',
  });
  const unread = makeThread({
    id: 'unread',
    customerName: 'Oläst',
    subject: 'Allmän fråga',
    preview: 'Jag undrar en sak.',
    unread: true,
  });
  const vip = makeThread({
    id: 'vip',
    customerName: 'VIP',
    subject: 'Återbesök',
    preview: 'Tack för hjälpen.',
    unread: false,
    vip: true,
  });
  const neutral = makeThread({
    id: 'neutral',
    customerName: 'Neutral',
    subject: 'Neutral fråga',
    preview: 'En vanlig fråga.',
    unread: false,
  });
  api.render(
    makeCtx({
      laneThreads: [bookingUnreadVip, unread, vip, neutral],
      allThreads: [bookingUnreadVip, unread, vip, neutral],
    })
  );

  document
    .querySelector('[data-tab="bokning"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  const tabCounts = Object.fromEntries(
    Array.from(document.querySelectorAll('[data-v2-tabs] [data-tab]')).map((tab) => [
      tab.getAttribute('data-tab'),
      tab.querySelector('.count').textContent,
    ])
  );
  assert.deepEqual(tabCounts, {
    alla: '4',
    olasta: '2',
    bokning: '1',
    vip: '2',
  });
  assert.match(document.querySelector('[data-v2-inbox]').textContent, /Boka PRP-behandling/);
  assert.doesNotMatch(document.querySelector('[data-v2-inbox]').textContent, /Neutral/);
});

test('v2-skalet: fritext och smart etikett använder befintliga trådfält', () => {
  const { window, document, api } = loadShell();
  const priceThread = makeThread({
    id: 'price-1',
    customerName: 'Prisfråga',
    intentLabel: 'pricing',
  });
  const neutralThread = makeThread({ id: 'neutral-1', customerName: 'Neutral kund' });
  api.render(makeCtx({ laneThreads: [priceThread, neutralThread], allThreads: [priceThread, neutralThread] }));

  const inbox = document.querySelector('[data-v2-inbox]');
  assert.match(inbox.textContent, /Prisfråga/);
  const search = document.querySelector('[data-v2-search]');
  search.value = 'neutral';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(inbox.textContent, /Neutral kund/);
  assert.doesNotMatch(inbox.textContent, /Prisfråga/);
});

test('v2-skalet: appen matar mailboxar och vald scope till samma runtime-renderare', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSource, /mailboxes: getAvailableRuntimeMailboxes\(\)\.map/);
  assert.match(
    appSource,
    /selectedMailboxIds: getRequestedRuntimeMailboxIds\(\{ includePreferredFallback: false \}\)/
  );
  assert.match(appSource, /if \(!nextMailboxIds\.length \|\| nextMailboxIds\.length > 2\) return;/);
  assert.match(appSource, /applyRuntimeMailboxSelection\(nextMailboxIds\)/);
});

// Regression (bug-hunt): snabbsvar-utkastet ska överleva en om-rendering
// (bakgrundspoll/tema-toggle skrev tidigare över det skrivna).
test('v2-skalet: quick-reply-utkast överlever om-rendering', () => {
  const { window, document, api } = loadShell();
  api.render(makeCtx());

  const ta = document.querySelector('[data-v3-qr-body]');
  assert.ok(ta, 'quick-reply-textarea ska finnas när en tråd är vald');
  ta.value = 'Hej, vi har en tid på torsdag.';
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));

  // Om-rendering med samma ctx (motsvarar en bakgrundsrefresh).
  api.render(makeCtx());

  const ta2 = document.querySelector('[data-v3-qr-body]');
  assert.equal(
    ta2.value,
    'Hej, vi har en tid på torsdag.',
    'utkastet ska bevaras över om-rendering'
  );
});

test('v2-skalet: persistenta trådåtgärder visas och skickar den valda riktiga tråden till appen', async () => {
  const { window, document, api } = loadShell();
  const actions = [];
  const ctx = makeCtx({
    actionFeedback: { message: 'Markerad som klar.', tone: 'success' },
    handlers: {
      ...makeCtx().handlers,
      action(name, thread) {
        actions.push({ name, threadId: thread.id });
        return Promise.resolve({ ok: true });
      },
    },
  });
  api.render(ctx);

  const root = document.getElementById('cco-conv-v2-root');
  assert.match(root.querySelector('[data-v2-thread]').textContent, /Markera klar/);
  assert.match(root.querySelector('[data-v2-thread]').textContent, /Senare/);
  assert.match(root.querySelector('[data-v2-thread]').textContent, /Återöppna/);
  assert.match(root.querySelector('[data-v2-action-feedback]').textContent, /Markerad som klar/);

  root
    .querySelector('[data-v2-thread] [data-v2-action="handled"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  await Promise.resolve();
  assert.deepEqual(actions, [{ name: 'handled', threadId: 't-1' }]);
});

test('v2-skalet: misslyckad massåtgärd behåller operatörens urval', async () => {
  const { window, document, api } = loadShell();
  const ctx = makeCtx({
    handlers: {
      ...makeCtx().handlers,
      bulkAction() {
        return Promise.reject(new Error('server refused'));
      },
    },
  });
  api.render(ctx);
  const root = document.getElementById('cco-conv-v2-root');
  const checkbox = root.querySelector('[data-thread-select="t-1"]');
  checkbox.dispatchEvent(new window.Event('click', { bubbles: true }));
  root
    .querySelector('[data-v3-bulk="handled"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.ok(
    root.querySelector('[data-thread-select="t-1"]').getAttribute('aria-checked') === 'true',
    'ett avvisat serversvar får inte tyst rensa det valda urvalet'
  );
});
