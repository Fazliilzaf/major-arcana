'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeFinanceSummary,
  sumExpensesInWindow,
  findForbiddenPiiKeys,
  PROMOTED_EXPENSE_STATUSES,
} = require('../../src/ops/financeSummary');

const NOW = new Date('2026-07-16T12:00:00.000Z');

test('sumExpensesInWindow: exkluderar kandidater och summerar promotade', () => {
  const expenses = [
    { status: 'approved', amountSek: 100, date: '2026-07-10', category: 'resor' },
    { status: 'new', amountSek: 999, date: '2026-07-10', category: 'resor' },
    { status: 'needs_review', amountSek: 50, date: '2026-07-10', category: 'lokal' },
    { status: 'exported', amountSek: 200, date: '2026-07-01', category: 'lokal' },
    { status: 'rejected', amountSek: 80, date: '2026-07-05', category: 'annat' },
  ];
  const { sumSek, count, byCategory } = sumExpensesInWindow(
    expenses,
    '2026-07-01T00:00:00.000Z',
    '2026-07-17T00:00:00.000Z'
  );
  assert.equal(sumSek, 300);
  assert.equal(count, 2);
  assert.equal(byCategory.get('resor'), 100);
  assert.equal(byCategory.get('lokal'), 200);
});

test('composeFinanceSummary: result = revenue − expenses; topCategories max 3', () => {
  const financeDashboard = {
    fortnox: { connected: true },
    invoices: {
      totalPaidThisMonthSek: 10000,
      totalPaidPreviousComparablePeriodSek: 8000,
      note: 'Fortnox betalda fakturor',
      partial: false,
    },
  };
  const expenses = [
    { status: 'approved', amountSek: 1000, date: '2026-07-05', category: 'marknadsforing' },
    { status: 'ready_for_export', amountSek: 500, date: '2026-07-08', category: 'it_telefoni' },
    { status: 'exported', amountSek: 300, date: '2026-07-12', category: 'lokal' },
    { status: 'approved', amountSek: 100, date: '2026-07-14', category: 'resor' },
    {
      status: 'categorized',
      amountSek: 9999,
      date: '2026-07-14',
      category: 'annat',
      supplier: 'ACME',
    },
    { status: 'approved', amountSek: 400, date: '2026-06-10', category: 'lokal' },
  ];

  const summary = composeFinanceSummary({
    financeDashboard,
    expenses,
    now: NOW,
    tenantId: 'hair-tp-clinic',
  });

  assert.equal(summary.revenueSek.current, 10000);
  assert.equal(summary.revenueSek.previous, 8000);
  assert.equal(summary.expensesSek.current, 1900);
  assert.equal(summary.expenseCount.current, 4);
  assert.equal(summary.resultSek.current, 8100);
  assert.equal(summary.expensesSek.previous, 400);
  assert.equal(summary.resultSek.previous, 7600);
  assert.equal(summary.topCategories.current.length, 3);
  assert.equal(summary.topCategories.current[0].category, 'marknadsforing');
  assert.ok(!JSON.stringify(summary).includes('ACME'));
  assert.deepEqual(findForbiddenPiiKeys(summary), []);
  assert.ok(summary.dataNote.includes('ofullständig'));
  assert.equal(summary.sources.fortnoxConnected, true);
});

test('composeFinanceSummary: null revenue när finance saknas — expenses kvar', () => {
  const summary = composeFinanceSummary({
    financeDashboard: null,
    expenses: [{ status: 'approved', amountSek: 250, date: '2026-07-02', category: 'lokal' }],
    now: NOW,
    tenantId: 'hair-tp-clinic',
    fortnoxConnected: false,
  });
  assert.equal(summary.revenueSek.current, null);
  assert.equal(summary.expensesSek.current, 250);
  assert.equal(summary.resultSek.current, null);
  assert.ok(summary.notLiveYet.includes('revenueSek'));
  assert.ok(summary.notLiveYet.includes('resultSek'));
  assert.equal(summary.sources.fortnoxConnected, false);
});

test('PROMOTED_EXPENSE_STATUSES täcker godkända CFO-lägen', () => {
  assert.deepEqual([...PROMOTED_EXPENSE_STATUSES].sort(), [
    'approved',
    'exported',
    'ready_for_export',
  ]);
});
