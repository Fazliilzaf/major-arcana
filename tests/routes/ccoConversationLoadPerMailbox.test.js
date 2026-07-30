'use strict';

/**
 * TRE BREVLÅDOR MOT ETT TAK PÅ TVÅ.
 *
 * Första versionen laddade alla brevlådor i en loop och läste dem sedan i ett
 * svep. Med maxLoadedShards = 2 vräks den FÖRSTA ut så snart den TREDJE laddas
 * — innan läsningen ens börjar.
 *
 * Alexander-fallet hade två brevlådor, precis under taket, och missade det
 * helt. Rollup-trådar och kontaktformulär spänner över fler, och det var där
 * det historiska OOM:et satt. Testet nedan simulerar taket och kräver att alla
 * tre brevlådornas meddelanden kommer med.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'ccoConversation.js'),
  'utf8'
);

/** En store med LRU-tak 2: bara de två senast laddade svarar på listMessages. */
function createCappedStore(messagesByMailbox, cap = 2) {
  const loaded = [];
  const loadOrder = [];
  return {
    loadOrder,
    async ensureMailboxLoaded(mailboxId) {
      loadOrder.push(mailboxId);
      const existing = loaded.indexOf(mailboxId);
      if (existing >= 0) loaded.splice(existing, 1);
      loaded.push(mailboxId);
      while (loaded.length > cap) loaded.shift();
    },
    listMessages({ mailboxIds } = {}) {
      const wanted = Array.isArray(mailboxIds) && mailboxIds.length ? mailboxIds : loaded;
      const out = [];
      for (const mailboxId of wanted) {
        // En OLADDAD shard svarar tomt, tyst — precis som i produktion.
        if (!loaded.includes(mailboxId)) continue;
        out.push(...(messagesByMailbox[mailboxId] || []));
      }
      return out;
    },
  };
}

test('tre brevlådor: den första vräks inte ut innan den lästs', async () => {
  const MAILBOXES = ['a@x.se', 'b@x.se', 'c@x.se'];
  const CONV = 'CONV-1';
  const messagesByMailbox = Object.fromEntries(
    MAILBOXES.map((mailboxId) => [
      mailboxId,
      [
        {
          mailboxId,
          conversationId: CONV,
          graphMessageId: `g-${mailboxId}`,
          receivedAt: '2026-07-20T10:00:00.000Z',
        },
      ],
    ])
  );
  const store = createCappedStore(messagesByMailbox, 2);

  const fn = loadFetcher();
  const rows = await fn(store, CONV, [], { mailboxHints: MAILBOXES });

  const seenMailboxes = rows.map((r) => r.mailboxId).sort();
  assert.equal(
    JSON.stringify(seenMailboxes),
    JSON.stringify([...MAILBOXES].sort()),
    `alla tre brevlådor måste komma med — fick ${JSON.stringify(seenMailboxes)}`
  );
  // Beviset på att det är per-brevlåda och inte ett svep: varje brevlåda
  // laddades, och läsningen skedde medan den fortfarande låg i cachen.
  assert.equal(JSON.stringify(store.loadOrder), JSON.stringify([...MAILBOXES]));
});

test('utan brevlåde-id faller den tillbaka på oförändrat beteende', async () => {
  const store = createCappedStore({ 'a@x.se': [] }, 2);
  const fn = loadFetcher();
  const rows = await fn(store, 'nyckel-utan-mailbox', [], {});
  assert.equal(rows.length, 0);
  assert.equal(store.loadOrder.length, 0, 'ingen gissad laddning när id saknas');
});

test('härledningen återanvänds — ingen andra, svagare variant', () => {
  // Två implementationer av samma härledning är ett brutet kontrakt även när
  // båda råkar ge samma svar. Den egna varianten validerade svagare
  // (includes('@')) än den befintliga regexen.
  const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const start = code.indexOf('async function fetchConversationMessagesLoadingEachMailbox(');
  assert.ok(start > -1);
  const fn = code.slice(start, code.indexOf('\n}\n', start));
  assert.match(fn, /deriveMailboxIdsFromLookupKeys\(/);
  assert.ok(!fn.includes("includes('@')"), 'ingen egen, svagare validering');
});

/**
 * Kör den RIKTIGA wrappern ur källan tillsammans med den RIKTIGA
 * `deriveMailboxIdsFromLookupKeys`. Den inre läsningen stubbas — det är
 * wrapperns ansvar som prövas: ladda och läsa per brevlåda, deduplicera och
 * sortera. Att extrahera hela beroendegrafen hade testat något annat.
 */
function loadFetcher() {
  const sandbox = {
    module: {},
    exports: {},
    console,
    normalizeEmail: (v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''),
    normalizeText: (v) => (typeof v === 'string' ? v.trim() : ''),
    asObject: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
    asArray: (v) => (Array.isArray(v) ? v : v == null ? [] : [v]),
    deriveTime: (m) => String((m && (m.receivedAt || m.sentAt)) || ''),
    // Stubb: läser exakt de brevlådor anroparen scopat till.
    fetchSortedConversationMessages: (store, key, memberKeys, options) =>
      store.listMessages({ mailboxIds: (options && options.mailboxIdsOverride) || [] }),
  };
  const marker = 'function deriveMailboxIdsFromLookupKeys(';
  const start = SOURCE.indexOf(marker);
  const end = SOURCE.indexOf('\n}\n', start) + 3;
  let src = SOURCE.slice(start, end);
  const wrapStart = SOURCE.indexOf('async function fetchConversationMessagesLoadingEachMailbox(');
  const wrapEnd = SOURCE.indexOf('\n}\n', wrapStart) + 3;
  src += SOURCE.slice(wrapStart, wrapEnd);
  src += 'module.exports = fetchConversationMessagesLoadingEachMailbox;';
  vm.runInNewContext(src, sandbox);
  return sandbox.module.exports;
}
