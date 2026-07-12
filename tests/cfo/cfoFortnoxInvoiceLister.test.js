const test = require('node:test');
const assert = require('node:assert/strict');

const { createCfoFortnoxInvoiceLister } = require('../../src/cfo/cfoFortnoxInvoiceLister');

test('listAllInvoicePayments cachar periodresultat', async () => {
  let calls = 0;
  const lister = createCfoFortnoxInvoiceLister({
    periodCacheTtlMs: 60_000,
    createClientFor: async () => ({
      async listInvoicePayments() {
        calls += 1;
        return { InvoicePayments: [{ PaymentDate: '2026-06-02', Amount: 1000 }] };
      },
    }),
  });

  const first = await lister.listAllInvoicePayments({
    tenantId: 'hair_tp',
    fromDate: '2026-06-01',
    toDate: '2026-06-30',
  });
  const second = await lister.listAllInvoicePayments({
    tenantId: 'hair_tp',
    fromDate: '2026-06-01',
    toDate: '2026-06-30',
  });

  assert.equal(first.ok, true);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});
