const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFortnoxPaidPeriodTotals,
  sumPaymentsInWindow,
} = require('../../src/cfo/cfoFortnoxPaidPeriodTotals');

const NOW = new Date(Date.UTC(2026, 5, 15, 10, 0, 0));

test('buildFortnoxPaidPeriodTotals summerar betalda fakturor same-day som bookings', () => {
  const payments = [
    { PaymentDate: '2026-06-02', Amount: 5000 },
    { PaymentDate: '2026-06-15', Amount: 7000 },
    { PaymentDate: '2026-06-20', Amount: 9000 }, // efter same-day-cutoff
    { PaymentDate: '2026-05-02', Amount: 3000 },
    { PaymentDate: '2026-05-15', Amount: 4000 },
    { PaymentDate: '2026-05-16', Amount: 8000 }, // efter previous same-day-cutoff
  ];
  const totals = buildFortnoxPaidPeriodTotals(payments, NOW);
  assert.equal(totals.totalPaidThisMonthSek, 12000);
  assert.equal(totals.totalPaidPreviousComparablePeriodSek, 7000);
});

test('sumPaymentsInWindow returnerar 0 för tom lista', () => {
  assert.equal(sumPaymentsInWindow([], '2026-06-01T00:00:00.000Z', '2026-06-16T00:00:00.000Z'), 0);
});
