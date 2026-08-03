'use strict';

/**
 * IMAP-BREVLÅDAN SAKNADES HELT I BREVLÅDEVÄLJAREN.
 *
 * `mailboxCapabilities` byggdes uteslutande ur Graph-konfigurationen, så
 * `info@fazli.se` — som betjänas av CCO:s IMAP-väg — fanns inte i listan alls.
 *
 * Att bara lägga id:t i unionen hade inte räckt, och det är kärnan i det här
 * testet: Graph-grindarna (`graphReadEnabled`, läs-allowlistan) beskriver
 * Graph-lådan och säger ingenting om ett IMAP-konto. Hade de fått svara hade
 * brevlådan landat på `readAvailable: false` — eller, om avsändarlistan råkat
 * matcha, ärvt ett `sendAvailable` den inte ska ha. Därför har IMAP en egen
 * gren i `resolveMailboxAccess`.
 *
 * Vaktas här:
 *   1. Brevlådan finns i listan, med etiketten från ccoImapMailboxSync.
 *   2. readAvailable === true ÄVEN när läs-allowlistan bara innehåller
 *      Graph-adresser — grenen är alltså verkligt egen.
 *   3. sendAvailable / deleteAvailable / senderAvailable är false, även när
 *      Graph-sändning är påslagen och avsändarlistan är jokern '*'.
 *   4. Graph-brevlådornas flaggor är oförändrade.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalCcoMailboxSettingsDocument,
} = require('../../src/ops/ccoMailboxSettingsDocument');

const IMAP_MAILBOX_ID = 'info@fazli.se';
const GRAPH_MAILBOX_ID = 'kons@hairtpclinic.com';

// Speglar produktionen: Graph-läsning på, läs-allowlistan enbart
// @hairtpclinic.com, och avsändarlistan satt till jokern '*'.
function buildDocument(overrides = {}) {
  return buildCanonicalCcoMailboxSettingsDocument({
    readAllowlistMailboxIds: [GRAPH_MAILBOX_ID, 'info@hairtpclinic.com'],
    sendAllowlistMailboxIds: ['*'],
    deleteAllowlistMailboxIds: ['*'],
    graphReadEnabled: true,
    graphSendEnabled: true,
    graphDeleteEnabled: true,
    imapMailboxes: [{ id: IMAP_MAILBOX_ID, label: 'fazli.se' }],
    ...overrides,
  });
}

function findMailbox(document, mailboxId) {
  return document.mailboxCapabilities.find((capability) => capability.id === mailboxId) || null;
}

test('IMAP-brevlådan finns i mailboxCapabilities med sin egen etikett', () => {
  const imap = findMailbox(buildDocument(), IMAP_MAILBOX_ID);
  assert.ok(imap, 'info@fazli.se ska finnas i listan');
  assert.equal(imap.label, 'fazli.se', 'etiketten ska komma från ccoImapMailboxSync');
  assert.equal(imap.provider, 'imap');
});

test('readAvailable blir true trots att lasallowlistan bara har Graph-adresser', () => {
  const imap = findMailbox(buildDocument(), IMAP_MAILBOX_ID);
  assert.equal(imap.readAvailable, true);

  // Bevisar att grenen är egen och inte råkar rida på Graph-grinden: med
  // graphReadEnabled: false blir varje Graph-brevlåda oläsbar, men
  // IMAP-kontot är opåverkat.
  const graphOff = buildDocument({ graphReadEnabled: false });
  assert.equal(findMailbox(graphOff, IMAP_MAILBOX_ID).readAvailable, true);
  assert.equal(findMailbox(graphOff, GRAPH_MAILBOX_ID).readAvailable, false);
});

test('IMAP-brevlådan ärver ALDRIG sändning eller radering', () => {
  // Jokern '*' i avsändar- och raderingslistorna är det farliga fallet: den
  // finns i produktion och skulle kunna göra vad som helst sändbart.
  const imap = findMailbox(buildDocument(), IMAP_MAILBOX_ID);
  assert.equal(imap.sendAvailable, false, 'sändning går bara via Graph');
  assert.equal(imap.deleteAvailable, false, 'radering går bara via Graph');
  assert.equal(imap.senderAvailable, false, 'ska inte kunna väljas som avsändare');
});

test('Graph-brevlådornas flaggor är oförändrade', () => {
  const graph = findMailbox(buildDocument(), GRAPH_MAILBOX_ID);
  assert.equal(graph.readAvailable, true, 'står i läs-allowlistan');
  assert.equal(graph.provider, 'graph');
  // Jokern matchar sitt eget token, inte de riktiga adresserna — samma
  // beteende som före ändringen.
  assert.equal(graph.senderAvailable, false);
});

test('utan konfigurerad IMAP-brevlåda ändras ingenting', () => {
  const document = buildDocument({ imapMailboxes: [] });
  assert.equal(findMailbox(document, IMAP_MAILBOX_ID), null);
  assert.equal(findMailbox(document, GRAPH_MAILBOX_ID).readAvailable, true);
});
