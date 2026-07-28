'use strict';

/**
 * Samtidiga kalla shard-laddningar parsar filen EN gång, inte N gånger.
 *
 * `loadShard()` läste tidigare `shardCache` och skapade sedan en ny store utan
 * något mellan de två stegen. N samtidiga anrop för samma mailbox såg alla
 * `has() === false` och parsade hela shard-filen till minne parallellt.
 *
 * Det är samma stampede som ORD-85 (#1233) löste i `readCache.wrap`. Den här
 * vägen går inte via readCache och fick därför aldrig det skyddet: tre kalla
 * worklist-laddningar 2026-07-27 19:09 UTC tog RSS från 2 291 MB till 3 465 MB
 * på 62 sekunder och Render startade om instansen — utan deploy.
 *
 * TESTET MÄTER IDENTITET, inte tid. Två parsningar ger två skilda
 * store-objekt; en delad promise ger samma objekt till båda anroparna. Identitet
 * är alltså ett direkt bevis på att bara en parsning skedde, och till skillnad
 * från en tidsmätning kan det inte bli flakigt på en långsam CI-maskin.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthShardedStore } = require('../../src/ops/ccoMailboxTruthShardedStore');

const MAILBOX = 'fazli@hairtpclinic.com';

async function createShardedStoreWithMailbox() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-shard-stampede-'));
  const baseDir = path.join(tempDir, 'cco-mailbox-truth');
  const store = await createCcoMailboxTruthShardedStore({
    baseDir,
    legacyFilePath: path.join(tempDir, 'saknas-cco-mailbox-truth.json'),
    lazyPreload: false,
  });
  await store.recordFolderPage({
    runId: 'run-1',
    account: { mailboxId: MAILBOX, mailboxAddress: MAILBOX },
    folder: { folderType: 'inbox', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      { mailboxId: MAILBOX, graphMessageId: 'msg-1', folderType: 'inbox', subject: 'Hej' },
    ],
    nextPageUrl: null,
    complete: true,
  });
  return { store, tempDir };
}

test('samtidiga ensureMailboxLoaded för samma kalla mailbox delar en laddning', async () => {
  const { store, tempDir } = await createShardedStoreWithMailbox();
  try {
    // Vräk ut sharden ur LRU:n så att nästa anrop är genuint kallt. Taket är 2,
    // så två andra mailboxar räcker.
    await store.ensureMailboxLoaded('kons@hairtpclinic.com');
    await store.ensureMailboxLoaded('halso@hairtpclinic.com');
    assert.equal(
      store.listLoadedMailboxes().includes(MAILBOX),
      false,
      'förutsättningen: sharden ska vara utvräkt, annars mäter testet ingenting'
    );

    const [first, second, third] = await Promise.all([
      store.ensureMailboxLoaded(MAILBOX),
      store.ensureMailboxLoaded(MAILBOX),
      store.ensureMailboxLoaded(MAILBOX),
    ]);

    assert.ok(first, 'laddningen ska ge en store');
    assert.equal(second, first, 'andra samtidiga anropet parsade filen en gång till');
    assert.equal(third, first, 'tredje samtidiga anropet parsade filen en gång till');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('in-flight-posten släpps när laddningen är klar — den blir inte en andra cache', async () => {
  const { store, tempDir } = await createShardedStoreWithMailbox();
  try {
    const first = await store.ensureMailboxLoaded(MAILBOX);
    await store.ensureMailboxLoaded('kons@hairtpclinic.com');
    await store.ensureMailboxLoaded('halso@hairtpclinic.com');
    assert.equal(store.listLoadedMailboxes().includes(MAILBOX), false, 'utvräkt ur LRU:n');

    const second = await store.ensureMailboxLoaded(MAILBOX);
    assert.ok(second, 'mailboxen ska gå att öppna igen efter eviction');
    assert.notEqual(
      second,
      first,
      'en kvarlämnad in-flight-post skulle ha serverat den utvräkta storen och gjort LRU-taket verkningslöst'
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('VAKT: loadShard delar en promise i stället för att parsa per anrop', () => {
  const SOURCE = require('node:fs').readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoMailboxTruthShardedStore.js'),
    'utf8'
  );
  assert.match(SOURCE, /const shardLoadFlights = new Map\(\);/, 'in-flight-kartan ska finnas');
  assert.match(
    SOURCE,
    /shardLoadFlights\.get\(safeMailboxId\)/,
    'loadShard ska returnera en pågående laddning i stället för att starta en ny'
  );
  assert.match(
    SOURCE,
    /\.finally\(\(\) => \{[\s\S]{0,200}shardLoadFlights\.delete\(safeMailboxId\);/,
    'städningen måste ske i finally — ett kast får inte låsa mailboxen'
  );
});
