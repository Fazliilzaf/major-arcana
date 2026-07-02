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
