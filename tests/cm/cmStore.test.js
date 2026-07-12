'use strict';

// ORD-65 · cmStore: dedupe, flaggor, handed_off, syncState, rotation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCmStore } = require('../../src/cm/cmStore');

async function tmpStorePath(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-store-test-'));
  return path.join(dir, name);
}

test('importRawItem deduper på internetMessageId', async () => {
  const store = createCmStore({ filePath: await tmpStorePath('cm.json') });
  const first = store.importRawItem({
    sourceType: 'email',
    internetMessageId: '<msg-1@test>',
    subject: 'Faktura 123',
    fromEmail: 'faktura@leverantor.se',
    rawBodyText: 'Total 100 kr',
  });
  assert.equal(first.ok, true);
  const dup = store.importRawItem({
    sourceType: 'email',
    internetMessageId: '<msg-1@test>',
    subject: 'Faktura 123',
    fromEmail: 'faktura@leverantor.se',
    rawBodyText: 'Total 100 kr',
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, 'duplicate');
});

test('rawItem utan PDF flaggas NO_PDF_FOUND + BODY_TEXT_USED_AS_SOURCE', async () => {
  const store = createCmStore({ filePath: await tmpStorePath('cm.json') });
  const { rawItem } = store.importRawItem({
    sourceType: 'email',
    internetMessageId: '<m2@test>',
    subject: 'Kvitto',
    rawBodyText: 'Kvitto på 50 kr',
    hasPdf: false,
  });
  assert.ok(rawItem.flags.includes('NO_PDF_FOUND'));
  assert.ok(rawItem.flags.includes('BODY_TEXT_USED_AS_SOURCE'));
});

test('createExpenseRecord: låg confidence + saknade fält flaggas', async () => {
  const store = createCmStore({ filePath: await tmpStorePath('cm.json') });
  const record = store.createExpenseRecord({
    expenseType: 'invoice',
    supplierName: '',
    amountIncVat: 0,
    confidenceScore: 40,
  });
  assert.ok(record.flags.includes('NEEDS_MANUAL_REVIEW'));
  assert.ok(record.flags.includes('MISSING_TOTAL_AMOUNT'));
  assert.ok(record.flags.includes('MISSING_SUPPLIER'));
  assert.ok(record.flags.includes('MISSING_INVOICE_NUMBER'));
  assert.equal(record.cfoExpenseId, null);
});

test('markHandedOff sätter handed_off + cfoExpenseId + syns i dashboard', async () => {
  const store = createCmStore({ filePath: await tmpStorePath('cm.json') });
  const record = store.createExpenseRecord({
    expenseType: 'receipt',
    supplierName: 'Apoteket',
    amountIncVat: 100,
    confidenceScore: 90,
  });
  const updated = store.markHandedOff(record.id, { cfoExpenseId: 'exp_abc123', actor: 'test' });
  assert.equal(updated.bookkeepingStatus, 'handed_off');
  assert.equal(updated.cfoExpenseId, 'exp_abc123');
  assert.equal(store.getDashboard().handedOff, 1);
  assert.equal(store.getReadyForBookkeeping().length, 0);
  // Bugbot PR #831: promotade records ska inte ligga kvar som öppna kandidater
  assert.equal(store.getInbox().length, 0);
  assert.equal(store.getApprovalQueue().length, 0);
  assert.equal(store.getNeedsReview().filter((r) => r.id === record.id).length, 0);
});

test('syncState persisteras och överlever reload', async () => {
  const filePath = await tmpStorePath('cm.json');
  const store = createCmStore({ filePath });
  store.setSyncState('kons@test.se', 'inbox', { deltaLink: 'https://graph/delta?token=X' });
  await store.persist();

  const reloaded = createCmStore({ filePath });
  await reloaded.load();
  assert.equal(
    reloaded.getSyncState('kons@test.se', 'inbox').deltaLink,
    'https://graph/delta?token=X'
  );
  assert.equal(reloaded.getSyncState('kons@test.se', 'sent'), null);
});

test('ledger: add + complete', async () => {
  const store = createCmStore({ filePath: await tmpStorePath('cm.json') });
  const entry = store.addLedgerEntry({ rawItemId: 'raw-1' });
  assert.equal(entry.status, 'processing');
  assert.equal(entry.processorVersion, 2);
  const done = store.completeLedgerEntry(entry.id, { status: 'done', expenseRecordId: 'rec-1' });
  assert.equal(done.status, 'done');
  assert.equal(done.expenseRecordId, 'rec-1');
  assert.ok(done.completedAt);
});

test('rotation: rawItems över taket arkiveras till .jsonl (bounded boot)', async () => {
  process.env.CM_RAW_ITEMS_MAX = '100';
  try {
    const filePath = await tmpStorePath('cm.json');
    const store = createCmStore({ filePath });
    for (let i = 0; i < 105; i++) {
      store.importRawItem({
        sourceType: 'email',
        internetMessageId: `<rot-${i}@test>`,
        subject: `Faktura ${i}`,
        rawBodyText: `rad ${i}`,
      });
    }
    await store.persist();

    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(persisted.rawItems.length, 100);
    const dir = path.dirname(filePath);
    const archives = (await fs.readdir(dir)).filter(
      (f) => f.includes('.archive-') && f.endsWith('.jsonl')
    );
    assert.equal(archives.length, 1);
    const lines = (await fs.readFile(path.join(dir, archives[0]), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 5);
    assert.equal(JSON.parse(lines[0]).kind, 'rawItem');
  } finally {
    delete process.env.CM_RAW_ITEMS_MAX;
  }
});
