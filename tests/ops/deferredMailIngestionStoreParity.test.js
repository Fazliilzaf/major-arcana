const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const { createDeferredCcoMailIngestionStore } = require('../../src/ops/deferredMailIngestionStore');

/**
 * Paritet mellan den riktiga storen och den deferrade fasaden.
 *
 * Fasaden proxar metoder via en HANDSKRIVEN allowlist. Lagger man till en
 * metod pa storen utan att lagga till namnet dar, sa finns metoden helt enkelt
 * inte i prod — dar prod-safe gor att storen alltid ar deferrad.
 *
 * Det hande 2026-08-19: listQueuedMailboxCounts lades till for att kojobbet
 * skulle hitta ratt brevlada, men saknades i allowlisten. Anroparen hade en
 * defensiv typeof-kontroll, sa jobbet foll tillbaka pa en tom karta och
 * rapporterade queue_empty — varje minut, helt tyst, medan 8 814 meddelanden
 * lag kvar.
 *
 * Det har testet gor den klassen av fel omojlig att missa.
 */

async function skapaRiktigStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-paritet-'));
  const filePath = path.join(dir, 'cco-mail-ingestion.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({ processingQueue: [], mailRawMessages: {} }),
    'utf8'
  );
  return { store: await createCcoMailIngestionStore({ filePath }), filePath };
}

test('den deferrade fasaden exponerar varje publik metod pa storen', async () => {
  const { store, filePath } = await skapaRiktigStore();
  const deferred = createDeferredCcoMailIngestionStore({
    placeholderStore: { disabled: true, reason: 'deferred' },
    createStore: () => createCcoMailIngestionStore({ filePath }),
    logger: { log() {}, warn() {}, error() {} },
    label: 'paritetstest',
  });

  const publikaMetoder = Object.keys(store)
    .filter((key) => typeof store[key] === 'function')
    .filter((key) => !key.startsWith('_'));

  const saknade = publikaMetoder.filter((name) => typeof deferred[name] !== 'function');

  assert.deepEqual(
    saknade,
    [],
    `Metoder finns pa storen men saknas i deferredMailIngestionStore.js methodNames: ${saknade.join(', ')}. ` +
      'I prod ar storen alltid deferrad, sa de gar inte att anropa dar.'
  );
});

test('listQueuedMailboxCounts nar hela vagen genom fasaden', async () => {
  // Den konkreta metoden som fallerade. Egen test sa att felet inte bara
  // fangas av parlistan ovan utan ocksa av namn.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-paritet-'));
  const filePath = path.join(dir, 'cco-mail-ingestion.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      processingQueue: ['a', 'b'],
      mailRawMessages: {
        a: { id: 'a', mailboxId: 'egzona@hairtpclinic.com' },
        b: { id: 'b', mailboxId: 'egzona@hairtpclinic.com' },
      },
    }),
    'utf8'
  );

  const deferred = createDeferredCcoMailIngestionStore({
    placeholderStore: { disabled: true, reason: 'deferred' },
    createStore: () => createCcoMailIngestionStore({ filePath }),
    logger: { log() {}, warn() {}, error() {} },
    label: 'paritetstest',
  });

  assert.equal(typeof deferred.listQueuedMailboxCounts, 'function');
  await deferred._load();

  const counts = deferred.listQueuedMailboxCounts();
  assert.equal(counts.get('egzona@hairtpclinic.com'), 2);
});
