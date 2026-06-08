'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPatientPaymentHistory,
  formatAmountLabel,
  swishPaymentToHistoryEntry,
  fortnoxInvoiceToHistoryEntry,
} = require('../../src/ops/ccoPatientPaymentHistory');

test('formatAmountLabel formats SEK amounts', () => {
  assert.match(formatAmountLabel(1500), /kr/);
  assert.match(formatAmountLabel('49.5'), /kr/);
});

test('buildPatientPaymentHistory aggregates Swish payments for patient (ORD-35)', async () => {
  const swishStore = {
    async listPayments() {
      return [
        {
          id: 'pay-1',
          patientId: 'patient-1',
          amount: '1500.00',
          currency: 'SEK',
          status: 'PAID',
          paymentReference: 'SW123',
          paidAt: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'pay-2',
          patientId: 'patient-2',
          amount: '500.00',
          currency: 'SEK',
          status: 'CREATED',
          createdAt: '2026-05-21T10:00:00.000Z',
        },
      ];
    },
  };
  const result = await buildPatientPaymentHistory({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    patientCard: { fortnoxCustomerId: '' },
    swishStore,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].method, 'swish');
  assert.equal(result.items[0].status, 'paid');
  assert.equal(result.meta.swishCount, 1);
  assert.deepEqual(result.meta.sources, ['swish']);
});

test('buildPatientPaymentHistory includes Fortnox invoices when lister returns data', async () => {
  const fortnoxInvoiceLister = {
    async listInvoicesForCustomer() {
      return {
        ok: true,
        invoices: [
          {
            DocumentNumber: '1001',
            InvoiceDate: '2026-04-01',
            DueDate: '2026-04-15',
            Total: 12000,
            Balance: 0,
            Currency: 'SEK',
          },
        ],
        payments: [],
      };
    },
  };
  const fortnoxStore = {
    async getPublicStatus() {
      return { connected: true };
    },
  };
  const result = await buildPatientPaymentHistory({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    patientCard: { fortnoxCustomerId: '42' },
    swishStore: {
      async listPayments() {
        return [];
      },
    },
    fortnoxInvoiceLister,
    fortnoxStore,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].method, 'invoice');
  assert.equal(result.items[0].source, 'fortnox');
  assert.equal(result.meta.fortnoxInvoiceCount, 1);
});

test('buildPatientPaymentHistory returns empty list without sources', async () => {
  const result = await buildPatientPaymentHistory({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    patientCard: {},
    swishStore: {
      async listPayments() {
        return [];
      },
    },
  });
  assert.deepEqual(result.items, []);
  assert.match(result.meta.notes.join(' '), /fortnox_customer_missing/);
});

test('swishPaymentToHistoryEntry maps paid status', () => {
  const entry = swishPaymentToHistoryEntry({
    id: 'x',
    amount: '100.00',
    status: 'PAID',
    paymentReference: 'ABC',
    paidAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(entry.status, 'paid');
  assert.equal(entry.ref, 'ABC');
});

test('fortnoxInvoiceToHistoryEntry maps overdue balance', () => {
  const entry = fortnoxInvoiceToHistoryEntry({
    DocumentNumber: '900',
    InvoiceDate: '2026-01-01',
    DueDate: '2020-01-01',
    Total: 1000,
    Balance: 1000,
  });
  assert.equal(entry.status, 'overdue');
});
