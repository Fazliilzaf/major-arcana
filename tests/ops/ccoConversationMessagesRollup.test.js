'use strict';

/* Trådöppning i Konversationer: rollup-rader (kund med flera Graph-
 * konversationer) bär en identitets-/primärnyckel som inte matchar någon
 * lagrad mailboxConversationId — exakt strängmatch gav "0 meddelanden" eller
 * halva tråden. Låser att fetchSortedConversationMessages:
 *  - matchar råa nyckeln (oförändrat beteende för enkla trådar),
 *  - matchar kanoniskt normaliserad nyckel (case/mailbox-scopning),
 *  - unionerar över memberKeys (rollup-medlemmarna) sorterat i tidsordning,
 *  - ger [] för identitetsnyckel utan medlemmar (ingen gissning). */

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchSortedConversationMessages } = require('../../src/routes/ccoConversation');

const MESSAGES = [
  {
    graphMessageId: 'g-1',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-form',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-form',
    folderType: 'inbox',
    receivedAt: '2026-03-04T09:00:00.000Z',
    subject: 'Kontaktformulär',
    from: { address: 'kund@example.com' },
  },
  {
    graphMessageId: 'g-2',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-svar',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-svar',
    folderType: 'sent',
    sentAt: '2026-03-04T12:31:00.000Z',
    subject: 'Re: Kontaktformulär',
    from: { address: 'kons@hairtpclinic.com' },
  },
  {
    graphMessageId: 'g-3',
    mailboxId: 'kons@hairtpclinic.com',
    conversationId: 'conv-svar',
    mailboxConversationId: 'kons@hairtpclinic.com:conv-svar',
    folderType: 'sent',
    sentAt: '2026-03-06T17:50:00.000Z',
    subject: 'Re: Kontaktformulär',
    from: { address: 'kons@hairtpclinic.com' },
  },
];

const store = { listMessages: () => MESSAGES };

test('enkel tråd: exakt nyckel ger samma resultat som förut', () => {
  const sorted = fetchSortedConversationMessages(store, 'kons@hairtpclinic.com:conv-svar');
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].graphMessageId, 'g-2');
  assert.equal(sorted[1].graphMessageId, 'g-3');
});

test('rollup: primärnyckel + memberKeys unionerar HELA kundtråden i tidsordning', () => {
  // Radens nyckel är svarstrådens — kontaktformulärstråden är rollup-medlem.
  const sorted = fetchSortedConversationMessages(store, 'kons@hairtpclinic.com:conv-svar', [
    'kons@hairtpclinic.com:conv-form',
  ]);
  assert.equal(sorted.length, 3, 'både inkommande formulärsmail och båda svaren');
  assert.deepEqual(
    sorted.map((m) => m.graphMessageId),
    ['g-1', 'g-2', 'g-3'],
    'sorterat i tidsordning över konversationsgränserna'
  );
});

test('identitetsnyckel utan medlemmar ger tom lista — men MED medlemmar hittas tråden', () => {
  // Rollup-rader med mergedCount > 1 kan bära en identitetsnyckel som aldrig
  // finns bland lagrade mailboxConversationId ("0 meddelanden"-buggen).
  const withoutMembers = fetchSortedConversationMessages(store, 'email:kund@example.com');
  assert.equal(withoutMembers.length, 0);
  const withMembers = fetchSortedConversationMessages(store, 'email:kund@example.com', [
    'kons@hairtpclinic.com:conv-form',
    'kons@hairtpclinic.com:conv-svar',
  ]);
  assert.equal(withMembers.length, 3, 'medlemsnycklarna räddar hela tråden');
});


test('tom/ogiltig nyckel ger tom lista', () => {
  assert.deepEqual(fetchSortedConversationMessages(store, ''), []);
  assert.deepEqual(fetchSortedConversationMessages(null, 'x'), []);
});
