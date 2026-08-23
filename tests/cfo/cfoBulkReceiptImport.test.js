'use strict';

// ORD-102i · Bulkimport av externa kvitton för kortavstämning.
const test = require('node:test');
const assert = require('node:assert/strict');

const { bulkImportReceipts } = require('../../src/cfo/cfoBulkReceiptImport');

function makeReceiptStore() {
  return {
    uploadReceipt: async ({ buffer, metadata }) => ({
      id: 'rcpt_' + Math.random().toString(36).slice(2, 10),
      bufferLength: buffer?.length,
      metadata,
    }),
  };
}

function makeExpenseStore() {
  return {
    createExpense: async ({ fields }) => ({
      id: 'exp_' + Math.random().toString(36).slice(2, 10),
      ...fields,
    }),
  };
}

function makeReconciliation(unmatched = []) {
  return {
    listTransactions: ({ status }) => (status === 'unmatched' ? unmatched : []),
    confirmMatch: async () => ({}),
  };
}

test('bulkImportReceipts: skapar expense och matchar transaktion vid säker extraktion', async () => {
  const mockExtract = require('../../src/cm/cmAiExtractor');
  const original = mockExtract.extractDocument;
  mockExtract.extractDocument = async () => ({
    ok: true,
    extraction: {
      documentType: 'invoice',
      supplier: 'Meta Platforms',
      date: '2026-08-11',
      amountIncVat: 7096,
      vatAmount: 0,
      category: 'marknadsföring',
      confidenceScore: 95,
    },
  });

  try {
    const file = { buffer: Buffer.from('pdf-bytes'), originalname: 'meta.pdf' };
    const result = await bulkImportReceipts({
      files: [file],
      actor: { userId: 'owner', role: 'OWNER' },
      receiptStore: makeReceiptStore(),
      expenseStore: makeExpenseStore(),
      reconciliation: makeReconciliation([
        { id: 'tx-1', description: 'FACEBK *FOO', amountSek: 7096, date: '2026-08-11' },
      ]),
    });

    assert.equal(result.imported, 1);
    assert.equal(result.expensesCreated, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.errors, 0);
    assert.ok(result.results[0].expenseId);
    assert.equal(result.results[0].matchedTransactionId, 'tx-1');
  } finally {
    mockExtract.extractDocument = original;
  }
});

test('bulkImportReceipts: laddar upp receipt men skapar inte expense vid osäker/tolkningsbar extraktion', async () => {
  const mockExtract = require('../../src/cm/cmAiExtractor');
  const original = mockExtract.extractDocument;
  mockExtract.extractDocument = async () => ({
    ok: true,
    extraction: {
      documentType: 'unknown',
      supplier: '',
      date: '',
      amountIncVat: null,
      confidenceScore: 0,
    },
  });

  try {
    const file = { buffer: Buffer.from('pdf-bytes'), originalname: 'unreadable.pdf' };
    const result = await bulkImportReceipts({
      files: [file],
      actor: { userId: 'owner', role: 'OWNER' },
      receiptStore: makeReceiptStore(),
      expenseStore: makeExpenseStore(),
      reconciliation: makeReconciliation(),
    });

    assert.equal(result.imported, 1);
    assert.equal(result.expensesCreated, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.errors, 1);
    assert.ok(result.results[0].receiptId);
    assert.ok(result.results[0].error);
  } finally {
    mockExtract.extractDocument = original;
  }
});
