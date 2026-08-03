'use strict';

/**
 * TVÅ BREVLÅDOR MED SAMMA LOKALDEL SLOGS IHOP — DEN ENA FÖRSVANN.
 *
 * `getMailboxIdentityTokens` (app.js) lägger till adressens lokaldel som
 * matchningstoken, så att poster som bara härletts ur en etikett ("Info") kan
 * hitta sin brevlåda. `findExistingMailboxKey` slog ihop två brevlådor så fort
 * de delade ETT enda token.
 *
 * Latent sedan länge: den kunde inte utlösas förrän det fanns två brevlådor med
 * samma lokaldel i olika domäner. När `info@fazli.se` (IMAP) kopplades in
 * bredvid `info@hairtpclinic.com` delade de token "info", kollapsade till en
 * post, och `info@hairtpclinic.com` — 42 inkorgsmeddelanden — gick inte längre
 * att välja i v2-brevlådeväljaren.
 *
 * Regeln som vaktas: har BÅDA sidor en full adress avgör adressen. Först när
 * en sida saknar domän får lokaldelen tala.
 *
 * Funktionerna lyfts ur app.js med balanserad klammer-extraktion, samma
 * mönster som `konversationerMacrosPR3.test.js` — ingen DOM, ingen eval av
 * hela bundeln.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');
const source = fs.readFileSync(APP_PATH, 'utf8');

// Som konversationerMacrosPR3.test.js, men parentes-medveten: flera av de här
// funktionerna har default-parametrar (`mailbox = {}`), och den klammern sitter
// i SIGNATUREN. Letar vi bara efter första `{` stänger den direkt och vi får ut
// en trasig funktion. Vi balanserar därför parameterlistan först.
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let parenDepth = 0;
  let cursor = src.indexOf('(', start);
  for (; cursor < src.length; cursor += 1) {
    if (src[cursor] === '(') parenDepth += 1;
    else if (src[cursor] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) break;
    }
  }
  let depth = 0;
  let i = src.indexOf('{', cursor);
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return src.slice(start, i);
}

const bundle = [
  'normalizeText',
  'normalizeKey',
  'asText',
  'normalizeMailboxId',
  'getMailboxIdentityTokens',
  'findExistingMailboxKey',
]
  .map((name) => extractFunction(source, name))
  .join('\n');

const { findExistingMailboxKey, getMailboxIdentityTokens } = new Function(
  bundle + '\nreturn { findExistingMailboxKey, getMailboxIdentityTokens };'
)();

function mergedMapOf(mailboxes) {
  return new Map(
    mailboxes.map((mailbox) => [
      mailbox.id,
      { ...mailbox, identityTokens: getMailboxIdentityTokens(mailbox) },
    ])
  );
}

test('samma lokaldel i olika domäner slås INTE ihop', () => {
  const merged = mergedMapOf([
    { id: 'info@hairtpclinic.com', email: 'info@hairtpclinic.com', label: 'Info' },
  ]);
  const key = findExistingMailboxKey(merged, {
    id: 'info@fazli.se',
    email: 'info@fazli.se',
    label: 'fazli.se',
  });
  assert.equal(key, '', 'info@fazli.se ska inte matcha info@hairtpclinic.com');
});

test('båda brevlådorna överlever mergen', () => {
  // Speglar getAvailableRuntimeMailboxes: seedad karta + inkommande poster.
  const merged = mergedMapOf([
    { id: 'info@hairtpclinic.com', email: 'info@hairtpclinic.com', label: 'Info' },
    { id: 'kons@hairtpclinic.com', email: 'kons@hairtpclinic.com', label: 'Kons' },
  ]);
  for (const incoming of [
    { id: 'info@fazli.se', email: 'info@fazli.se', label: 'fazli.se' },
    { id: 'kvitto@hairtpclinic.com', email: 'kvitto@hairtpclinic.com', label: 'Kvitto' },
  ]) {
    const key = findExistingMailboxKey(merged, incoming) || incoming.id;
    merged.set(key, { ...incoming, identityTokens: getMailboxIdentityTokens(incoming) });
  }

  assert.deepEqual(Array.from(merged.keys()).sort(), [
    'info@fazli.se',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'kvitto@hairtpclinic.com',
  ]);
});

test('samma adress matchar fortfarande — legacy-preset och runtime slås ihop', () => {
  const merged = mergedMapOf([
    { id: 'info@hairtpclinic.com', email: 'info@hairtpclinic.com', label: 'Info' },
  ]);
  const key = findExistingMailboxKey(merged, {
    id: 'info@hairtpclinic.com',
    email: 'info@hairtpclinic.com',
    label: 'Info',
  });
  assert.equal(key, 'info@hairtpclinic.com', 'identisk adress ska fortsatt matcha');
});

test('saknar ena sidan domän får lokaldelen avgöra — etikett-härledda poster', () => {
  // Den här grenen är hela skälet till att lokaldelen finns i tokenlistan.
  const merged = mergedMapOf([
    { id: 'info@hairtpclinic.com', email: 'info@hairtpclinic.com', label: 'Info' },
  ]);
  const key = findExistingMailboxKey(merged, { id: 'info', label: 'Info' });
  assert.equal(key, 'info@hairtpclinic.com', 'en post utan domän ska hitta sin brevlåda');
});

test('en post utan igenkännbara tokens matchar ingenting', () => {
  const merged = mergedMapOf([
    { id: 'info@hairtpclinic.com', email: 'info@hairtpclinic.com', label: 'Info' },
  ]);
  assert.equal(findExistingMailboxKey(merged, {}), '');
});
