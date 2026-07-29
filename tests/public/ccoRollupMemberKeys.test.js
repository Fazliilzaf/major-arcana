'use strict';

/**
 * Sammanslagna rader måste skicka sina medlemsnycklar, annars öppnas de tomma.
 *
 * Servern lägger medlemsnycklarna BARA under `rollup`
 * (`ccoMailboxTruthWorklistReadModel.js:877`). Klientens
 * `collectV2DirectThreadMemberKeys` letade på sju vägar och `rollup` var inte
 * en av dem — klientens enda användning av `rollup` var kosmetisk
 * (`app.js:21482`, etiketterna "Rollup N" och "N mejlkonton").
 *
 * Följden: `memberKeys` blev tom, och
 *
 *     if (memberKeys.length) params.set("memberKeys", memberKeys.join(","));
 *
 * utelämnade då parametern helt. Konversationsrutten fick bara aggregatnyckeln
 * och svarade med noll meddelanden. En rollup-rad ÄR korsbrevlådefunktionen —
 * en kund som skrivit till flera brevlådor — så det var precis de trådarna som
 * öppnades tomma.
 *
 * Båda halvorna var korrekta var för sig. Sömmen emellan saknades, och inget
 * test såg det. Samma form som Snitt LTV.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const COMPOSITION = fs.readFileSync(
  path.join(ROOT, 'public', 'major-arcana-preview', 'runtime-dom-live-composition.js'),
  'utf8'
);

/** Kör den RIKTIGA collectV2DirectThreadMemberKeys ur källan. */
function collectMemberKeys(thread, conversationId) {
  const start = COMPOSITION.indexOf('    function collectV2DirectThreadMemberKeys(');
  assert.ok(start > -1, 'funktionen ska finnas i kompositionsmodulen');
  const end = COMPOSITION.indexOf('\n    }\n', start) + '\n    }\n'.length;
  const source = COMPOSITION.slice(start, end);

  const sandbox = {
    asArray: (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    asText: (value) => String(value == null ? '' : value).trim(),
    __resultat: null,
  };
  vm.runInNewContext(
    `${source}\n__resultat = collectV2DirectThreadMemberKeys(__thread, __conversationId);`,
    Object.assign(sandbox, { __thread: thread, __conversationId: conversationId })
  );
  // Arrayen kommer från vm-kontexten och har en annan Array.prototype —
  // deepStrictEqual jämför prototyp och skulle annars falla på identiskt innehåll.
  return Array.from(sandbox.__resultat || []);
}

test('en rollup-rad bidrar med sina medlemsnycklar', () => {
  const keys = collectMemberKeys(
    {
      raw: {
        conversationId: 'agg-key',
        rollup: {
          enabled: true,
          mailboxCount: 3,
          underlyingConversationKeys: ['contact@:AAA', 'egzona@:BBB', 'fazli@:CCC'],
        },
      },
    },
    'agg-key'
  );
  assert.deepEqual(
    keys.sort(),
    ['contact@:AAA', 'egzona@:BBB', 'fazli@:CCC'],
    'utan detta uteblir memberKeys-parametern och tråden öppnas tom'
  );
});

test('nycklar på trådobjektets egen rollup räknas också', () => {
  const keys = collectMemberKeys(
    { rollup: { underlyingConversationKeys: ['kons@:DDD'] }, raw: {} },
    'agg-key'
  );
  assert.deepEqual(keys, ['kons@:DDD']);
});

test('aggregatnyckeln själv räknas inte som medlem', () => {
  const keys = collectMemberKeys(
    { raw: { conversationId: 'agg-key', rollup: { underlyingConversationKeys: ['agg-key'] } } },
    'agg-key'
  );
  assert.deepEqual(keys, [], 'annars skickar vi tillbaka samma nyckel som medlem av sig själv');
});

test('en vanlig rad utan rollup beter sig som förut', () => {
  assert.deepEqual(
    collectMemberKeys({ raw: { conversationId: 'kons@:EEE' } }, 'annan-id'),
    ['kons@:EEE'],
    'oförändrat: conversationId var redan en kandidat'
  );
  assert.deepEqual(collectMemberKeys({}, 'annan-id'), [], 'tom tråd ger tom lista, inget kast');
});

test('VAKT: rollup-vägen får inte försvinna ur kandidatlistan igen', () => {
  assert.match(
    COMPOSITION,
    /raw\?\.rollup\?\.underlyingConversationKeys/,
    'serverns enda placering av nycklarna måste läsas'
  );
});

// Ingen vakt på app.bundle.js här: den är gitignorerad och byggs av
// bin/ensure-bundle.js vid prestart, så filen finns inte i CI. Att läsa den
// skulle testa den lokala byggkatalogen, inte repot. Källvakten ovan är den
// som faktiskt skyddar fixen.
