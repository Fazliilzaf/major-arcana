'use strict';

/**
 * BREVLÅDEVÄLJAREN VISADE EN NAMNLÖS RAD.
 *
 * `mailboxCapabilities` (`ccoMailboxSettingsDocument.js:454`) byggs som en
 * union av läs-, radera- OCH avsändarlistorna. Avsändarlistan i produktion är
 * `["*"]` — jokern som betyder "får skicka från vilken adress som helst". Den
 * hamnade därför i listan som om den vore en brevlåda, med id `*` och label
 * `*`, och renderades i v2-skalets LÄSväljare som en rad utan namn.
 *
 * Två saker vaktas här:
 *   1. Skalet listar bara brevlådor med readAvailable === true.
 *   2. `app.js` släpper faktiskt igenom fältet till ctx. Utan det andra ledet
 *      är fältet undefined för varje post och filtret i led 1 tömmer hela
 *      väljaren — ett värre fel än det vi rättade.
 *
 * Rigg och laddning är samma som `ccoConversationsV2Shell.smoke.test.js`.
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
    new Function('window', 'globalThis', source)(window, window);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
  return { window, document, api: window.ArcanaConversationsV2 };
}

function makeCtx(mailboxes) {
  return {
    lanes: [{ id: 'all', label: 'Alla', icon: '', count: 0, group: '' }],
    activeLane: 'all',
    laneThreads: [],
    allThreads: [],
    selected: null,
    mailboxes,
    selectedMailboxIds: [],
    handlers: { selectThread() {}, setLane() {}, action() {}, openDossier() {} },
  };
}

// Skalet renderar samma lista i både [data-v2-mailboxes] och
// [data-v2-mailboxes-compact]. Vi läser den ena för att slippa dubbletter.
function mailboxRows(document) {
  const panel = document.getElementById('cco-conv-v2-root').querySelector('[data-v2-mailboxes]');
  return Array.from(panel.querySelectorAll('.v2-mailbox-option')).map((node) => {
    const input = node.querySelector('input[type=checkbox]');
    return input ? input.getAttribute('data-v2-mailbox') : '';
  });
}

// Samma form som produktionens /api/v1/cco/runtime/status levererar: jokern
// först (order 0), därefter de riktiga brevlådorna.
const PRODUCTION_SHAPED_MAILBOXES = [
  { id: '*', label: '*', email: '*', readAvailable: false },
  {
    id: 'kons@hairtpclinic.com',
    label: 'Kons',
    email: 'kons@hairtpclinic.com',
    readAvailable: true,
  },
  {
    id: 'info@hairtpclinic.com',
    label: 'Info',
    email: 'info@hairtpclinic.com',
    readAvailable: true,
  },
];

test('avsändar-jokern * listas inte i läsväljaren', () => {
  const { document, api } = loadShell();
  api.render(makeCtx(PRODUCTION_SHAPED_MAILBOXES));

  const rows = mailboxRows(document);
  assert.ok(!rows.includes('*'), 'jokern * ska inte renderas som brevlåda');
  assert.deepEqual(rows, ['kons@hairtpclinic.com', 'info@hairtpclinic.com']);
});

test('räknaren "valda konton" räknar mot de läsbara, inte mot jokern', () => {
  const { document, api } = loadShell();
  const ctx = makeCtx(PRODUCTION_SHAPED_MAILBOXES);
  ctx.selectedMailboxIds = ['kons@hairtpclinic.com'];
  api.render(ctx);

  const heading = document
    .getElementById('cco-conv-v2-root')
    .querySelector('.v2-mailbox-menu-heading strong');
  assert.equal(heading.textContent, '1/2', 'nämnaren ska vara antalet läsbara brevlådor');
});

test('en brevlåda utan readAvailable listas inte — inga tysta undantag', () => {
  const { document, api } = loadShell();
  api.render(
    makeCtx([
      { id: 'kons@hairtpclinic.com', label: 'Kons', email: 'kons@hairtpclinic.com' },
      {
        id: 'info@hairtpclinic.com',
        label: 'Info',
        email: 'info@hairtpclinic.com',
        readAvailable: true,
      },
    ])
  );
  assert.deepEqual(mailboxRows(document), ['info@hairtpclinic.com']);
});

test('app.js släpper igenom readAvailable till v2-ctx', () => {
  // Utan det här ledet är fältet undefined för varje post och filtret ovan
  // tömmer hela väljaren. Vakten läser källan som text eftersom
  // renderConversationsV2Shell() inte går att anropa utanför app-runtimen.
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const ctxBlock = source.slice(
    source.indexOf('mailboxes: getAvailableRuntimeMailboxes()'),
    source.indexOf('selectedMailboxIds: getRequestedRuntimeMailboxIds')
  );
  assert.ok(ctxBlock, 'v2-ctx:ets mailbox-block ska gå att hitta i app.js');
  assert.match(
    ctxBlock,
    /readAvailable:\s*mailbox\?\.readAvailable === true/,
    'readAvailable måste skickas vidare till v2-skalet'
  );
});
