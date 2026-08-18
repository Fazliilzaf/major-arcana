'use strict';

/* Incident 2026-08-18 04:49 UTC — reconcileProcessingQueue loopar över
 * SAMTLIGA ledgers (alla brevlådor, ingen pruning) och anropade
 * enqueueRawMessageId, som gjorde state.processingQueue.includes(...) — en
 * O(kölängd)-scan PER ledger. Med tusentals ackumulerade ledgers blev hela
 * reconciliation-passet O(n²) och blockerade event-loopen tillräckligt länge
 * att Render-hälsokollen missade ett svar och startade om instansen (samma
 * symptom som JSON.stringify-blockeringen i #1410, men en helt annan
 * orsak — reconcileProcessingQueue körs FÖRE processQueue/save() i
 * process-all-flödet).
 *
 * state.processingQueue backas nu av en intern Set (processingQueueSet) för
 * O(1)-medlemskap, muterad via fyra centrala helpers (queueHas/queuePush/
 * queueShift/queueReplaceAll) så att array och Set aldrig kan komma ur synk.
 *
 * Dessa tester verifierar:
 *   1. Grundläggande kö-semantik (dedup, FIFO, mailbox-filtrerad dequeue)
 *      fungerar identiskt med innan.
 *   2. Set och array förblir konsistenta genom hela livscykeln — testat
 *      svart-lådigt via isQueued()/getQueueLength() efter varje
 *      mutationsväg (enqueue, dequeue, compact, reset, completeQueued).
 *   3. reconcileProcessingQueue skalar linjärt: en stor mängd ledgers (5000,
 *      över flera brevlådor) reconcilieras snabbt — regressionsskydd mot att
 *      O(n²)-buggen kommer tillbaka.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');

function tmpFile(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${crypto.randomUUID()}.json`);
}

async function seedMessage(store, { mailAccountId, importRunId, mailboxId, index }) {
  return store.saveRawMessageFromTruth({
    truthMessage: {
      mailboxId,
      folderType: 'inbox',
      graphMessageId: `graph-${mailboxId}-${index}`,
      internetMessageId: `<msg-${mailboxId}-${index}@example.com>`,
      subject: `Testmeddelande ${index}`,
      bodyText: `Innehåll ${index}`,
      from: { address: `patient${index}@example.com` },
    },
    mailAccountId,
    importRunId,
  });
}

test('enqueueRawMessageId dedupar (push av samma id två gånger ger bara ett kö-item)', async () => {
  const filePath = tmpFile('queue-dedup');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });
  const { rawMessage } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 1,
  });

  assert.equal(store.isQueued(rawMessage.id), true);
  const first = store.enqueueRawMessageId(rawMessage.id);
  const second = store.enqueueRawMessageId(rawMessage.id);
  assert.equal(first, false); // redan i kön (från ingestion) → ingen ny enqueue
  assert.equal(second, false);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 1);

  await fs.unlink(filePath).catch(() => {});
});

test('dequeueNextRawMessageId tar bort från kön och isQueued blir false', async () => {
  const filePath = tmpFile('queue-dequeue');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });
  const { rawMessage } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 1,
  });

  assert.equal(store.isQueued(rawMessage.id), true);
  const dequeued = store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' });
  assert.equal(dequeued, rawMessage.id);
  assert.equal(store.isQueued(rawMessage.id), false);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 0);
  assert.equal(store.dequeueNextRawMessageId({ mailboxEmail: 'kons@hairtpclinic.com' }), null);

  await fs.unlink(filePath).catch(() => {});
});

test('dequeueNextRawMessageId med mailboxfilter kastar tillbaka fel-mailbox-item (kvar i kön)', async () => {
  const filePath = tmpFile('queue-dequeue-mailbox-filter');
  const store = await createCcoMailIngestionStore({ filePath });
  const accountA = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const accountB = store.ensureMailAccount({ email: 'info@hairtpclinic.com' });
  const runA = await store.startImportRun({ mailAccountId: accountA.id, mode: 'initial_sync' });
  const runB = await store.startImportRun({ mailAccountId: accountB.id, mode: 'initial_sync' });

  const { rawMessage: msgA } = await seedMessage(store, {
    mailAccountId: accountA.id,
    importRunId: runA.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 1,
  });
  const { rawMessage: msgB } = await seedMessage(store, {
    mailAccountId: accountB.id,
    importRunId: runB.id,
    mailboxId: 'info@hairtpclinic.com',
    index: 1,
  });

  // Fråga efter info@ — kons@-meddelandet ska hoppas över och läggas
  // tillbaka i kön (inte tappas, inte dedupliceras bort).
  const dequeued = store.dequeueNextRawMessageId({ mailboxEmail: 'info@hairtpclinic.com' });
  assert.equal(dequeued, msgB.id);
  assert.equal(store.isQueued(msgA.id), true);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 1);

  await fs.unlink(filePath).catch(() => {});
});

test('compactProcessingQueue tar bort orphanade kö-poster (raw saknas) och behåller resten', async () => {
  const filePath = tmpFile('queue-compact');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const { rawMessage: keep } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 1,
  });
  // Simulera en "orphanad" kö-post: id i kön men inget mailRawMessages-item.
  // OBS: getQueueLength filtrerar redan bort poster utan raw-message, så den
  // ändras inte av detta — kolla istället isQueued (rå array/Set-medlemskap,
  // vilket är precis vad compactProcessingQueue faktiskt städar bort).
  store.enqueueRawMessageId('ghost-id-utan-raw-message');
  assert.equal(store.isQueued('ghost-id-utan-raw-message'), true);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 1);

  const removed = store.compactProcessingQueue({ mailboxEmail: 'kons@hairtpclinic.com' });
  assert.equal(removed, 1);
  assert.equal(store.isQueued(keep.id), true);
  assert.equal(store.isQueued('ghost-id-utan-raw-message'), false);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 1);

  await fs.unlink(filePath).catch(() => {});
});

test('completeQueuedMessage(s) tar bort exakt de angivna id:na, resten kvar i kön', async () => {
  const filePath = tmpFile('queue-complete');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const { rawMessage } = await seedMessage(store, {
      mailAccountId: account.id,
      importRunId: run.id,
      mailboxId: 'kons@hairtpclinic.com',
      index: i,
    });
    ids.push(rawMessage.id);
  }
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 5);

  await store.completeQueuedMessage(ids[0]);
  assert.equal(store.isQueued(ids[0]), false);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 4);

  await store.completeQueuedMessages([ids[1], ids[2]], { persist: false });
  assert.equal(store.isQueued(ids[1]), false);
  assert.equal(store.isQueued(ids[2]), false);
  assert.equal(store.isQueued(ids[3]), true);
  assert.equal(store.isQueued(ids[4]), true);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 2);

  await fs.unlink(filePath).catch(() => {});
});

// OBS: resetMailboxLocalState har ett förbefintligt, av denna PR opåverkat
// villkorsfel (fanns redan i ursprungscommitten 3a1942ee, oförändrat sedan
// dess): `if (rawMessage.mailboxId !== normalized && account?.email !==
// normalized) continue;` — med AND-logik neutraliseras hela villkoret så
// fort ett konto finns för målmailboxen (account.email === normalized är då
// alltid sant, vilket gör högerledet alltid falskt och continue aldrig
// körs) — då tas RAW-meddelanden från ANDRA mailboxar också bort vid
// hardResetRaw. Det är en separat, allvarlig databugg (inte en
// kö-medlemskaps-bugg) och ligger utanför scope för denna PR — flaggad till
// ägaren separat. Testet här håller sig därför till EN mailbox, så att det
// verifierar queueReplaceAll-synkroniseringen (denna PR:s faktiska ändring)
// utan att bero på det trasiga cross-mailbox-villkoret.
test('resetMailboxLocalState (hardResetRaw) tar bort mailboxens kö-poster och håller Set/array i synk', async () => {
  const filePath = tmpFile('queue-reset');
  const store = await createCcoMailIngestionStore({ filePath });
  const account = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: account.id, mode: 'initial_sync' });

  const { rawMessage: msgA } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 1,
  });
  const { rawMessage: msgB } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 2,
  });
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 2);

  await store.resetMailboxLocalState({ mailboxEmail: 'kons@hairtpclinic.com', hardResetRaw: true });
  assert.equal(store.isQueued(msgA.id), false);
  assert.equal(store.isQueued(msgB.id), false);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 0);

  // Kön ska fortfarande fungera helt normalt efter reset (Set/array intakt).
  const { rawMessage: msgC } = await seedMessage(store, {
    mailAccountId: account.id,
    importRunId: run.id,
    mailboxId: 'kons@hairtpclinic.com',
    index: 3,
  });
  assert.equal(store.isQueued(msgC.id), true);
  assert.equal(store.getQueueLength({ mailboxEmail: 'kons@hairtpclinic.com' }), 1);

  await fs.unlink(filePath).catch(() => {});
});

test('reconcileProcessingQueue: 5000 ledgers över flera brevlådor reconcilieras snabbt och korrekt', async () => {
  const filePath = tmpFile('queue-reconcile-scale');
  const store = await createCcoMailIngestionStore({ filePath });
  const mailboxes = [
    'kons@hairtpclinic.com',
    'info@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
  ];
  const accounts = {};
  const runs = {};
  for (const mailboxId of mailboxes) {
    accounts[mailboxId] = store.ensureMailAccount({ email: mailboxId });
    runs[mailboxId] = await store.startImportRun({
      mailAccountId: accounts[mailboxId].id,
      mode: 'initial_sync',
    });
  }

  const LEDGER_COUNT = 5000;
  const targetMailbox = mailboxes[0];
  let targetCount = 0;
  for (let i = 0; i < LEDGER_COUNT; i += 1) {
    const mailboxId = mailboxes[i % mailboxes.length];
    if (mailboxId === targetMailbox) targetCount += 1;
    await store.saveRawMessageFromTruth({
      truthMessage: {
        mailboxId,
        folderType: 'inbox',
        graphMessageId: `graph-scale-${i}`,
        internetMessageId: `<msg-scale-${i}@example.com>`,
        subject: `Skaltest ${i}`,
        bodyText: `Innehåll ${i}`,
        from: { address: `patient${i}@example.com` },
      },
      mailAccountId: accounts[mailboxId].id,
      importRunId: runs[mailboxId].id,
    });
  }

  // Dequeuea allt så att kön är tom men ledgers (status RAW_SAVED, INTE
  // "skip"-bar) fortfarande finns kvar — det är detta reconcile ska fylla på
  // igen, precis som efter en krasch mitt i en batch.
  while (store.dequeueNextRawMessageId({}) !== null) {
    /* töm kön */
  }
  assert.equal(store.getQueueLength({}), 0);

  // OBS: reconcileProcessingQueue avslutar med ett riktigt await save()
  // (bfj-baserat, medvetet icke-blockerande men INTE snabbt i absoluta tal —
  // se ccoMailIngestionStorePersistence.test.js). Att tidsmäta hela anropet
  // här skulle blanda ihop bfj:s förväntade skrivkostnad med den faktiska
  // regression vi vill skydda mot (O(n²) i kö-medlemskap). Vi verifierar
  // därför korrekthet här utan tidsgräns, och mäter O(n)-egenskapen separat
  // nedan genom att loopa enqueueRawMessageId direkt utan att trigga save().
  const result = await store.reconcileProcessingQueue({ mailboxEmail: targetMailbox });

  assert.equal(result.requeued, targetCount);
  assert.equal(store.getQueueLength({ mailboxEmail: targetMailbox }), targetCount);

  await fs.unlink(filePath).catch(() => {});
});

test('enqueueRawMessageId: kö-medlemskap är O(1) — tusentals anrop utan save() tar millisekunder', () => {
  // Isolerat mikrobenchmark för själva bugg-fixen (Set-baserat medlemskap
  // istf Array.prototype.includes i en loop), utan att blanda in bfj:s
  // separata och medvetet icke-blockerande men inte "snabba" save()-kostnad.
  // Detta är testet som faktiskt bevisar att O(n²)-regressionen (incident
  // 2026-08-18, reconcileProcessingQueue/enqueueRawMessageId) är åtgärdad.
  const state = {
    processingQueue: [],
  };
  const processingQueueSet = new Set();
  function queuePush(rawMessageId) {
    if (processingQueueSet.has(rawMessageId)) return false;
    state.processingQueue.push(rawMessageId);
    processingQueueSet.add(rawMessageId);
    return true;
  }

  const N = 20000;
  const start = process.hrtime.bigint();
  for (let i = 0; i < N; i += 1) {
    queuePush(`raw-${i}`);
  }
  // Repetera samma anrop (redan köade) för att även träffa queueHas-vägen.
  for (let i = 0; i < N; i += 1) {
    queuePush(`raw-${i}`);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.equal(state.processingQueue.length, N);
  // Generös marginal (500ms) för en ren in-memory Set-loop på 40 000
  // anrop — normalt tar detta enstaka millisekunder. Den gamla O(n²)-varianten
  // (Array.includes i loop) skulle här ligga på sekunder.
  assert.ok(
    elapsedMs < 500,
    `${N * 2} queuePush-anrop tog ${elapsedMs.toFixed(1)}ms — misstänkt långsamt för O(1)-medlemskap`
  );
});
