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
const V2_CSS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'cco-conversations-v2.css'
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

test('v2-skalet: mailboxväljaren använder scoped handler för hela admin-scope', () => {
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
      handlers: {
        ...makeCtx().handlers,
        setMailboxScope(ids) {
          scopes.push(ids);
        },
      },
    })
  );

  const fazli = document.querySelector('[data-v2-mailbox="fazli@hairtpclinic.com"]');
  assert.equal(fazli.disabled, false, 'tredje mailbox ska kunna läggas till i V2-scope');
  fazli.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(scopes.at(-1), [
    'kons@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'fazli@hairtpclinic.com',
  ]);
});

test('v2-skalet: mailboxväljaren ligger i vänstra köfältet med kompakt fallback', () => {
  const { document, api } = loadShell();
  api.render(
    makeCtx({
      mailboxes: [{ id: 'kons@hairtpclinic.com', label: 'Kons' }],
      selectedMailboxIds: ['kons@hairtpclinic.com'],
    })
  );

  const root = document.getElementById('cco-conv-v2-root');
  const sidebarControls = root.querySelector('.lane-sidebar [data-v2-mailboxes]');
  const compactControls = root.querySelector('.inbox-shell [data-v2-mailboxes-compact]');
  assert.ok(sidebarControls, 'desktop-scope ska ligga i vänstra köfältet');
  assert.ok(compactControls, 'smal layout ska behålla en mailbox-kontroll i inboxen');
  assert.equal(sidebarControls.querySelectorAll('[data-v2-mailbox]').length, 1);
  assert.equal(compactControls.querySelectorAll('[data-v2-mailbox]').length, 1);
});

test('v2-skalet: mailboxmenyn visar historik per konto och Inkorg visar sammanfattat valt scope', () => {
  const { document, api } = loadShell();
  const konsThread = makeThread({
    id: 'kons-1',
    mailboxId: 'kons@hairtpclinic.com',
    mailboxBadge: 'Kons',
    needsReply: true,
  });
  const infoThreads = [
    makeThread({ id: 'info-1', mailboxId: 'info@hairtpclinic.com', mailboxBadge: 'Info', unread: false }),
    makeThread({ id: 'info-2', mailboxId: 'info@hairtpclinic.com', mailboxBadge: 'Info', unread: false }),
  ];
  api.render(
    makeCtx({
      laneThreads: [konsThread, ...infoThreads],
      allThreads: [konsThread, ...infoThreads],
      mailboxes: [
        { id: 'kons@hairtpclinic.com', label: 'Kons', email: 'kons@hairtpclinic.com' },
        { id: 'info@hairtpclinic.com', label: 'Info', email: 'info@hairtpclinic.com' },
      ],
      selectedMailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
      mailboxMetrics: [
        { mailboxId: 'kons@hairtpclinic.com', inboxCount: 4976, sentCount: 4457, messageCount: 9433 },
        { mailboxId: 'info@hairtpclinic.com', inboxCount: 42, sentCount: 11, messageCount: 53 },
      ],
    })
  );

  const root = document.getElementById('cco-conv-v2-root');
  const kons = root.querySelector('[data-v2-mailbox="kons@hairtpclinic.com"]');
  const info = root.querySelector('[data-v2-mailbox="info@hairtpclinic.com"]');
  assert.equal(kons.getAttribute('type'), 'checkbox', 'varje konto ska kunna checkas av');
  assert.equal(info.hasAttribute('checked'), true, 'valt konto ska vara markerat');
  assert.match(root.querySelector('[data-v2-mailboxes]').textContent, /Kons[\s\S]*4976 ink\. · 4457 skick\./);
  assert.match(root.querySelector('[data-v2-mailboxes]').textContent, /Info[\s\S]*42 ink\. · 11 skick\./);
  assert.match(root.querySelector('[data-v2-inbox-h2]').textContent, /1 oläst · 1 behöver svar · 3 trådar · 9486 mail/);
  assert.match(root.querySelector('[data-v2-mailbox-summary]').textContent, /Inkorg \+ Skickat · hela historiken/);
  assert.doesNotMatch(root.querySelector('[data-v2-mailbox-summary]').textContent, /Kons|Info/);
});

test('v2-skalet: ett brett mailbox-scope kan förfinas ett konto i taget', () => {
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

  assert.deepEqual(scopes, [['kons@hairtpclinic.com', 'fazli@hairtpclinic.com']]);
});

test('v2-skalet: en stor mailbox-kö virtualiseras utan att tappa trådar', () => {
  // Tidigare: 120 rader + "Visa fler"-knapp. Nu portas admin#cco:s
  // scroll-virtualisering: bara det synliga fönstret ligger i DOM, resten bärs
  // av höjd-satta spacers. Det är det som låter alla konton samsas utan att
  // frysa browsern (top-risken bekräftad live vid tre konton).
  const { document, api } = loadShell();
  const threads = Array.from({ length: 121 }, (_, index) =>
    makeThread({ id: `thread-${index}`, customerName: `Kund ${index}` })
  );
  api.render(makeCtx({ laneThreads: threads, allThreads: threads }));

  const domRows = document.querySelectorAll('[data-v2-inbox] .thread').length;
  assert.ok(domRows > 0, 'något fönster ska renderas');
  assert.ok(domRows < 121, 'hela listan får INTE ligga i DOM samtidigt (virtualiserad)');

  // "Visa fler"-modellen är ersatt av virtualisering.
  assert.equal(document.querySelector('[data-v2-load-more]'), null, 'ingen load-more-knapp längre');
  assert.ok(document.querySelector('[data-v2-inbox-mount]'), 'virtuell mount ska finnas');
  assert.notEqual(
    document.querySelector('[data-v2-inbox-spacer-bottom]').style.height,
    '0px',
    'bottom-spacer ska bära de off-screen raderna'
  );

  // Inga trådar tappas: range-matten når sista tråden vid full scroll.
  const endRange = api._computeInboxVisibleRange(121, 999999, 880, 68);
  assert.equal(endRange.end, 121, 'sista tråden nås vid nedskrollning');
});

test('v2-skalet: Mer-menyn stängs när operatören klickar i arbetsytan', () => {
  const { window, document, api } = loadShell();
  api.render(makeCtx());

  const toggle = document.querySelector('[data-v2-more-toggle]');
  const menu = document.querySelector('[data-v2-more-menu]');
  assert.ok(toggle, 'Mer-knappen ska finnas');
  assert.ok(menu, 'Mer-menyn ska finnas');
  toggle.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(menu.hasAttribute('hidden'), false, 'Mer-menyn ska öppnas vid klick');

  document
    .querySelector('[data-thread-id]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(menu.hasAttribute('hidden'), true, 'Mer-menyn ska stängas vid klick utanför');
});

test('v2-skalet: korta trådar tvingas inte till en tom viewport-hög läsyta', () => {
  const css = fs.readFileSync(V2_CSS_PATH, 'utf8');
  assert.match(
    css,
    /#cco-conv-v2-root \.thread-shell\s*\{[\s\S]{0,500}?min-height:\s*0;/,
    'desktopens trådyta ska följa innehållet'
  );
  assert.doesNotMatch(
    css,
    /#cco-conv-v2-root \.thread-shell\s*\{[\s\S]{0,500}?min-height:\s*calc\(100vh - 80px\)/,
    'desktopens trådyta får inte fylla en tom viewport'
  );
});

test('v2-skalet: dold Mer-meny kan inte bli en kvarliggande vit popover', () => {
  const css = fs.readFileSync(V2_CSS_PATH, 'utf8');
  assert.match(
    css,
    /#cco-conv-v2-root\s+\.v2-more-menu\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
    'hidden måste vinna över menyens inline display:flex'
  );
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
  assert.match(appSource, /mailboxMetrics: asArray\(state\.runtime\?\.mailboxDiagnostics\?\.truthPrimary\?\.mailboxReports\)/);
  assert.match(appSource, /mailboxReports: truthMailboxReports/);
  assert.doesNotMatch(appSource, /nextMailboxIds\.length > 2/);
  assert.match(appSource, /const defaultScope = availableIds;/);
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

test('v2-skalet: HTML-mail behåller en läsbar responsiv bredd i meddelanderaden', () => {
  const css = fs.readFileSync(V2_CSS_PATH, 'utf8');

  assert.match(
    css,
    /\.msg-bubble--html\s*\{[\s\S]*?width:\s*min\(720px,\s*62vw\)/,
    'HTML-mail får inte krympa till iframens inbyggda bredd i flex-raden'
  );
  assert.match(
    css,
    /\.v2-msg-html-frame\s*\{[\s\S]*?width:\s*100%/,
    'iframen ska fylla den responsiva HTML-mailbubblan'
  );
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

test('v2-skalet: senaste hela mailet visas först i den befintliga V2-designen', () => {
  const { document, api } = loadShell();
  const thread = makeThread({
    threadDocument: {
      messages: [
        {
          messageId: 'older-message',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T09:00:00Z',
          primaryBody: { text: 'Äldre mail.' },
        },
        {
          messageId: 'newest-message',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T11:00:00Z',
          primaryBody: { text: 'Senaste mail.' },
        },
      ],
    },
  });

  api.render(makeCtx({ laneThreads: [thread], allThreads: [thread], selected: thread }));
  assert.deepEqual(
    Array.from(document.querySelectorAll('[data-v2-thread] [data-v2-message-id]')).map((message) =>
      message.getAttribute('data-v2-message-id')
    ),
    ['newest-message', 'older-message'],
    'V2 ska visa senaste mailet först, som admin#cco'
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

test('v2-skalet: direktläst rich mail prioriteras före äldre historikprojektion', () => {
  const { document, api } = loadShell();
  const thread = makeThread({
    threadDocument: {
      messages: [
        {
          messageId: 'stale-summary',
          direction: 'inbound',
          author: 'Anna Karlsson',
          sentAt: '2026-06-20T09:00:00Z',
          primaryBody: { text: 'Äldre, begränsad historik.' },
        },
      ],
    },
    directMailMessages: [
      {
        messageId: 'direct-rich-message',
        mailboxId: 'info@hairtpclinic.com',
        direction: 'inbound',
        author: 'Anna Karlsson',
        sentAt: '2026-06-20T11:00:00Z',
        primaryBody: {
          text: 'Hela mailet.',
          html: '<p>Hela <strong>mailet</strong>.</p>',
        },
        attachments: [
          { attachmentId: 'direct-file', name: 'underlag.pdf', contentType: 'application/pdf' },
        ],
      },
    ],
  });

  api.render(makeCtx({ laneThreads: [thread], allThreads: [thread], selected: thread }));

  assert.deepEqual(
    Array.from(document.querySelectorAll('[data-v2-thread] .msg[data-v2-message-id]')).map((message) =>
      message.getAttribute('data-v2-message-id')
    ),
    ['direct-rich-message'],
    'den scoped direkta payloaden ska vinna över en äldre sammanfattad historikpayload'
  );
  assert.equal(document.querySelectorAll('.v2-msg-html-frame').length, 1);
  assert.match(document.querySelector('[data-v2-attachment-index]').textContent, /underlag\.pdf/);
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

test('v2-skalet: Svarstudio öppnar admin#cco:s panel — ingen egen V2-studio', () => {
  // Svarstudio var den ENDA panelen V2 reimplementerade i stället för att
  // återanvända admin#cco:s. Den inline-studion är borttagen: alla tre
  // ingångarna (actionknapp, snabbsvarets studio-knapp, kommandopaletten)
  // routar nu via handlers.action('studio') → CCOBottomActions.run('svarstudio'),
  // exakt som de tolv övriga panelerna.
  const { window, document, api } = loadShell();
  const actions = [];
  const thread = makeThread({ id: 'contact@hairtpclinic.com:conv-reply' });
  api.render(
    makeCtx({
      laneThreads: [thread],
      allThreads: [thread],
      selected: thread,
      handlers: {
        ...makeCtx().handlers,
        action(name, passedThread) {
          actions.push([name, passedThread && passedThread.id]);
        },
      },
    })
  );

  document
    .querySelector('[data-v2-action="studio"]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.deepEqual(
    actions,
    [['studio', 'contact@hairtpclinic.com:conv-reply']],
    'studio-knappen ska delegera till app-handlern med tråden'
  );
  assert.equal(
    document.querySelector('[data-v2-studio]'),
    null,
    'ingen egen V2-studio får renderas längre'
  );

  // Snabbsvarets studio-knapp ska gå samma väg.
  const qrStudio = document.querySelector('[data-v3-qr-studio]');
  if (qrStudio) {
    qrStudio.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(actions.length, 2, 'snabbsvarets studio-knapp ska också delegera');
    assert.equal(actions[1][0], 'studio');
  }
});

test('v2-skalet: snabbsvarets studio-knapp går via launchern med preset-kontext', () => {
  // Codex-fynd: det tidigare testet mockade bara handlers.action, så snabbsvaret
  // föll tillbaka på app-handlern eftersom CCOBottomActions saknades i harnessen.
  // I produktion anropar skalet launchern DIREKT med preset-kontext. Här spionerar
  // vi på den riktiga vägen.
  const { window, document, api } = loadShell();
  const launcherCalls = [];
  window.CCOBottomActions = {
    run(action, context) {
      launcherCalls.push({ action, context });
    },
  };

  const thread = makeThread({
    id: 'contact@hairtpclinic.com:conv-qr',
    customerName: 'Anna Karlsson',
    subject: 'Boka konsultation',
    customerEmail: 'anna@example.com',
  });
  const fallbackActions = [];
  api.render(
    makeCtx({
      laneThreads: [thread],
      allThreads: [thread],
      selected: thread,
      handlers: {
        ...makeCtx().handlers,
        action(name, passedThread) {
          fallbackActions.push([name, passedThread && passedThread.id]);
        },
      },
    })
  );

  const qrStudio = document.querySelector('[data-v3-qr-studio]');
  assert.ok(qrStudio, 'snabbsvarets studio-knapp ska finnas');
  qrStudio.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(launcherCalls.length, 1, 'launchern ska ha anropats exakt en gång');
  assert.equal(launcherCalls[0].action, 'svarstudio', "run() ska anropas med 'svarstudio'");
  assert.equal(
    fallbackActions.length,
    0,
    'med launcher laddad ska app-handler-fallbacken INTE användas'
  );

  // Preset-kontexten ska bära trådens identitet, inte tvinga panelen att
  // skrapa legacy-DOM.
  const context = launcherCalls[0].context;
  assert.ok(context, 'run() ska få preset-kontext');
  assert.equal(context.source, 'cco-conversations-v2');
  assert.equal(context.conversationKey, 'contact@hairtpclinic.com:conv-qr');
  assert.equal(context.subject, 'Boka konsultation');
  assert.equal(context.email, 'anna@example.com');
  // Patientlåset är fail-closed: utan bekräftad handoff sätts inget patientId.
  assert.equal(context.patientId, '', 'obekräftad patient får aldrig låsas i kontexten');
});

test('v2-skalet: kommandopalettens Svarstudio går samma launcher-väg', () => {
  const { window, document, api } = loadShell();
  const launcherCalls = [];
  window.CCOBottomActions = {
    run(action, context) {
      launcherCalls.push({ action, context });
    },
  };

  const thread = makeThread({ id: 'kons@hairtpclinic.com:conv-cmdk' });
  api.render(makeCtx({ laneThreads: [thread], allThreads: [thread], selected: thread }));

  // Öppna kommandopaletten (⌘K) och kör posten "Öppna Svarstudio".
  // linkedom saknar KeyboardEvent-konstruktorn, så vi bygger en Event och
  // sätter fälten handlern faktiskt läser (key, metaKey).
  // linkedom saknar dessutom input.setSelectionRange, som paletten anropar för
  // att placera markören. Polyfilla den — det är en harness-lucka, inte
  // produktbeteende.
  try {
    if (window.HTMLInputElement && window.HTMLInputElement.prototype) {
      window.HTMLInputElement.prototype.setSelectionRange = function () {};
    }
  } catch (_polyfillError) {
    /* ignoreras — fångas nedan om paletten ändå inte kan renderas */
  }
  const cmdkKey = new window.Event('keydown', { bubbles: true });
  cmdkKey.key = 'k';
  cmdkKey.metaKey = true;
  document.dispatchEvent(cmdkKey);
  const items = Array.from(document.querySelectorAll('[data-v3-cmdk-i]'));
  assert.ok(items.length, 'kommandopaletten ska ha öppnats med poster');
  const studioItem = items.find((item) => /Svarstudio/.test(item.textContent || ''));
  assert.ok(studioItem, 'posten "Öppna Svarstudio" ska finnas i paletten');
  studioItem.dispatchEvent(new window.Event('click', { bubbles: true }));

  assert.equal(launcherCalls.length, 1, 'paletten ska öppna admins panel via launchern');
  assert.equal(launcherCalls[0].action, 'svarstudio');
  assert.equal(launcherCalls[0].context.conversationKey, 'kons@hairtpclinic.com:conv-cmdk');
});

test('v2-skalet: den inbyggda studions draft/send-väg är borta ur skalet', () => {
  const shellSource = fs.readFileSync(SHELL_PATH, 'utf8');
  // Ingen parallell studio-implementation kvar — bara delegeringen.
  assert.doesNotMatch(shellSource, /function openStudio\(/, 'inline-studion ska vara borttagen');
  assert.doesNotMatch(shellSource, /function renderStudio\(/);
  assert.doesNotMatch(shellSource, /handlers\.studioSend/, 'send går via admins panel');
  assert.doesNotMatch(shellSource, /handlers\.studioTransition/);
  assert.doesNotMatch(shellSource, /handlers\.studioGenerate/);
  assert.match(shellSource, /function openSvarstudioPanel\(/, 'delegeringen ska finnas');

  // app.js ska routa studio till den delade launchern.
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(
    appSource,
    /key === "studio"[\s\S]{0,1500}studioLauncher\.run\("svarstudio"\)/,
    'action("studio") ska köra admin#cco:s svarstudio-panel'
  );
  // Snabbsvarets utkast-sparning behålls (samma gateway, inte en studio).
  assert.match(appSource, /async studioSave\(payload\)/);
});

test('v2-skalet: appens befintliga Bearer-brygga används för lokala mail-assets', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  assert.match(appSource, /async resolveMailAssetUrl\(sourceUrl\)/);
  assert.match(appSource, /pathname !== "\/api\/v1\/cco\/runtime\/mail-asset\/content"/);
  assert.match(appSource, /Authorization: `Bearer \$\{token\}`/);
});

test('v2-skalet: bilageförhandsvisningen täcker samma säkra format som legacy', () => {
  const shellSource = fs.readFileSync(SHELL_PATH, 'utf8');
  assert.match(shellSource, /function attachmentPreviewKind\(attachment\)/);
  assert.match(shellSource, /application\\\/pdf/);
  assert.match(shellSource, /mammoth\.browser\.min\.js/);
  assert.match(shellSource, /xlsx\.full\.min\.js/);
  assert.match(shellSource, /jszip\.min\.js/);
  assert.match(shellSource, /renderAttachmentPdfPreview/);
  assert.match(shellSource, /renderAttachmentOfficePreview/);
  assert.match(shellSource, /ATTACHMENT_PREVIEW_MAX_BYTES/);
  assert.match(shellSource, /loadingTask\.destroy\(\)/);
  assert.match(shellSource, /<iframe src="' \+ esc\(blobUrl\) \+ '" sandbox=""/);
});

test('v2-skalet: PowerPoint-förhandsvisning behåller presentationsbilder lokalt', () => {
  const shellSource = fs.readFileSync(SHELL_PATH, 'utf8');
  assert.match(shellSource, /ppt\/slides\/_rels\/slide/);
  assert.match(shellSource, /getElementsByTagName\('a:blip'\)/);
  assert.match(shellSource, /media\.async\('base64'\)/);
  assert.match(shellSource, /Bild från presentationssida/);
});

test('v2-skalet: send-kontraktet ägs av admin#cco:s panel, inte av V2', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  // V2 har ingen egen send/transition/generate-väg längre — den enda
  // draft-skrivningen kvar är snabbsvarets utkast mot samma gateway.
  assert.match(appSource, /async studioSave\(payload\)/, 'snabbsvarets utkast-sparning behålls');
  assert.match(appSource, /signatureId: payload\?\.signatureId/);
  assert.doesNotMatch(appSource, /async studioSend\(/, 'send ska inte finnas i V2');
  assert.doesNotMatch(appSource, /async studioTransition\(/, 'transition ska inte finnas i V2');
  assert.doesNotMatch(appSource, /async studioGenerate\(/, 'generate ska inte finnas i V2');
  // Och de döda studio-ctx-fälten ska vara borta.
  assert.doesNotMatch(appSource, /studioOwnerSendAvailable:/);
  assert.doesNotMatch(appSource, /studioSignatures: getStudioSignatureProfiles/);
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

test('v2-skalet: trådbyte reconcile:ar markeringen utan att bygga om listans DOM', () => {
  const { document, api } = loadShell();
  // Två REDAN LÄSTA trådar: att bläddra mellan dem ändrar bara markeringen,
  // inte radernas innehåll (avsändare/ämne/preview/tid/taggar/SLA). Det är den
  // vanligaste operatörsinteraktionen — och den som måste kännas Outlook-snabb.
  const threads = [
    makeThread({ id: 't-1', customerName: 'Anna Karlsson', unread: false }),
    makeThread({ id: 't-2', customerName: 'Björn Lund', unread: false }),
  ];

  // Första render: tråd t-1 vald.
  api.render(makeCtx({ laneThreads: threads, allThreads: threads, selected: threads[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const rowA1 = inbox.querySelector('[data-thread-id="t-1"]');
  const rowB1 = inbox.querySelector('[data-thread-id="t-2"]');
  assert.ok(rowA1 && rowB1, 'båda tråd-raderna ska finnas');
  assert.match(rowA1.className, /\bactive\b/, 't-1 ska vara aktiv efter första render');
  assert.ok(!rowB1.classList.contains('active'), 't-2 ska inte vara aktiv än');

  // Klicka över till t-2 — bara markeringen ändras.
  api.render(makeCtx({ laneThreads: threads, allThreads: threads, selected: threads[1] }));

  const rowA2 = inbox.querySelector('[data-thread-id="t-1"]');
  const rowB2 = inbox.querySelector('[data-thread-id="t-2"]');

  // Kärnan: exakt samma rad-noder — listan byggdes INTE om, bara markeringen
  // flyttades (det som gör Outlook/Apple Mail direkt-snabba).
  assert.equal(rowA2, rowA1, 't-1-raden ska vara samma DOM-nod (ingen ombyggnad)');
  assert.equal(rowB2, rowB1, 't-2-raden ska vara samma DOM-nod (ingen ombyggnad)');

  // Markering flyttad korrekt.
  assert.ok(!rowA2.classList.contains('active'), 't-1 ska inte längre vara aktiv');
  assert.match(rowB2.className, /\bactive\b/, 't-2 ska vara aktiv efter bytet');
});

test('v2-skalet: keyed diff bygger bara om raden vars innehåll ändrats (admin-mönstret)', () => {
  const { document, api } = loadShell();
  const threads = [
    makeThread({ id: 't-1', customerName: 'Anna Karlsson' }),
    makeThread({ id: 't-2', customerName: 'Björn Lund' }),
  ];
  api.render(makeCtx({ laneThreads: threads, allThreads: threads, selected: threads[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const rowA1 = inbox.querySelector('[data-thread-id="t-1"]');
  const rowB1 = inbox.querySelector('[data-thread-id="t-2"]');

  // Bakgrunds-refresh: bara t-2 får nytt ämne. Som i admin#cco:s
  // renderQueueHistoryList ska t-1 behålla sin nod och bara t-2 byggas om —
  // ingen hellist-ombyggnad, inget flimmer på öppen tråd.
  const updated = [
    makeThread({ id: 't-1', customerName: 'Anna Karlsson' }),
    makeThread({ id: 't-2', customerName: 'Björn Lund', subject: 'HELT NYTT ÄMNE' }),
  ];
  api.render(makeCtx({ laneThreads: updated, allThreads: updated, selected: updated[0] }));
  const rowA2 = inbox.querySelector('[data-thread-id="t-1"]');
  const rowB2 = inbox.querySelector('[data-thread-id="t-2"]');

  assert.equal(rowA2, rowA1, 'oförändrad rad t-1 ska behålla samma DOM-nod');
  assert.notEqual(rowB2, rowB1, 'ändrad rad t-2 ska få en ny nod');
  assert.match(inbox.innerHTML, /HELT NYTT ÄMNE/, 'det nya ämnet ska renderas');
});

test('v2-skalet: keyed diff tar bort borttagna trådar, lägger till nya och håller ordningen', () => {
  const { document, api } = loadShell();
  const threads = [
    makeThread({ id: 't-1' }),
    makeThread({ id: 't-2' }),
    makeThread({ id: 't-3' }),
  ];
  api.render(makeCtx({ laneThreads: threads, allThreads: threads, selected: threads[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const t2Before = inbox.querySelector('[data-thread-id="t-2"]');

  // t-1 försvinner, t-4 tillkommer, t-2/t-3 kvar.
  const next = [makeThread({ id: 't-2' }), makeThread({ id: 't-3' }), makeThread({ id: 't-4' })];
  api.render(makeCtx({ laneThreads: next, allThreads: next, selected: next[0] }));

  assert.equal(inbox.querySelector('[data-thread-id="t-1"]'), null, 't-1 ska tas bort');
  assert.equal(inbox.querySelector('[data-thread-id="t-2"]'), t2Before, 't-2 ska behålla sin nod');
  assert.ok(inbox.querySelector('[data-thread-id="t-4"]'), 't-4 ska läggas till');
  const ids = Array.from(inbox.querySelectorAll('[data-thread-id]')).map((n) =>
    n.getAttribute('data-thread-id')
  );
  assert.deepEqual(ids, ['t-2', 't-3', 't-4'], 'ordningen ska matcha listan');
});

test('v2-skalet: virtualisering begränsar DOM-fönstret för stora listor (admin-mönstret)', () => {
  const { document, api } = loadShell();
  const big = [];
  for (let i = 0; i < 200; i += 1) {
    big.push(makeThread({ id: 't-' + i, customerName: 'Kund ' + i, unread: false }));
  }
  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));

  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const mount = inbox.querySelector('[data-v2-inbox-mount]');
  assert.ok(mount, 'virtuell mount-scaffold ska finnas');

  // Kärnan: 200 trådar men bara ett litet fönster ligger i DOM (som admin#cco:s
  // lit-switchover). Utan detta renderades hela listan och frös browsern vid
  // tre konton.
  const rowCount = mount.querySelectorAll('[data-thread-id]').length;
  assert.ok(rowCount > 0, 'något fönster ska renderas');
  assert.ok(
    rowCount <= 40,
    `DOM-fönstret ska vara begränsat (fick ${rowCount} rader av 200)`
  );
  assert.ok(rowCount < 200, 'hela listan får INTE ligga i DOM samtidigt');

  // Spacers bär de off-screen radernas höjd så scrollen speglar hela listan.
  const topH = inbox.querySelector('[data-v2-inbox-spacer-top]').style.height;
  const botH = inbox.querySelector('[data-v2-inbox-spacer-bottom]').style.height;
  assert.equal(topH, '0px', 'top-spacer 0 vid scrollTop 0');
  assert.notEqual(botH, '0px', 'bottom-spacer ska bära de off-screen raderna');
});

test('v2-skalet: liten lista virtualiseras inte (allt renderas under tröskeln)', () => {
  const { document, api } = loadShell();
  const threshold = api._inboxVirtualizeThreshold();
  const small = [];
  for (let i = 0; i < 5; i += 1) {
    small.push(makeThread({ id: 't-' + i, customerName: 'Kund ' + i }));
  }
  assert.ok(small.length < threshold, 'fixturen ska ligga under tröskeln');
  api.render(makeCtx({ laneThreads: small, allThreads: small, selected: small[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const rowCount = inbox.querySelectorAll('[data-thread-id]').length;
  assert.equal(rowCount, 5, 'under tröskeln ska hela listan renderas');
});

test('v2-skalet: virtualiseringens synliga fönster följer scrollTop', () => {
  const { api } = loadShell();
  const atTop = api._computeInboxVisibleRange(200, 0, 880, 68);
  assert.equal(atTop.start, 0, 'vid toppen börjar fönstret på 0');
  assert.ok(atTop.end >= 30 && atTop.end <= 200, 'fönstret har rimlig storlek');

  const scrolled = api._computeInboxVisibleRange(200, 3400, 880, 68);
  assert.ok(scrolled.start > atTop.start, 'fönstret flyttas nedåt vid scroll');
  assert.ok(scrolled.end > scrolled.start, 'fönstret behåller bredd efter scroll');

  const past = api._computeInboxVisibleRange(200, 999999, 880, 68);
  assert.equal(past.end, 200, 'slutet klampas till totalen');
});

test('v2-skalet: verklig scroll flyttar fönstret, håller höjd-invarianten och når sista tråden', () => {
  const { window, document, api } = loadShell();
  // Tvinga synkron re-window-väg (ingen frame-loop i linkedom) så scroll-eventet
  // faktiskt provas end-to-end, inte bara beräkningshjälparen.
  window.requestAnimationFrame = undefined;

  const N = 300;
  const big = Array.from({ length: N }, (_, i) =>
    makeThread({ id: 't-' + i, customerName: 'Kund ' + i, unread: false })
  );
  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));

  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const mount = inbox.querySelector('[data-v2-inbox-mount]');
  const rowH = api._currentInboxRowHeight();
  const topSpacer = inbox.querySelector('[data-v2-inbox-spacer-top]');
  const botSpacer = inbox.querySelector('[data-v2-inbox-spacer-bottom]');
  const px = (v) => parseInt(String(v || '0'), 10) || 0;
  const domRows = () => mount.querySelectorAll('[data-thread-id]').length;
  // Höjd-invariant: topp + fönster*rowH + botten === total*rowH ⇒ ingen drift.
  const invariant = () => px(topSpacer.style.height) + domRows() * rowH + px(botSpacer.style.height);

  // Vid toppen.
  assert.equal(invariant(), N * rowH, 'höjd-invariant vid toppen');
  assert.equal(
    mount.querySelector('[data-thread-id]').getAttribute('data-thread-id'),
    't-0',
    'första raden vid toppen är t-0'
  );

  // Scrolla till mitten via RIKTIG scrollTop + scroll-event.
  inbox.scrollTop = Math.floor(N / 2) * rowH;
  inbox.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.notEqual(
    mount.querySelector('[data-thread-id]').getAttribute('data-thread-id'),
    't-0',
    'fönstret flyttades bort från toppen'
  );
  assert.ok(px(topSpacer.style.height) > 0, 'top-spacer växer när man skrollat ned');
  assert.equal(invariant(), N * rowH, 'höjd-invariant i mitten (ingen drift/hopp)');

  // Scrolla till botten → sista tråden i DOM, bottom-spacer 0.
  inbox.scrollTop = N * rowH;
  inbox.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.ok(
    mount.querySelector('[data-thread-id="t-' + (N - 1) + '"]'),
    'sista tråden nås vid botten (ingen oåtkomlig svans)'
  );
  assert.equal(px(botSpacer.style.height), 0, 'bottom-spacer 0 vid botten');
  assert.equal(invariant(), N * rowH, 'höjd-invariant vid botten');
});

test('v2-skalet: radhöjden följer densiteten (fast höjd per läge)', () => {
  const { document, api } = loadShell();
  api.render(makeCtx());
  const root = document.getElementById('cco-conv-v2-root');
  root.dataset.density = 'comfortable';
  assert.equal(api._currentInboxRowHeight(), 95, 'comfortable = 92 + 3px margin');
  root.dataset.density = 'compact';
  assert.equal(api._currentInboxRowHeight(), 55, 'compact = 54 + 1px margin');
});

test('v2-skalet: .thread har garanterad fast höjd (virtualiseringens kontrakt)', () => {
  const css = fs.readFileSync(V2_CSS_PATH, 'utf8');
  assert.match(
    css,
    /#cco-conv-v2-root\s+\.thread\s*\{[^}]*height:\s*92px/,
    'comfortable-rad ska ha fast höjd 92px (matchar shell-konstanten)'
  );
  assert.match(
    css,
    /#cco-conv-v2-root\s+\.thread\s*\{[^}]*overflow:\s*hidden/,
    '.thread ska klippa spill så höjden är exakt'
  );
  assert.match(
    css,
    /\[data-density="compact"\]\s+\.thread\s*\{[^}]*height:\s*54px/,
    'compact-rad ska ha fast höjd 54px'
  );
  assert.match(
    css,
    /#cco-conv-v2-root\s+\.thread-tags\s*\{[^}]*flex-wrap:\s*nowrap/,
    'taggar ska hållas på en rad (deterministisk höjd)'
  );
});

test('v2-skalet: mobil sid-scroll driver virtualiseringen (fönster följer viewport, når botten)', () => {
  // Regression: på mobil är .inbox-shell max-height:none, så .inbox-list växer
  // och SIDAN scrollar — inte listan. Då måste fönstret räknas ur listans
  // position i viewporten och fönster-scroll lyssnas på, annars fastnar
  // fönstret på första sidan och senare trådar blir oåtkomliga.
  const { window, document, api } = loadShell();
  window.requestAnimationFrame = undefined;
  // Scrollmodellen väljs via layout-breakpointen: ställ matchMedia till mobil
  // (≤768px) så koden går page-scroll-vägen — INTE via scrollHeight (som den
  // virtuella spacern alltid blåser upp).
  window.matchMedia = (query) => ({ matches: String(query).indexOf('768') !== -1 });

  const N = 300;
  const big = Array.from({ length: N }, (_, i) =>
    makeThread({ id: 't-' + i, customerName: 'Kund ' + i, unread: false })
  );
  const rowH = api._currentInboxRowHeight();
  const totalH = N * rowH;

  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const mount = inbox.querySelector('[data-v2-inbox-mount]');
  const topSpacer = inbox.querySelector('[data-v2-inbox-spacer-top]');
  const botSpacer = inbox.querySelector('[data-v2-inbox-spacer-bottom]');
  const px = (v) => parseInt(String(v || '0'), 10) || 0;

  // Mobil: .inbox-list scrollar INTE internt (scrollTop 0, scrollHeight≈client).
  // Modellera listans position i viewporten via en stubbad rect; sid-scroll
  // driver listans top negativt.
  let listTop = 0;
  inbox.getBoundingClientRect = () => ({
    top: listTop,
    bottom: listTop + totalH,
    height: totalH,
    left: 0,
    right: 0,
    width: 0,
  });

  // Vid toppen: första raden t-0 (re-render med stubbad rect aktiv).
  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));
  assert.equal(
    mount.querySelector('[data-thread-id]').getAttribute('data-thread-id'),
    't-0',
    'vid sidtoppen är första raden t-0'
  );

  // Sid-scroll till mitten → listans top går negativ, FÖNSTER-scroll dispatchas.
  listTop = -Math.floor(N / 2) * rowH;
  window.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.notEqual(
    mount.querySelector('[data-thread-id]').getAttribute('data-thread-id'),
    't-0',
    'fönstret följer sidans scroll (inte bara inbox-listans)'
  );
  assert.ok(px(topSpacer.style.height) > 0, 'top-spacer växer vid sid-scroll');

  // Sid-scroll till botten → sista tråden nås.
  listTop = -totalH;
  window.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.ok(
    mount.querySelector('[data-thread-id="t-' + (N - 1) + '"]'),
    'sista tråden nås via sid-scroll (ingen oåtkomlig svans på mobil)'
  );
  assert.equal(px(botSpacer.style.height), 0, 'bottom-spacer 0 vid botten');
});

test('v2-skalet: scrollmodellen är oberoende av element-mått (framtidsskydd)', () => {
  // FRAMTIDSSKYDD för breakpoint-logiken — INTE ett reproduktionsfall från
  // dagens mobil-CSS. I nuvarande layout har .inbox-shell max-height:none på
  // mobil, så .inbox-list växer till hela innehållet och scrollHeight ===
  // clientHeight; en mått-baserad heuristik skulle råka välja rätt gren där.
  // Det här testet låser fast att modellen väljs på LAYOUT-BREAKPOINTEN och
  // aldrig på element-mått, så att en framtida CSS-ändring som gör listan
  // höjdbegränsad på mobil inte tyst återinför buggen.
  //
  // Det faktiska produktbeteendet (mobil sid-scroll respektive iPad intern
  // scroll, med riktiga spacers) bevisas av browser-testet:
  // tests/e2e/cco-v2-virtualization.spec.js.
  const { window, document, api } = loadShell();
  window.requestAnimationFrame = undefined;
  window.matchMedia = (query) => ({ matches: String(query).indexOf('768') !== -1 });

  const N = 300;
  const big = Array.from({ length: N }, (_, i) =>
    makeThread({ id: 't-' + i, customerName: 'Kund ' + i, unread: false })
  );
  const rowH = api._currentInboxRowHeight();
  const totalH = N * rowH;

  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const mount = inbox.querySelector('[data-v2-inbox-mount]');

  // Härma riktig browser: spacern ger stor scrollHeight, men listan scrollar
  // INTE internt (scrollTop stannar 0) eftersom sidan är scroll-containern.
  Object.defineProperty(inbox, 'scrollHeight', { value: totalH, configurable: true });
  Object.defineProperty(inbox, 'clientHeight', { value: 640, configurable: true });
  Object.defineProperty(inbox, 'scrollTop', { value: 0, writable: false, configurable: true });

  let listTop = 0;
  inbox.getBoundingClientRect = () => ({
    top: listTop,
    bottom: listTop + totalH,
    height: totalH,
    left: 0,
    right: 0,
    width: 0,
  });

  // Sid-scroll till botten trots scrollTop === 0 hela tiden.
  listTop = -totalH;
  window.dispatchEvent(new window.Event('scroll', { bubbles: true }));

  assert.equal(inbox.scrollTop, 0, 'listan scrollar aldrig internt på mobil');
  assert.ok(
    mount.querySelector('[data-thread-id="t-' + (N - 1) + '"]'),
    'sista tråden nås trots att spacern blåser upp scrollHeight'
  );
  assert.equal(
    inbox.querySelector('[data-v2-inbox-spacer-bottom]').style.height,
    '0px',
    'bottom-spacer 0 vid botten'
  );
});

test('v2-skalet: desktop/surfplatta använder .inbox-list:s interna scroll', () => {
  // >768px (inkl. 769–1024) håller .inbox-shell höjd-bounded → intern scroll.
  const { window, document, api } = loadShell();
  window.requestAnimationFrame = undefined;
  window.matchMedia = () => ({ matches: false }); // ej mobil

  const N = 300;
  const big = Array.from({ length: N }, (_, i) =>
    makeThread({ id: 't-' + i, customerName: 'Kund ' + i, unread: false })
  );
  api.render(makeCtx({ laneThreads: big, allThreads: big, selected: big[0] }));
  const inbox = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-inbox]');
  const mount = inbox.querySelector('[data-v2-inbox-mount]');
  const rowH = api._currentInboxRowHeight();

  // Om koden felaktigt läste viewport-rect här skulle fönstret inte flytta sig.
  inbox.scrollTop = N * rowH;
  inbox.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.ok(
    mount.querySelector('[data-thread-id="t-' + (N - 1) + '"]'),
    'intern scroll driver fönstret på desktop/surfplatta'
  );
});
