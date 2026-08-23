'use strict';

// ORD-102d · Auto-hämta underlag för omatchade korttransaktioner.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findInvoiceForTransaction,
  autoFetchInvoices,
  findCfoExpense,
  findCmRecord,
  findMailboxMessage,
} = require('../../src/cfo/cfoInvoiceFetch');

function makeTx({
  id = 'tx-1',
  description = 'FACEBK *FOO',
  amountSek = 7096,
  date = '2026-08-11',
} = {}) {
  return { id, description, amountSek, date, cardRef: '86005' };
}

function makeExpenseStore(expenses = []) {
  return {
    listExpenses: ({ fromDate, toDate, limit }) => {
      let rows = expenses.filter((e) => e.status !== 'rejected');
      if (fromDate) rows = rows.filter((e) => (e.date || '') >= fromDate);
      if (toDate) rows = rows.filter((e) => (e.date || '') <= toDate);
      return rows.slice(0, limit || 1000);
    },
    createExpense: async ({ fields }) => ({ id: 'exp-new', ...fields }),
  };
}

function makeReceiptStore() {
  return {
    uploadReceipt: async ({ buffer, metadata }) => ({
      id: 'rcpt-new',
      bufferLength: buffer?.length,
      metadata,
    }),
  };
}

function makeSecureStorage(buffer = Buffer.from('pdf-bytes')) {
  return {
    getObject: async () => ({ buffer }),
  };
}

function makeCmStore(records = [], documents = []) {
  return {
    getInvoices: () => records.filter((r) => r.expenseType === 'invoice'),
    getReceipts: () => records.filter((r) => r.expenseType === 'receipt'),
    getTravel: () =>
      records.filter((r) => ['travel', 'flight_ticket', 'hotel', 'taxi'].includes(r.expenseType)),
    getDocumentById: (id) => documents.find((d) => d.id === id),
  };
}

function makeMailboxTruthStore(messages = []) {
  return {
    listLoadedMailboxes: () => ['info@hairtpclinic.com'],
    ensureMailboxLoaded: async () => {},
    listMessages: () => messages,
    hydrateMessageBodies: async (rows) => rows,
  };
}

test('findCfoExpense: träff på belopp och leverantörshint', () => {
  const expenses = [
    { id: 'e1', supplier: 'Meta', amountSek: 7096, date: '2026-08-11', status: 'new' },
    { id: 'e2', supplier: 'Apple', amountSek: 1295, date: '2026-08-15', status: 'new' },
  ];
  const hit = findCfoExpense({ tx: makeTx(), expenseStore: makeExpenseStore(expenses) });
  assert.equal(hit?.id, 'e1');
});

test('findCfoExpense: avvisad expense räknas inte', () => {
  const expenses = [
    { id: 'e1', supplier: 'Meta', amountSek: 7096, date: '2026-08-11', status: 'rejected' },
  ];
  const hit = findCfoExpense({ tx: makeTx(), expenseStore: makeExpenseStore(expenses) });
  assert.equal(hit, null);
});

test('findCmRecord: träff på amountIncVat, datum och supplierHint', () => {
  const records = [
    {
      id: 'cm-1',
      expenseType: 'invoice',
      supplierName: 'Meta Platforms',
      amountIncVat: 7096,
      date: '2026-08-11',
      approvalStatus: 'pending',
      bookkeepingStatus: 'pending',
    },
  ];
  const hit = findCmRecord({ tx: makeTx(), cmStore: makeCmStore(records) });
  assert.equal(hit?.id, 'cm-1');
});

test('findCmRecord: redan promotad record ignoreras', () => {
  const records = [
    {
      id: 'cm-1',
      expenseType: 'invoice',
      supplierName: 'Meta',
      amountIncVat: 7096,
      date: '2026-08-11',
      approvalStatus: 'pending',
      bookkeepingStatus: 'handed_off',
      cfoExpenseId: 'exp-old',
    },
  ];
  const hit = findCmRecord({ tx: makeTx(), cmStore: makeCmStore(records) });
  assert.equal(hit, null);
});

test('findMailboxMessage: träff på leverantörstoken i subject inom datumfönster', async () => {
  const messages = [
    {
      id: 'msg-1',
      mailboxId: 'info@hairtpclinic.com',
      subject: 'Faktura från Meta',
      bodyPreview: '',
      receivedAt: '2026-08-11T09:00:00Z',
      hasAttachments: true,
      attachmentNames: ['invoice.pdf'],
    },
  ];
  const hit = await findMailboxMessage({
    tx: makeTx(),
    mailboxTruthStore: makeMailboxTruthStore(messages),
  });
  assert.equal(hit?.messageKey, 'msg-1');
  assert.equal(hit?.hasAttachments, true);
  assert.equal(hit?.hasPdfAttachment, true);
});

test('findMailboxMessage: utanför datumfönster räknas inte', async () => {
  const messages = [
    {
      id: 'msg-1',
      mailboxId: 'info@hairtpclinic.com',
      subject: 'Faktura från Meta',
      receivedAt: '2026-01-01T09:00:00Z',
      hasAttachments: true,
    },
  ];
  const hit = await findMailboxMessage({
    tx: makeTx(),
    mailboxTruthStore: makeMailboxTruthStore(messages),
  });
  assert.equal(hit, null);
});

test('findInvoiceForTransaction: väljer CFO-expense före CM', async () => {
  const expenses = [
    { id: 'e1', supplier: 'Meta', amountSek: 7096, date: '2026-08-11', status: 'new' },
  ];
  const records = [
    {
      id: 'cm-1',
      expenseType: 'invoice',
      supplierName: 'Meta',
      amountIncVat: 7096,
      date: '2026-08-11',
      approvalStatus: 'pending',
      bookkeepingStatus: 'pending',
    },
  ];
  const r = await findInvoiceForTransaction(makeTx(), {
    expenseStore: makeExpenseStore(expenses),
    cmStore: makeCmStore(records),
  });
  assert.equal(r.matched, true);
  assert.equal(r.source, 'cfo_expense');
  assert.equal(r.expenseId, 'e1');
});

test('findInvoiceForTransaction: skapar expense ur CM-dokument', async () => {
  const records = [
    {
      id: 'cm-1',
      expenseType: 'invoice',
      supplierName: 'Meta',
      amountIncVat: 7096,
      date: '2026-08-11',
      approvalStatus: 'pending',
      bookkeepingStatus: 'pending',
      documentId: 'doc-1',
    },
  ];
  const documents = [
    { id: 'doc-1', storagePath: 'cm/meta.pdf', mimeType: 'application/pdf', fileName: 'meta.pdf' },
  ];
  const r = await findInvoiceForTransaction(makeTx(), {
    expenseStore: makeExpenseStore(),
    receiptStore: makeReceiptStore(),
    cmStore: makeCmStore(records, documents),
    secureStorage: makeSecureStorage(),
    actor: { userId: 'owner', role: 'OWNER' },
  });
  assert.equal(r.matched, true);
  assert.equal(r.source, 'cm_document');
  assert.equal(r.expenseId, 'exp-new');
});

test('findInvoiceForTransaction: rapporterar mailbox-träff utan att skapa expense', async () => {
  const messages = [
    {
      id: 'msg-1',
      mailboxId: 'info@hairtpclinic.com',
      subject: 'Faktura från Meta',
      receivedAt: '2026-08-11T09:00:00Z',
      hasAttachments: true,
      attachmentNames: ['invoice.pdf'],
    },
  ];
  const r = await findInvoiceForTransaction(makeTx(), {
    expenseStore: makeExpenseStore(),
    mailboxTruthStore: makeMailboxTruthStore(messages),
  });
  assert.equal(r.matched, false);
  assert.equal(r.source, 'mailbox_truth');
  assert.equal(r.evidence?.hasPdfAttachment, true);
});

test('autoFetchInvoices: matchar endast omatchade över tröskel', async () => {
  const unmatched = [
    makeTx({ id: 't1', amountSek: 7096, description: 'META', date: '2026-08-11' }),
    makeTx({ id: 't2', amountSek: 95, description: 'UBER', date: '2026-08-12' }),
  ];
  const recon = {
    listTransactions: ({ status }) => (status === 'unmatched' ? unmatched : []),
    confirmMatch: async (txId, expenseId) => ({ id: txId, matchedExpenseId: expenseId }),
  };
  const expenses = [
    { id: 'e1', supplier: 'Meta', amountSek: 7096, date: '2026-08-11', status: 'new' },
  ];
  const result = await autoFetchInvoices({
    reconciliation: recon,
    expenseStore: makeExpenseStore(expenses),
    threshold: 1000,
  });
  assert.equal(result.scanned, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.results[0].matchConfirmed, true);
});

test('autoFetchInvoices: threshold 0 skannar alla omatchade inklusive småbelopp', async () => {
  const unmatched = [
    makeTx({ id: 't1', amountSek: 7096, description: 'META', date: '2026-08-11' }),
    makeTx({ id: 't2', amountSek: 95, description: 'UBER', date: '2026-08-12' }),
  ];
  const recon = {
    listTransactions: ({ status }) => (status === 'unmatched' ? unmatched : []),
    confirmMatch: async (txId, expenseId) => ({ id: txId, matchedExpenseId: expenseId }),
  };
  const result = await autoFetchInvoices({
    reconciliation: recon,
    expenseStore: makeExpenseStore(),
    threshold: 0,
  });
  assert.equal(result.scanned, 2);
});

function makeGraphConnector(attachmentBuffer = Buffer.from('pdf-bytes')) {
  return {
    probeMessageAttachments: async () => [
      {
        id: 'att-1',
        name: 'invoice.pdf',
        contentType: 'application/pdf',
        isInline: false,
        size: attachmentBuffer.length,
      },
    ],
    fetchMessageAttachmentContent: async () => ({
      buffer: attachmentBuffer,
      name: 'invoice.pdf',
      contentType: 'application/pdf',
    }),
  };
}

const { normalizeCfoCategory } = require('../../src/cfo/cfoInvoiceFetch');

test('findInvoiceForTransaction: skapar expense ur mailbox-bilaga när Graph-connector finns', async () => {
  const messages = [
    {
      id: 'msg-1',
      mailboxId: 'info@hairtpclinic.com',
      subject: 'Faktura från Meta',
      receivedAt: '2026-08-11T09:00:00Z',
      hasAttachments: true,
      attachmentNames: ['invoice.pdf'],
    },
  ];
  const r = await findInvoiceForTransaction(makeTx(), {
    expenseStore: makeExpenseStore(),
    receiptStore: makeReceiptStore(),
    mailboxTruthStore: makeMailboxTruthStore(messages),
    graphReadConnector: makeGraphConnector(),
    actor: { userId: 'owner', role: 'OWNER' },
  });
  assert.equal(r.matched, true);
  assert.equal(r.source, 'mailbox_attachment');
  assert.equal(r.expenseId, 'exp-new');
  assert.equal(r.receiptId, 'rcpt-new');
});

test('findInvoiceForTransaction: utan Graph-connector rapporteras mailbox-träff', async () => {
  const messages = [
    {
      id: 'msg-1',
      mailboxId: 'info@hairtpclinic.com',
      subject: 'Faktura från Meta',
      receivedAt: '2026-08-11T09:00:00Z',
      hasAttachments: true,
      attachmentNames: ['invoice.pdf'],
    },
  ];
  const r = await findInvoiceForTransaction(makeTx(), {
    expenseStore: makeExpenseStore(),
    receiptStore: makeReceiptStore(),
    mailboxTruthStore: makeMailboxTruthStore(messages),
    actor: { userId: 'owner', role: 'OWNER' },
  });
  assert.equal(r.matched, false);
  assert.equal(r.source, 'mailbox_truth');
  assert.equal(r.evidence?.hasPdfAttachment, true);
});

test('normalizeCfoCategory: svenska tecken och mellanslag normaliseras', () => {
  assert.equal(normalizeCfoCategory('marknadsföring'), 'marknadsforing');
  assert.equal(normalizeCfoCategory('  Marknadsföring '), 'marknadsforing');
  assert.equal(normalizeCfoCategory('kontorsmaterial'), 'forbrukning');
  assert.equal(normalizeCfoCategory('programvara'), 'it_telefoni');
  assert.equal(normalizeCfoCategory('osäker kategori'), null);
  assert.equal(normalizeCfoCategory(null), null);
});
