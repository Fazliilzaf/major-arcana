'use strict';

/* Låser kopplingen mellan versionsstämplarna och omköning.
 *
 * FILTER_VERSION, MATCH_VERSION och PROCESSOR_VERSION i constants.js skrivs
 * på varje ledger-post och läses tillbaka av shouldSkipProcessing(). Stämmer
 * inte ALLA tre räknas posten som ofärdig, och reconcileProcessingQueue()
 * köar den igen — oavsett status.
 *
 * Det gör en bump till en operation som slår igenom vid nästa batch, utan att
 * någon aktivt begär omkörning: ensureQueueIntegrity() anropar reconcile både
 * i runProcessBatch() och i /process-all innan drainen.
 *
 * Bakgrund: stämpeln har inte följt med regeländringarna. nonPatientRules.js
 * utökades 2026-07-02 (A2, #510) och 2026-08-17 (d8c422bf) utan bump, så
 * poster processade dessförinnan ser fortfarande aktuella ut. Mätning mot
 * prod 2026-08-19: 90 av 477 misslyckade matchningar skulle fångas av dagens
 * regler.
 *
 * Testerna finns för att varningskommentaren i constants.js ska kunna bli
 * osann utan att någon märker det. Failar de, har kopplingen ändrats och
 * kommentaren behöver skrivas om.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const {
  FILTER_VERSION,
  MATCH_VERSION,
  PROCESSOR_VERSION,
} = require('../../src/ops/ccoMailIngestion/constants');

function tmpFile(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${crypto.randomUUID()}.json`);
}

async function withStore(fn) {
  const filePath = tmpFile('filter-version-requeue');
  const store = await createCcoMailIngestionStore({ filePath });
  const konto = store.ensureMailAccount({ email: 'kons@hairtpclinic.com' });
  const run = await store.startImportRun({ mailAccountId: konto.id, mode: 'initial_sync' });
  try {
    await fn({ store, konto, run });
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

function fardigPost(overrides = {}) {
  return {
    status: 'MATCHED',
    processorVersion: PROCESSOR_VERSION,
    filterVersion: FILTER_VERSION,
    matchVersion: MATCH_VERSION,
    ...overrides,
  };
}

test('en färdigprocessad post med aktuella stämplar hoppas över', async () => {
  await withStore(async ({ store }) => {
    assert.equal(store.shouldSkipProcessing(fardigPost()), true);
  });
});

test('en föråldrad filterVersion gör posten ofärdig igen', async () => {
  await withStore(async ({ store }) => {
    assert.equal(
      store.shouldSkipProcessing(fardigPost({ filterVersion: 'cco-mail-filter-2020-01-01' })),
      false,
      'en bump av FILTER_VERSION måste göra befintliga poster ofärdiga — det är hela poängen med stämpeln'
    );
  });
});

test('matchVersion och processorVersion har samma effekt', async () => {
  await withStore(async ({ store }) => {
    assert.equal(store.shouldSkipProcessing(fardigPost({ matchVersion: 'gammal' })), false);
    assert.equal(store.shouldSkipProcessing(fardigPost({ processorVersion: '0.0.1' })), false);
  });
});

test('RAW_SAVED hoppas aldrig över, oavsett stämplar', async () => {
  await withStore(async ({ store }) => {
    // Darfor lagger en bump bara till de FARDIGPROCESSADE posterna i kon:
    // backloggen ligger redan dar.
    assert.equal(store.shouldSkipProcessing(fardigPost({ status: 'RAW_SAVED' })), false);
  });
});

test('reconcileProcessingQueue köar om poster vars stämpel inte längre stämmer', async () => {
  await withStore(async ({ store, konto, run }) => {
    const { rawMessage } = await store.saveRawMessageFromTruth({
      truthMessage: {
        mailboxId: 'kons@hairtpclinic.com',
        folderType: 'inbox',
        graphMessageId: 'g-1',
        internetMessageId: '<m-1@example.com>',
        subject: 'Ämne',
        bodyText: 'innehåll',
        from: { address: 'patient@example.com' },
      },
      mailAccountId: konto.id,
      importRunId: run.id,
    });

    const ledger = store.getLedgerByRawMessageId(rawMessage.id);

    // Markera som färdig med AKTUELLA stämplar → ska inte köas om.
    await store.updateLedger(ledger.id, {
      status: 'MATCHED',
      processorVersion: PROCESSOR_VERSION,
      filterVersion: FILTER_VERSION,
      matchVersion: MATCH_VERSION,
      completedAt: new Date().toISOString(),
    });
    store.completeQueuedMessages([rawMessage.id]);

    const forst = await store.reconcileProcessingQueue({});
    assert.equal(forst.requeued, 0, 'aktuell stämpel ska inte ge omköning');

    // Simulera en bump genom att förålda postens stämpel.
    await store.updateLedger(ledger.id, { filterVersion: 'cco-mail-filter-2020-01-01' });

    const sedan = await store.reconcileProcessingQueue({});
    assert.equal(sedan.requeued, 1, 'föråldrad stämpel ska köa om posten');
  });
});
