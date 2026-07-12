'use strict';

// ORD-63 · CM→CFO handoff: mappning + promote-integration (tmp-fil, inget nät).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCfoExpenseFields,
  promoteRecordToCfo,
  mapCategory,
} = require('../../src/cm/cmCfoHandoff');
const { VALID_CATEGORIES } = require('../../src/cfo/cfoExpenseStore');
const { createCfoExpenseStore } = require('../../src/cfo/cfoExpenseStore');

test('mapCategory: synonymer, exakta träffar och okänt', () => {
  assert.equal(mapCategory('Programvara', VALID_CATEGORIES), 'it_telefoni');
  assert.equal(mapCategory('resor och logi', VALID_CATEGORIES), 'resor');
  assert.equal(mapCategory('lokal', VALID_CATEGORIES), 'lokal');
  assert.equal(mapCategory('Marknadsföring', VALID_CATEGORIES), 'marknadsforing');
  assert.equal(mapCategory('kryptovaluta', VALID_CATEGORIES), null);
  assert.equal(mapCategory('', VALID_CATEGORIES), null);
});

test('buildCfoExpenseFields: belopp, notes-spårbarhet, bilagor', () => {
  const record = {
    id: 'cm-rec-1',
    expenseType: 'invoice',
    supplierName: 'Telia AB',
    invoiceNumber: 'F-2026-100',
    amountExVat: 800,
    vatAmount: 200,
    amountIncVat: 1000,
    date: '2026-07-01',
    category: 'telefoni',
    confidenceScore: 85,
  };
  const documents = [{ storagePath: 'cm/receipts/2026-07/abc-faktura.pdf' }];
  const fields = buildCfoExpenseFields({ record, documents, validCategories: VALID_CATEGORIES });
  assert.equal(fields.amountSek, 1000);
  assert.equal(fields.vatSek, 200);
  assert.equal(fields.supplier, 'Telia AB');
  assert.equal(fields.category, 'it_telefoni');
  assert.deepEqual(fields.attachmentKeys, ['cm/receipts/2026-07/abc-faktura.pdf']);
  assert.match(fields.notes, /cm-record cm-rec-1/);
  assert.match(fields.notes, /faktura F-2026-100/);
  assert.match(fields.notes, /confidence 85/);
});

test('buildCfoExpenseFields: fallback ex+moms när inkl saknas, okänd kategori → null', () => {
  const record = {
    id: 'cm-rec-2',
    expenseType: 'receipt',
    amountExVat: 80,
    vatAmount: 20,
    amountIncVat: 0,
    category: 'mystiskt',
  };
  const fields = buildCfoExpenseFields({ record, validCategories: VALID_CATEGORIES });
  assert.equal(fields.amountSek, 100);
  assert.equal(fields.category, null);
});

test('promoteRecordToCfo: skapar cfoExpense + idempotens', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cm-handoff-test-'));
  const cfoExpenseStore = await createCfoExpenseStore({
    filePath: path.join(dir, 'expenses.json'),
  });

  const record = {
    id: 'cm-rec-3',
    expenseType: 'receipt',
    supplierName: 'Apoteket AB',
    receiptNumber: 'K-55',
    amountExVat: 400,
    vatAmount: 100,
    amountIncVat: 500,
    date: '2026-07-10',
    category: 'behandlingsmaterial',
    confidenceScore: 92,
    cfoExpenseId: null,
  };

  const result = await promoteRecordToCfo({
    record,
    documents: [],
    cfoExpenseStore,
    actor: { userId: 'test', role: 'owner' },
    validCategories: VALID_CATEGORIES,
  });
  assert.equal(result.ok, true);
  assert.ok(result.cfoExpense.id.startsWith('exp_'));
  assert.equal(result.cfoExpense.amountSek, 500);
  assert.equal(result.cfoExpense.category, 'forbrukning');
  assert.equal(result.cfoExpense.status, 'categorized');
  assert.match(result.cfoExpense.notes, /cm-record cm-rec-3/);

  record.cfoExpenseId = result.cfoExpense.id;
  const again = await promoteRecordToCfo({ record, cfoExpenseStore, actor: { userId: 'test' } });
  assert.equal(again.ok, false);
  assert.equal(again.error, 'already_promoted');
});

test('promoteRecordToCfo utan store → tydligt fel', async () => {
  const result = await promoteRecordToCfo({ record: { id: 'x' }, cfoExpenseStore: null });
  assert.equal(result.ok, false);
  assert.match(result.error, /cfoExpenseStore saknas/);
});
