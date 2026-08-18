'use strict';

/* Tyst nollresultat vid oladdad shard.
 *
 * `listMessages` hoppade tidigare tyst över varje brevlåda som inte låg i
 * LRU-cachen (`if (!store) continue;`). En anropare som frågade efter fler
 * brevlådor än `maxLoadedShards` fick svaret "inga träffar" — omöjligt att
 * skilja från en brevlåda som verkligen saknar meddelanden.
 *
 * Enligt kodkommentarerna i ccoMailboxTruthShardedStore.js och
 * ccoConversationThreadStore.js har det gett fel svar minst fyra gånger:
 * korsbrevlåderapporten som "såg" två brevlådor, `listMessages({})` som tyst
 * betydde "de laddade", tomma konversationstrådar utan felmeddelande, och
 * diagnostiken med `historyMailboxIds: 8` men `loadedMailboxes: 2`.
 *
 * Testerna nedan låser fast två saker:
 *   1. Att ett ofullständigt svar numera LARMAR (console.warn) i stället för
 *      att vara tyst.
 *   2. Att varningen bara kommer en gång per brevlåda per process, så att en
 *      hot read-path inte flödar loggen.
 *
 * Det som INTE testas här är själva LRU-storleken — den är en medveten
 * konfigurationsavvägning (ARCANA_CCO_MAILBOX_TRUTH_MAX_LOADED_SHARDS) och
 * rörs inte av den här ändringen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createCcoMailboxTruthShardedStore } = require('../../src/ops/ccoMailboxTruthShardedStore');

async function withStore(maxLoadedShards, fn) {
  const baseDir = path.join(os.tmpdir(), `truth-shard-${Date.now()}-${crypto.randomUUID()}`);
  await fs.mkdir(path.join(baseDir, 'mailboxes'), { recursive: true });
  // legacyFilePath måste peka på en icke-existerande FIL. Tom sträng duger
  // inte: path.resolve('') ger cwd, som finns och är en katalog, och då
  // kraschar migreringssteget med EISDIR i stället för att hoppas över.
  const store = await createCcoMailboxTruthShardedStore({
    baseDir,
    legacyFilePath: path.join(baseDir, 'no-legacy-monolith.json'),
    maxLoadedShards,
  });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };
  try {
    await fn({ store, warnings });
  } finally {
    console.warn = originalWarn;
    await fs.rm(baseDir, { recursive: true, force: true });
  }
}

const MAILBOXES = ['kons@hairtpclinic.com', 'info@hairtpclinic.com', 'contact@hairtpclinic.com'];

async function seedMailboxes(store) {
  for (const mailboxId of MAILBOXES) {
    await store.ensureMailboxLoaded(mailboxId);
  }
}

test('listMessages varnar när en efterfrågad brevlåda inte är laddad', async () => {
  // Tak 1, tre brevlådor: minst två måste vara utvräkta vid läsningen.
  await withStore(1, async ({ store, warnings }) => {
    await seedMailboxes(store);

    store.listMessages({ mailboxIds: MAILBOXES });

    const relevant = warnings.filter((line) => line.includes('OLADDADE shards'));
    assert.ok(relevant.length >= 1, 'ett ofullständigt svar ska larma, inte vara tyst');
    const payload = relevant[0];
    assert.match(payload, /"skipped":\[/);
    assert.match(payload, /"maxLoadedShards":1/);
    assert.match(payload, /ensureMailboxLoaded/);
  });
});

test('varningen upprepas inte för samma brevlåda (ingen loggflod)', async () => {
  await withStore(1, async ({ store, warnings }) => {
    await seedMailboxes(store);

    for (let i = 0; i < 25; i += 1) {
      store.listMessages({ mailboxIds: MAILBOXES });
    }

    const relevant = warnings.filter((line) => line.includes('OLADDADE shards'));
    // Högst en varning per brevlåda, oavsett antal anrop.
    assert.ok(
      relevant.length <= MAILBOXES.length,
      `fick ${relevant.length} varningar för ${MAILBOXES.length} brevlådor över 25 anrop`
    );
  });
});

test('ingen varning när alla efterfrågade brevlådor ryms i cachen', async () => {
  // Tak lika med antalet brevlådor: inget behöver vräkas ut.
  await withStore(MAILBOXES.length, async ({ store, warnings }) => {
    await seedMailboxes(store);

    store.listMessages({ mailboxIds: MAILBOXES });

    const relevant = warnings.filter((line) => line.includes('OLADDADE shards'));
    assert.deepEqual(relevant, [], 'ett fullständigt svar ska inte larma');
  });
});
