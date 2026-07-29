'use strict';

/**
 * ORD-89 steg 2 — vakt för inkopplingen.
 *
 * Fyra påståenden vaktas här, och tre av dem är strukturella: de går inte att
 * bevisa med ett utfall utan bara med källan. Det är rätt nivå — de handlar om
 * vad koden ALDRIG gör, inte om vad den gör.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'ops', 'ccoMailboxTruthStore.js'), 'utf8');
const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const bodyStore = require('../../src/ops/ccoMailboxTruthBodyStore');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function functionBody(name) {
  const start = SOURCE.indexOf(`async function ${name}(`);
  assert.ok(start > -1, `${name} ska finnas`);
  const end = SOURCE.indexOf('\n  }\n', start);
  return stripComments(SOURCE.slice(start, end));
}

test('de synkrona läsarna är fortfarande synkrona', () => {
  // Görs någon av dem async är worklist-vägen i spel igen —
  // ccoMailboxTruthWorklistReadModel.js:1184 anropar listMessages, och den
  // vägen ska enligt ordern inte röras. Additivt betyder additivt.
  for (const name of ['listMessages', 'listWorklistMessages', 'findMessage']) {
    assert.match(
      SOURCE,
      new RegExp(`\\n  function ${name}\\(`),
      `${name} måste förbli en synkron funktion`
    );
    assert.ok(
      !new RegExp(`async function ${name}\\(`).test(SOURCE),
      `${name} får inte bli async`
    );
  }
});

test('sidofiler raderas ALLTID efter save(), aldrig före', () => {
  // Felet ska falla åt det håll som kostar disk, aldrig åt det håll som kostar
  // text. Detta är den enda ordningen i hela steget som kan tappa brödtext.
  for (const name of ['resetFolder', 'recordDeltaPage']) {
    const body = functionBody(name);
    const savePos = body.lastIndexOf('await save()');
    const removePos = body.indexOf('await removeBodyFilesFor(');
    assert.ok(savePos > -1, `${name} ska spara`);
    assert.ok(removePos > -1, `${name} ska radera sidofiler`);
    assert.ok(
      removePos > savePos,
      `${name}: removeBodyFilesFor måste ligga EFTER save() — annars kan ett meddelande bli kvar utan brödtext`
    );
  }
});

test('uppstartshydreringen rör inga filer', () => {
  // Den är den kalla laddningen ORD-89 finns för att avlasta. Filsystems-I/O
  // där vore att stoppa tillbaka kostnaden vi just tog bort, en fil i taget.
  const start = SOURCE.indexOf('for (const [messageKey, rawMessage] of Object.entries(state.messages))');
  assert.ok(start > -1);
  const hydrationBlock = stripComments(SOURCE.slice(start, start + 900));
  assert.ok(
    !hydrationBlock.includes('removeBodyFilesFor'),
    'uppstartshydreringen får inte radera sidofiler'
  );
});

test('en migrerad shard ger tillbaka brödtexten genom den asynkrona läsaren', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ord89-wire-'));
  const shardDir = path.join(root, 'mailboxes');
  fs.mkdirSync(shardDir, { recursive: true });
  const shardPath = path.join(shardDir, 'a_b_se.json');
  fs.writeFileSync(
    shardPath,
    JSON.stringify({
      version: 1,
      messages: {
        'a@b.se:g1': {
          mailboxId: 'a@b.se',
          graphMessageId: 'g1',
          folderType: 'inbox',
          bodyText: '',
          bodyPreview: 'förhandsvisning',
        },
      },
    }),
    'utf8'
  );
  // Migrerat läge: sharden är tömd, sidofilen bär texten.
  const bodyRoot = path.join(root, 'bodies');
  await bodyStore.writeBody(
    bodyStore.bodyFilePath({ bodyRoot, mailboxId: 'a@b.se', messageKey: 'a@b.se:g1' }),
    { bodyText: 'Texten ligger i sidofilen' }
  );

  const store = await createCcoMailboxTruthStore({ filePath: shardPath, deferInitialSave: true });

  const sync = store.findMessage({ mailboxId: 'a@b.se', messageId: 'g1' });
  assert.equal(sync.bodyText, '', 'den synkrona vägen ska INTE läsa sidofilen');
  assert.equal(sync.bodyPreview, 'förhandsvisning', 'förhandsvisningen ligger kvar i sharden');

  const hydrated = await store.findMessageWithBody({ mailboxId: 'a@b.se', messageId: 'g1' });
  assert.equal(hydrated.bodyText, 'Texten ligger i sidofilen');
});

test('mailbox-segmentet härleds ur nyckeln, aldrig ur meddelandeobjektet', () => {
  // Sökvägen byggdes först av mailboxId OCH messageKey hämtade från olika
  // håll: migreringen skrev på shardens faktiska objektnyckel, läsaren räknade
  // fram en ny ur meddelandet. Divergerar de blir utfallet TOM BRÖDTEXT, TYST.
  const source = stripComments(SOURCE);
  const start = source.indexOf('function bodyLocationForKey(');
  assert.ok(start > -1, 'den gemensamma härledningen ska finnas');
  assert.match(
    source.slice(start, start + 300),
    /String\(messageKey\)\.split\(':'\)\[0\]/,
    'mailbox-segmentet ska komma ur nyckeln'
  );
  // Ingen annan plats får bygga en bodyFilePath med ett eget mailboxId.
  const handRolled = source.match(/bodyFilePath\(\{[^}]*mailboxId:\s*normalizeMailboxId\(safeMessage/g);
  assert.equal(handRolled, null, 'ingen får härleda mailbox ur meddelandeobjektet');
});

test('ingen id-fallback när graphMessageId saknas', () => {
  // Skrivvägen nycklar bara på graphMessageId och hoppar över meddelandet helt
  // när den saknas. En fallback kan därför bara producera en nyckel som inte
  // finns — den räddar ingenting och kan bara peka fel.
  const source = stripComments(SOURCE);
  assert.ok(
    !source.includes('safeMessage.graphMessageId || safeMessage.id'),
    'id-fallbacken får inte återinföras'
  );
});

test('en nyckel som inte finns i sharden ger en synlig signal, inte tomhet', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ord89-div-'));
  const shardDir = path.join(root, 'mailboxes');
  fs.mkdirSync(shardDir, { recursive: true });
  const shardPath = path.join(shardDir, 'a_b_se.json');
  fs.writeFileSync(shardPath, JSON.stringify({ version: 1, messages: {} }), 'utf8');
  const store = await createCcoMailboxTruthStore({ filePath: shardPath, deferInitialSave: true });

  const [row] = await store.hydrateMessageBodies([
    { mailboxId: 'a@b.se', graphMessageId: 'finns-inte', bodyPreview: 'x' },
  ]);
  assert.equal(
    row[bodyStore.BODY_READ_ERROR],
    'nyckel_saknas_i_shard',
    'divergerad härledning ska synas, inte bli en tom bubbla'
  );
});
