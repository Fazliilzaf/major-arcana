const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');

/**
 * listQueuedMailboxCounts — kölängd per brevlåda.
 *
 * Bakgrund: schemaläggarens köjobb frågade buildDashboardSummary() för ENBART
 * default-brevlådan. Den funktionen är brevlådescopad, så när backloggen låg i
 * en annan låda svarade den 0 och jobbet returnerade queue_empty — varje minut,
 * medan kön stod på 8 814. Uppmätt på prod 2026-08-19:
 * egzona@hairtpclinic.com 8 785, info@fazli.se 29, default kons@ 0.
 *
 * Den här accessorn svarar på frågan "vilken låda har något att göra?" utan att
 * klona staten.
 */

async function skapaStore(seed) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-koraknare-'));
  const filePath = path.join(dir, 'cco-mail-ingestion.json');
  await fs.writeFile(filePath, JSON.stringify(seed), 'utf8');
  return createCcoMailIngestionStore({ filePath });
}

function raw(id, mailboxId) {
  return { id, mailboxId, fromEmail: 'nagon@example.com', folderType: 'inbox' };
}

test('raknar kolagda meddelanden per brevlada', async () => {
  const store = await skapaStore({
    processingQueue: ['a', 'b', 'c', 'd'],
    mailRawMessages: {
      a: raw('a', 'egzona@hairtpclinic.com'),
      b: raw('b', 'egzona@hairtpclinic.com'),
      c: raw('c', 'info@fazli.se'),
      d: raw('d', 'egzona@hairtpclinic.com'),
      // Finns i storen men INTE i kön — ska inte räknas.
      e: raw('e', 'kons@hairtpclinic.com'),
    },
  });

  const counts = store.listQueuedMailboxCounts();
  assert.equal(counts.get('egzona@hairtpclinic.com'), 3);
  assert.equal(counts.get('info@fazli.se'), 1);
  assert.equal(
    counts.get('kons@hairtpclinic.com'),
    undefined,
    'ett meddelande utanför kön får inte räknas'
  );
});

test('tom ko ger tom karta', async () => {
  const store = await skapaStore({ processingQueue: [], mailRawMessages: {} });
  assert.equal(store.listQueuedMailboxCounts().size, 0);
});

test('ko-id utan motsvarande ravmeddelande hoppas over utan att krascha', async () => {
  const store = await skapaStore({
    processingQueue: ['finns', 'saknas'],
    mailRawMessages: { finns: raw('finns', 'egzona@hairtpclinic.com') },
  });

  const counts = store.listQueuedMailboxCounts();
  assert.equal(counts.size, 1);
  assert.equal(counts.get('egzona@hairtpclinic.com'), 1);
});

test('normaliserar brevladan sa versaler inte splittrar rakningen', async () => {
  const store = await skapaStore({
    processingQueue: ['a', 'b'],
    mailRawMessages: {
      a: raw('a', 'Egzona@HairTPClinic.com'),
      b: raw('b', 'egzona@hairtpclinic.com'),
    },
  });

  const counts = store.listQueuedMailboxCounts();
  assert.equal(counts.size, 1, 'samma låda i olika skiftläge ska bli en post');
  assert.equal(counts.get('egzona@hairtpclinic.com'), 2);
});

test('klonar inte staten — accessorn ska vara billig nog for en minutlig job', async () => {
  // Regressionsskydd: getState() djup-klonar hela ingestion-staten och har
  // tidigare spikat heapen. Den här vägen får inte gå via den.
  const meddelanden = {};
  const ko = [];
  for (let i = 0; i < 5000; i += 1) {
    const id = `m${i}`;
    ko.push(id);
    meddelanden[id] = { ...raw(id, 'egzona@hairtpclinic.com'), rawJson: { body: 'x'.repeat(200) } };
  }
  const store = await skapaStore({ processingQueue: ko, mailRawMessages: meddelanden });

  const fore = process.memoryUsage().heapUsed;
  const counts = store.listQueuedMailboxCounts();
  const efter = process.memoryUsage().heapUsed;

  assert.equal(counts.get('egzona@hairtpclinic.com'), 5000);
  // En klon av 5 000 meddelanden med kroppar vore flera megabyte. Kartan är
  // en post. Taket är generöst — det som testas är storleksordningen.
  const vaxtMb = (efter - fore) / (1024 * 1024);
  assert.ok(vaxtMb < 5, `heapen vaxte ${vaxtMb.toFixed(1)} MB — ser ut som en klon`);
});

test('countLedgerStatuses raknar per status utan att klona', async () => {
  const store = await skapaStore({
    processingQueue: [],
    mailRawMessages: {},
    mailProcessingLedger: {
      l1: { rawMessageId: 'a', status: 'MATCHED' },
      l2: { rawMessageId: 'b', status: 'MATCHED' },
      l3: { rawMessageId: 'c', status: 'DUPLICATE_SKIPPED' },
      l4: { rawMessageId: 'd', status: 'RAW_SAVED' },
      l5: { rawMessageId: 'e' },
    },
  });

  const counts = store.countLedgerStatuses();
  assert.equal(counts.MATCHED, 2);
  assert.equal(counts.DUPLICATE_SKIPPED, 1);
  assert.equal(counts.RAW_SAVED, 1);
  assert.equal(counts.UNKNOWN, 1, 'post utan status ska hamna i UNKNOWN, inte tappas');
});
