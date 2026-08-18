'use strict';

/* Incident 2026-08-18 — den faktiska orsaken till dygnets frysningar.
 *
 * dequeueNextRawMessageId hade en oändlig loop: ett meddelande som tillhörde
 * en ANNAN brevlåda än filtret plockades av kön med queueShift() och lades
 * tillbaka med queuePush(), inne i samma loop som villkoras på
 * `state.processingQueue.length > 0`. Kön krympte därmed aldrig och samma id
 * shiftades av/pushades tillbaka i all evighet.
 *
 * Buggen infördes 2026-05-26 i 9223c7d3, som bytte en ofarlig `for...of` mot
 * shift/push-loopen. #1411 refaktorerade samma funktion (.push → queuePush)
 * och bevarade den.
 *
 * Utlöstes exakt när alla meddelanden för den filtrerade brevlådan var
 * färdigprocessade men kön fortfarande innehöll minst ett för en annan
 * brevlåda. Produktionssignaturen stämde precis: sista loggraden var alltid
 * "[mail-ingestion] klar raw=... (0ms)" och "batch klar" kom aldrig —
 * processQueue lämnade aldrig dequeue-anropet. Ren synkron CPU utan
 * allokering, loggning eller timers gav total tystnad; hälsokollen föll och
 * Render tvångsstartade om. Kön låg kvar oförändrad eftersom save() aldrig
 * nåddes, så exakt samma frysning upprepades vid varje försök.
 *
 * OBS om dessa tester failar: vid en regression HÄNGER de i stället för att
 * faila snabbt, och slås ut av test-runnerns timeout (--test-timeout=60000).
 * En timeout här ska läsas som "den oändliga loopen är tillbaka".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');

function tmpFile(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${crypto.randomUUID()}.json`);
}

async function seed(store, { mailboxId, accountId, importRunId, index }) {
  const { rawMessage } = await store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId,
      folderType: 'inbox',
      graphMessageId: `g-${mailboxId}-${index}`,
      internetMessageId: `<m-${mailboxId}-${index}@example.com>`,
      subject: `Ämne ${index}`,
      bodyText: 'innehåll',
      from: { address: `patient${index}@example.com` },
    },
    mailAccountId: accountId,
    importRunId,
  });
  return rawMessage;
}

async function withStore(fn) {
  const filePath = tmpFile('dequeue-loop');
  const store = await createCcoMailIngestionStore({ filePath });
  const kons = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const info = store.ensureMailAccount({ email: 'info@hairtpclinic.com' });
  const konsRun = await store.startImportRun({ mailAccountId: kons.id, mode: 'initial_sync' });
  const infoRun = await store.startImportRun({ mailAccountId: info.id, mode: 'initial_sync' });
  try {
    await fn({ store, kons, info, konsRun, infoRun });
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

test('dequeueNextRawMessageId terminerar när kön bara innehåller andra brevlådor', async () => {
  await withStore(async ({ store, info, infoRun }) => {
    await seed(store, {
      mailboxId: 'info@hairtpclinic.com',
      accountId: info.id,
      importRunId: infoRun.id,
      index: 1,
    });

    const started = Date.now();
    const result = store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' });
    const elapsedMs = Date.now() - started;

    assert.equal(result, null);
    assert.ok(elapsedMs < 1000, `dequeue tog ${elapsedMs}ms — oändliga loopen är tillbaka`);
  });
});

test('främmande meddelanden ligger kvar i kön efter ett dequeue-försök', async () => {
  await withStore(async ({ store, info, infoRun }) => {
    const foreign = await seed(store, {
      mailboxId: 'info@hairtpclinic.com',
      accountId: info.id,
      importRunId: infoRun.id,
      index: 1,
    });

    assert.equal(store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' }), null);

    // Får inte tappas bort: info@ måste fortfarande kunna processa det.
    assert.equal(store.isQueued(foreign.id), true);
    assert.equal(
      store.dequeueNextRawMessageId({ mailboxEmail: 'info@hairtpclinic.com' }),
      foreign.id
    );
  });
});

test('rätt brevlådas meddelande returneras även när främmande ligger först i kön', async () => {
  await withStore(async ({ store, kons, info, konsRun, infoRun }) => {
    // Två främmande först, sedan det vi vill åt.
    await seed(store, {
      mailboxId: 'info@hairtpclinic.com',
      accountId: info.id,
      importRunId: infoRun.id,
      index: 1,
    });
    await seed(store, {
      mailboxId: 'info@hairtpclinic.com',
      accountId: info.id,
      importRunId: infoRun.id,
      index: 2,
    });
    const wanted = await seed(store, {
      mailboxId: 'kons@hairtpclinic.com',
      accountId: kons.id,
      importRunId: konsRun.id,
      index: 3,
    });

    const started = Date.now();
    const result = store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' });
    const elapsedMs = Date.now() - started;

    assert.equal(result, wanted.id);
    assert.ok(elapsedMs < 1000, `dequeue tog ${elapsedMs}ms`);
    // De två främmande ska vara kvar, det returnerade borta.
    assert.equal(store.isQueued(wanted.id), false);
    assert.equal(store.getQueueLength({ mailboxEmail: 'info@hairtpclinic.com' }), 2);
  });
});

test('produktionsscenariot: kons@-kön töms, info@ ligger kvar — drain ska avslutas', async () => {
  await withStore(async ({ store, kons, info, konsRun, infoRun }) => {
    const konsIds = [];
    for (let i = 1; i <= 3; i += 1) {
      const raw = await seed(store, {
        mailboxId: 'kons@hairtpclinic.com',
        accountId: kons.id,
        importRunId: konsRun.id,
        index: i,
      });
      konsIds.push(raw.id);
    }
    await seed(store, {
      mailboxId: 'info@hairtpclinic.com',
      accountId: info.id,
      importRunId: infoRun.id,
      index: 99,
    });

    // Töm kons@-kön precis som processQueue gör.
    const drained = [];
    let next = store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' });
    let guard = 0;
    while (next && guard < 50) {
      drained.push(next);
      next = store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' });
      guard += 1;
    }

    // Det avgörande: det sista anropet returnerar null i stället för att hänga.
    assert.equal(next, null);
    assert.deepEqual(drained.sort(), konsIds.sort());
  });
});
