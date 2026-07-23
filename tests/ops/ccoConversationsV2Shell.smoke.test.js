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

test('v2-skalet: default-Inkorg visar hela aktiva kön; Skickat filtrerar till den skickade delmängden', () => {
  // Default-Inkorg visar hela den aktiva scoped kön (paritet med legacy),
  // inklusive trådar där kliniken svarade sist. "Skickat" är ett icke-
  // uteslutande filter för delmängden isSentThread. Tidigare uteslöt Inkorg
  // allt isSentThread, vilket tömde inkorgen i en aktiv kö.
  const { window, document, api } = loadShell();
  const inboxThread = makeThread({ id: 'inbox-1', customerName: 'Inkommande' });
  const sentThread = makeThread({
    id: 'sent-1',
    customerName: 'KlinikSvaradeSist',
    raw: { lastOutboundAt: '2026-06-20T11:00:00Z', lastInboundAt: '2026-06-20T10:00:00Z' },
  });
  api.render(makeCtx({ laneThreads: [inboxThread, sentThread], allThreads: [inboxThread, sentThread] }));

  const inbox = document.querySelector('[data-v2-inbox]');
  assert.match(inbox.textContent, /Inkommande/);
  assert.match(inbox.textContent, /KlinikSvaradeSist/);

  document
    .querySelector('[data-v2-folder="sent"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.match(inbox.textContent, /KlinikSvaradeSist/);
  assert.doesNotMatch(inbox.textContent, /Inkommande/);
});

test('v2-skalet: default-Inkorg gömmer inte trådar när kliniken svarade sist eller inbound-tid saknas', () => {
  // Regression: mapp-filtret klassade varje tråd där kliniken svarade sist
  // (lastOutboundAt >= lastInboundAt) ELLER som saknade inbound-tid som
  // "Skickat" och gömde den från default-Inkorg → hela inkorgen blev tom trots
  // inläst data, osynligt för getRuntimeMailboxParitySnapshot().counts.
  const now = Date.now();
  const day = 86400000;
  const clinicRepliedLast = makeThread({
    id: 't-clinic-last',
    customerName: 'Klinik Svarade Sist',
    lastInboundAt: new Date(now - day).toISOString(),
    lastOutboundAt: new Date(now).toISOString(),
  });
  const missingInbound = makeThread({
    id: 't-missing-inbound',
    customerName: 'Saknar Inbound',
    lastOutboundAt: new Date(now).toISOString(),
  });
  const { document, api } = loadShell();
  api.render(
    makeCtx({
      laneThreads: [clinicRepliedLast, missingInbound],
      allThreads: [clinicRepliedLast, missingInbound],
      selected: null,
    })
  );
  const inbox = document.querySelector('[data-v2-inbox]');
  assert.equal(inbox.querySelector('.inbox-empty'), null, 'default-Inkorg får inte vara tom när aktiva trådar finns');
  const rows = inbox.querySelectorAll('.thread[data-thread-id]');
  assert.equal(rows.length, 2, 'båda aktiva trådarna ska synas i default-Inkorg');
  assert.match(inbox.textContent, /Klinik Svarade Sist/);
  assert.match(inbox.textContent, /Saknar Inbound/);
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

test('v2-skalet: "Mer"-menyn exponerar alla åtta admin#cco-paneler och togglas + routar via handlers.action', async () => {
  const { window, document, api } = loadShell();
  const actions = [];
  const ctx = makeCtx({
    handlers: {
      ...makeCtx().handlers,
      action(name, thread) {
        actions.push({ name, threadId: thread && thread.id });
        return Promise.resolve({ ok: true });
      },
    },
  });
  api.render(ctx);

  const root = document.getElementById('cco-conv-v2-root');
  const toggle = root.querySelector('[data-v2-thread] [data-v2-more-toggle]');
  const menu = root.querySelector('[data-v2-thread] [data-v2-more-menu]');
  assert.ok(toggle, '"Mer"-toggeln ska finnas i action-baren');
  assert.ok(menu, '"Mer"-menyn ska finnas i action-baren');
  assert.equal(menu.hasAttribute('hidden'), true, 'menyn ska vara stängd som default');

  // Alla åtta återstående paneler ska finnas som menyval.
  const expected = [
    'makron',
    'notiser',
    'skickat',
    'senarekopanel',
    'noshow',
    'signering',
    'portal',
    'nyttmail',
  ];
  for (const action of expected) {
    assert.ok(
      menu.querySelector('[data-v2-action="' + action + '"]'),
      '"Mer"-menyn saknar panel: ' + action
    );
  }

  // Toggeln öppnar menyn.
  toggle.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(menu.hasAttribute('hidden'), false, 'klick på toggeln ska öppna menyn');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  // Ett menyval routar via handlers.action (som i sin tur öppnar launcher-panelen)
  // och stänger menyn.
  menu
    .querySelector('[data-v2-action="makron"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  await Promise.resolve();
  assert.deepEqual(actions, [{ name: 'makron', threadId: 't-1' }]);
  assert.equal(menu.hasAttribute('hidden'), true, 'menyn ska stängas efter ett val');
});

test('v2-skalet: Bokning/Kalender/Dossier är alltid klickbara men låser aldrig obekräftad patient', () => {
  const { document, api } = loadShell();
  const unknownThread = makeThread({
    v2Handoff: {
      available: false,
      reason: 'Kundkopplingen är oklar eller saknas. Öppna först Granskning.',
    },
  });
  api.render(makeCtx({ laneThreads: [unknownThread], allThreads: [unknownThread], selected: unknownThread }));

  const root = document.getElementById('cco-conv-v2-root');
  // Knapparna beter sig som admin#cco:s bubblor: alltid klickbara. Panelen
  // (launchern) sköter kundvalet — vi grindar inte längre på handoff.
  for (const action of ['booking', 'calendar', 'dossier']) {
    const button = root.querySelector('[data-v2-action="' + action + '"]');
    assert.equal(button.disabled, false, action + ' ska vara klickbar (som admin#cco)');
  }
  // Fail-closed-nyansen finns kvar där det spelar roll: ingen obekräftad patient
  // exponeras som låst boknings-/patient-id på den faktiska bokningsåtgärden.
  assert.equal(
    root.querySelector('[data-v2-action="booking"]').hasAttribute('data-booking-context-patient-id'),
    false,
    'obekräftad matchning får aldrig låsa ett boknings-/patient-id'
  );
});

test('v2-skalet: oklar kundmatchning (ambiguous) surfas som Manuell kundgranskning — inte annars', () => {
  const { document, api } = loadShell();
  const ambiguous = makeThread({
    id: 't-amb',
    customerName: 'Oklar Kund',
    patientMatch: { status: 'ambiguous' },
  });
  const clear = makeThread({ id: 't-clear', customerName: 'Tydlig Kund' });
  api.render(
    makeCtx({ laneThreads: [ambiguous, clear], allThreads: [ambiguous, clear], selected: ambiguous })
  );

  const root = document.getElementById('cco-conv-v2-root');
  // Header-pill på vald tråd.
  assert.match(
    root.querySelector('[data-v2-thread]').textContent,
    /Manuell kundgranskning/,
    'oklar matchning ska visa Manuell kundgranskning-pill i trådhuvudet'
  );
  // Listrad-tagg på den oklara tråden.
  const ambRow = root.querySelector('[data-thread-id="t-amb"]');
  assert.match(ambRow.textContent, /Kundgranskning/, 'oklar tråd ska ha Kundgranskning-tagg i listan');
  // Den tydliga tråden får ingen granskningsmarkör.
  const clearRow = root.querySelector('[data-thread-id="t-clear"]');
  assert.doesNotMatch(
    clearRow.textContent,
    /Kundgranskning/,
    'en entydig kundmatchning får aldrig flaggas för granskning'
  );
});

test('v2-skalet: bekräftad patientmatchning öppnar trådscopade handoffar', () => {
  const { document, api } = loadShell();
  const matchedThread = makeThread({
    v2Handoff: { available: true, reason: '' },
    v2Testability: {
      noteConversationId: 't-1',
      bookingPatientId: 'patient-canonical-1',
    },
  });
  api.render(makeCtx({ laneThreads: [matchedThread], allThreads: [matchedThread], selected: matchedThread }));

  const root = document.getElementById('cco-conv-v2-root');
  for (const action of ['booking', 'calendar', 'dossier']) {
    const button = root.querySelector('[data-v2-action="' + action + '"]');
    assert.equal(button.disabled, false, action + ' ska vara möjlig vid exakt patientmatchning');
  }
  for (const button of root.querySelectorAll('[data-v2-action="note"]')) {
    assert.equal(button.getAttribute('data-note-conversation-id'), 't-1');
  }
  assert.equal(
    root.querySelector('[data-v2-thread] .action-btn--booking').getAttribute('data-booking-context-patient-id'),
    'patient-canonical-1',
    'den faktiska bokningsåtgärden ska bära samma kanoniska patientkontext som handoffen'
  );
});

test('v2-skalet: testbarhetsmarkörer läcker inte patient-id för oklar eller publik kontext', () => {
  const { document, api } = loadShell();
  const unknownThread = makeThread({
    v2Handoff: { available: false, reason: 'Granskning krävs.' },
    v2Testability: {
      noteConversationId: 't-1',
      bookingPatientId: 'patient-far-inte-lacka',
    },
  });
  api.render(makeCtx({ laneThreads: [unknownThread], allThreads: [unknownThread], selected: unknownThread }));

  const root = document.getElementById('cco-conv-v2-root');
  assert.equal(
    root.querySelector('[data-v2-action="note"]').getAttribute('data-note-conversation-id'),
    't-1',
    'smart anteckning ska kunna bindas till vald tråd även när patienten granskas'
  );
  assert.equal(
    root.querySelector('[data-v2-action="booking"]').hasAttribute('data-booking-context-patient-id'),
    false,
    'oklar matchning får aldrig exponera ett boknings-/patient-id'
  );

  const publicThread = makeThread({ v2Handoff: { available: true, reason: '' } });
  api.render(makeCtx({ laneThreads: [publicThread], allThreads: [publicThread], selected: publicThread }));
  assert.equal(
    root.querySelector('[data-v2-action="note"]').hasAttribute('data-note-conversation-id'),
    false,
    'utan autentiserad testbarhetskontext exponeras ingen trådmarkör'
  );
  assert.equal(
    root.querySelector('[data-v2-action="booking"]').hasAttribute('data-booking-context-patient-id'),
    false,
    'utan autentiserad testbarhetskontext exponeras ingen patientmarkör'
  );
});

test('v2-skalet: HTML-mail renderas sandboxat, utan Outlook-notis eller rå CID', () => {
  const { document, api } = loadShell();
  const richThread = makeThread({
    threadDocument: {
      messages: [
        {
          messageId: 'rich-1',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T10:00:00Z',
          primaryBody: {
            html: '<p>Hej!</p><p>Du får inte e-post ofta från någon <a href="https://aka.ms/LearnAboutSenderIdentification">Läs mer</a></p><img src="cid:historisk-logga"><script>alert(1)</script>',
            text: 'Hej!',
          },
        },
      ],
    },
  });
  api.render(makeCtx({ laneThreads: [richThread], allThreads: [richThread], selected: richThread }));
  const html = document.querySelector('[data-v2-thread]').innerHTML;
  assert.match(html, /v2-msg-html-frame/, 'HTML-mail ska isoleras i en sandboxad iframe');
  assert.doesNotMatch(html, /alert\(1\)|cid:historisk-logga|LearnAboutSenderIdentification/);
  assert.match(html, /En inlinebild saknas i det här äldre mailet/);
});

test('v2-skalet: äldre null-mailDocument faller tillbaka till text utan att krascha', () => {
  const { document, api } = loadShell();
  const legacyThread = makeThread({
    threadDocument: {
      messages: [
        {
          messageId: 'legacy-null-document',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T10:00:00Z',
          mailDocument: null,
          primaryBody: null,
          presentation: null,
          body: 'Äldre mailtext utan rich-mail-dokument.',
        },
      ],
    },
  });

  assert.doesNotThrow(() => {
    api.render(makeCtx({
      laneThreads: [legacyThread],
      allThreads: [legacyThread],
      selected: legacyThread,
    }));
  });
  assert.match(
    document.querySelector('[data-v2-thread]').textContent,
    /Äldre mailtext utan rich-mail-dokument\./,
    'det äldre mailet ska använda text-fallback utan att fälla hela skalet'
  );
});

test('v2-skalet: vanlig bilaga visas separat medan inline-signatur inte dupliceras', () => {
  const { document, api } = loadShell();
  const thread = makeThread({
    threadDocument: {
      messages: [
        {
          messageId: 'attachment-1',
          mailboxId: 'info@hairtpclinic.com',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T10:00:00Z',
          primaryBody: { html: '<p>Se dokumentet.</p>', text: 'Se dokumentet.' },
          attachments: [
            { attachmentId: 'file-1', name: 'underlag.pdf', contentType: 'application/pdf' },
            { attachmentId: 'logo-1', name: 'signatur.gif', contentType: 'image/gif', isInline: true },
          ],
        },
      ],
    },
  });
  api.render(makeCtx({ laneThreads: [thread], allThreads: [thread], selected: thread }));
  const attachments = document.querySelectorAll('[data-v2-attachment-index]');
  assert.equal(attachments.length, 1, 'inline-signatur ska inte visas igen som användarbilaga');
  assert.match(attachments[0].textContent, /underlag\.pdf/);
});

test('v2-skalet: Info är strikt i listan men behåller befintlig samlad kundhistorik inne i tråden', () => {
  const { document, api } = loadShell();
  const infoThread = makeThread({
    id: 'info@hairtpclinic.com:conv-1',
    customerName: 'Linn Carlsson',
    mailboxId: 'info@hairtpclinic.com',
    threadDocument: {
      messages: [
        {
          messageId: 'contact-history',
          mailboxId: 'contact@hairtpclinic.com',
          direction: 'inbound',
          author: 'Linn Carlsson',
          sentAt: '2026-06-18T10:00:00Z',
          primaryBody: { text: 'Tidigare kontakt-historik.' },
        },
        {
          messageId: 'info-history',
          mailboxId: 'info@hairtpclinic.com',
          direction: 'inbound',
          author: 'Linn Carlsson',
          sentAt: '2026-06-20T10:00:00Z',
          primaryBody: { text: 'Info-historik.' },
        },
      ],
    },
  });
  api.render(
    makeCtx({
      laneThreads: [infoThread],
      allThreads: [infoThread],
      selected: infoThread,
      mailboxes: [{ id: 'info@hairtpclinic.com', label: 'Info', email: 'info@hairtpclinic.com' }],
      selectedMailboxIds: ['info@hairtpclinic.com'],
    })
  );
  assert.equal(document.querySelectorAll('[data-v2-inbox] [data-thread-id]').length, 1);
  const stream = document.querySelector('[data-v2-thread]').textContent;
  assert.match(stream, /Tidigare kontakt-historik/);
  assert.match(stream, /Info-historik/);
});

test('v2-skalet: Svarstudio använder runtime-signatur, mailbox-avsändare och snabbsvar utan skrivning', () => {
  const { window, document, api } = loadShell();
  const thread = makeThread({
    id: 'contact@hairtpclinic.com:conv-reply',
    mailboxId: 'contact@hairtpclinic.com',
    customerEmail: 'anna@example.com',
    customerName: 'Anna Karlsson',
    subject: 'Boka konsultation',
  });
  api.render(
    makeCtx({
      laneThreads: [thread],
      allThreads: [thread],
      selected: thread,
      studioSignatures: [
        {
          id: 'contact',
          label: 'Contact-teamet',
          senderMailboxId: 'contact@hairtpclinic.com',
          email: 'contact@hairtpclinic.com',
          text: 'Med vänliga hälsningar,\nContact-teamet',
        },
      ],
      studioDefaultSignatureId: 'contact',
      studioSenderMailboxOptions: [
        { id: 'contact@hairtpclinic.com', label: 'Contact', email: 'contact@hairtpclinic.com' },
      ],
      studioDefaultSenderMailboxId: 'contact@hairtpclinic.com',
      studioDefaultRecipient: 'anna@example.com',
      handlers: {
        ...makeCtx().handlers,
        studioSave() {
          throw new Error('snabbsvar får inte skriva utkast automatiskt');
        },
      },
    })
  );

  document
    .querySelector('[data-v2-action="studio"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  const studio = document.querySelector('[data-v2-studio]');
  assert.ok(studio, 'Svarstudio ska öppnas från vald tråd');
  assert.match(studio.textContent, /Contact-teamet/);
  assert.equal(studio.querySelector('[data-studio-recipient]').value, 'anna@example.com');
  assert.equal(studio.querySelector('[data-studio-sender]').value, 'contact@hairtpclinic.com');

  studio
    .querySelector('[data-studio-macro="confirm_booking"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  const body = studio.querySelector('[data-studio-body]').value;
  assert.match(body, /Hej Anna!/);
  assert.match(body, /Boka konsultation/);
  assert.equal(studio.querySelector('[data-studio-send]').disabled, true, 'owner-send är spärrat utan runtime-gate');
});

test('v2-skalet: owner-sändning använder etablerad draft-transition-send-kedja först efter explicit klick', async () => {
  const { window, document, api } = loadShell();
  const calls = [];
  const thread = makeThread({
    id: 'fazli@hairtpclinic.com:conv-owner',
    mailboxId: 'fazli@hairtpclinic.com',
    customerEmail: 'test@example.com',
  });
  api.render(
    makeCtx({
      laneThreads: [thread],
      allThreads: [thread],
      selected: thread,
      studioOwnerSendAvailable: true,
      studioSenderMailboxOptions: [
        { id: 'fazli@hairtpclinic.com', label: 'Fazli', email: 'fazli@hairtpclinic.com' },
      ],
      studioDefaultSenderMailboxId: 'fazli@hairtpclinic.com',
      studioDefaultRecipient: 'test@example.com',
      handlers: {
        ...makeCtx().handlers,
        studioSave(payload) {
          calls.push(['save', payload.signatureId]);
          return Promise.resolve({ draft: { draftId: 'draft-1', status: 'draft' } });
        },
        studioTransition(draftId, status) {
          calls.push(['transition', draftId, status]);
          return Promise.resolve({ draft: { draftId, status } });
        },
        studioSend(payload) {
          calls.push(['send', payload.draftId, payload.to, payload.senderMailbox]);
          return Promise.resolve({ sent: true, draft: { draftId: payload.draftId, status: 'sent' } });
        },
      },
    })
  );
  document
    .querySelector('[data-v2-action="studio"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  const button = document.querySelector('[data-v2-studio] [data-studio-send]');
  assert.equal(button.disabled, false);
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();

  assert.deepEqual(calls, [
    ['save', 'fazli'],
    ['transition', 'draft-1', 'needs_approval'],
    ['transition', 'draft-1', 'approved'],
    ['send', 'draft-1', 'test@example.com', 'fazli@hairtpclinic.com'],
  ]);
});

test('v2-skalet: appens befintliga Bearer-brygga används för lokala mail-assets', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSource, /async resolveMailAssetUrl\(sourceUrl\)/);
  assert.match(appSource, /pathname !== "\/api\/v1\/cco\/runtime\/mail-asset\/content"/);
  assert.match(appSource, /Authorization: `Bearer \$\{token\}`/);
});

test('v2-skalet: appen återanvänder samma signatur- och owner-send-kontrakt som legacy', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSource, /studioSignatures: getStudioSignatureProfiles\(\)/);
  assert.match(appSource, /signatureId: payload\?\.signatureId/);
  assert.match(appSource, /studioOwnerSendAvailable: state\.prefs\?\.sendEnabled === true/);
  assert.match(appSource, /\/cco-comm\/drafts\/\$\{encodeURIComponent\(asText\(payload\?\.draftId\)\)\}\/send/);
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
