const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFinanceDashboard } = require('../../src/cfo/cfoFinanceDashboardBuilder');

test('buildFinanceDashboard räknar previous comparable period för betalda fakturor', async () => {
  const dashboard = await buildFinanceDashboard({
    stores: {
      commercialStore: {
        async listAll() {
          return [
            { invoiceStatus: 'paid', invoicePaidAt: '2026-06-02T09:00:00.000Z', totalDueSek: 5000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-06-15T12:00:00.000Z', totalDueSek: 7000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-05-02T09:00:00.000Z', totalDueSek: 3000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-05-15T12:00:00.000Z', totalDueSek: 4000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-05-16T00:00:00.000Z', totalDueSek: 9000 }, // efter same-day-cutoff
          ];
        },
      },
    },
    fortnoxBlockedIntegration: false,
    now: new Date(Date.UTC(2026, 5, 15, 10, 0, 0)),
  });

  assert.equal(dashboard.invoices.totalPaidThisMonthSek, 12000);
  assert.equal(dashboard.invoices.totalPaidPreviousComparablePeriodSek, 7000);
});

test('buildFinanceDashboard klampar previous comparable period till föregående månads sista dag', async () => {
  const dashboard = await buildFinanceDashboard({
    stores: {
      commercialStore: {
        async listAll() {
          return [
            { invoiceStatus: 'paid', invoicePaidAt: '2026-03-31T09:00:00.000Z', totalDueSek: 5000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-02-28T12:00:00.000Z', totalDueSek: 4000 },
            { invoiceStatus: 'paid', invoicePaidAt: '2026-03-01T00:00:00.000Z', totalDueSek: 3000 },
          ];
        },
      },
    },
    fortnoxBlockedIntegration: false,
    now: new Date(Date.UTC(2026, 2, 31, 10, 0, 0)),
  });

  assert.equal(dashboard.invoices.totalPaidPreviousComparablePeriodSek, 4000);
});

test('buildFinanceDashboard prioriterar Fortnox InvoicePayments när ansluten', async () => {
  const dashboard = await buildFinanceDashboard({
    stores: {
      fortnoxStore: {
        async getPublicStatus() {
          return { connected: true, connectedAt: '2026-01-01T00:00:00.000Z' };
        },
      },
      fortnoxInvoiceLister: {
        async listAllInvoicePayments() {
          return {
            ok: true,
            payments: [
              { PaymentDate: '2026-06-02', Amount: 11000 },
              { PaymentDate: '2026-05-03', Amount: 4500 },
            ],
          };
        },
      },
      commercialStore: {
        async listAll() {
          return [
            { invoiceStatus: 'paid', invoicePaidAt: '2026-06-02T09:00:00.000Z', totalDueSek: 1 },
          ];
        },
      },
    },
    fortnoxBlockedIntegration: false,
    now: new Date(Date.UTC(2026, 5, 15, 10, 0, 0)),
  });

  assert.equal(dashboard.invoices.totalPaidThisMonthSek, 11000);
  assert.equal(dashboard.invoices.totalPaidPreviousComparablePeriodSek, 4500);
  assert.match(dashboard.invoices.note, /Fortnox betalda fakturor/i);
  assert.equal(dashboard.invoices.partial, false);
});

test('buildFinanceDashboard löser Fortnox-tenant via hair_tp-alias', async () => {
  const requested = [];
  const dashboard = await buildFinanceDashboard({
    stores: {
      fortnoxStore: {
        async getPublicStatus({ tenantId }) {
          return { connected: tenantId === 'hair_tp' };
        },
      },
      fortnoxInvoiceLister: {
        async listAllInvoicePayments({ tenantId }) {
          requested.push(tenantId);
          return {
            ok: true,
            payments: [{ PaymentDate: '2026-06-02', Amount: 5000 }],
          };
        },
      },
    },
    tenantId: 'hair-tp-clinic',
    fortnoxBlockedIntegration: false,
    now: new Date(Date.UTC(2026, 5, 15, 10, 0, 0)),
  });

  assert.equal(dashboard.fortnoxTenantId, 'hair_tp');
  assert.equal(requested[0], 'hair_tp');
  assert.equal(dashboard.invoices.totalPaidThisMonthSek, 5000);
});

test('buildFinanceDashboard slice=invoices hoppar tung rest av dashboard', async () => {
  let commercialCalls = 0;
  const dashboard = await buildFinanceDashboard({
    stores: {
      commercialStore: {
        async listAll() {
          commercialCalls += 1;
          return [];
        },
      },
    },
    slice: 'invoices',
    fortnoxBlockedIntegration: false,
    now: new Date(Date.UTC(2026, 5, 15, 10, 0, 0)),
  });

  assert.equal(dashboard.invoices.partial, true);
  assert.equal(typeof dashboard.invoices, 'object');
  assert.equal(dashboard.deposits, undefined);
  assert.equal(commercialCalls, 1);
});
