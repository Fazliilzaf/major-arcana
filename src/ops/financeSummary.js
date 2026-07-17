'use strict';

/**
 * ORD-79 — Ekonomi-aggregat till CEO (intäkt + kostnader + resultat).
 * Aggregat only — inga leverantörsnamn/kvittorader.
 */

const {
  endOfUtcDayExclusive,
  previousMonthSameDayEndExclusive,
  periodStartUtcMonth,
} = require('../cfo/cfoFortnoxPaidPeriodTotals');

/** Godkända/promotade CFO-statuser — CM-kandidater räknas ej. */
const PROMOTED_EXPENSE_STATUSES = Object.freeze(['approved', 'ready_for_export', 'exported']);

function safeNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function periodLabel(monthStartDate) {
  const y = monthStartDate.getUTCFullYear();
  const m = String(monthStartDate.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function expenseAtIso(expense = {}) {
  const raw = String(expense.date || expense.createdAt || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) return raw;
  // date-only → mitt på dagen UTC så fönsterjämförelse är stabil
  return `${raw.slice(0, 10)}T12:00:00.000Z`;
}

function isPromotedExpense(expense) {
  return PROMOTED_EXPENSE_STATUSES.includes(expense?.status);
}

/**
 * Summera promotade utgifter i [startIso, endExclusiveIso).
 * @returns {{ sumSek: number, count: number, byCategory: Map<string, number> }}
 */
function sumExpensesInWindow(expenses, startIso, endExclusiveIso) {
  let sumSek = 0;
  let count = 0;
  const byCategory = new Map();
  for (const expense of Array.isArray(expenses) ? expenses : []) {
    if (!isPromotedExpense(expense)) continue;
    const at = expenseAtIso(expense);
    if (!at || at < startIso || at >= endExclusiveIso) continue;
    const amount = safeNum(expense.amountSek);
    sumSek += amount;
    count += 1;
    const cat =
      typeof expense.category === 'string' && expense.category.trim()
        ? expense.category.trim()
        : 'annat';
    byCategory.set(cat, (byCategory.get(cat) || 0) + amount);
  }
  return { sumSek, count, byCategory };
}

function topCategoriesFromMap(byCategory, limit = 3) {
  return [...byCategory.entries()]
    .map(([category, sumSek]) => ({ category, sumSek: Math.round(sumSek) }))
    .sort((a, b) => b.sumSek - a.sumSek || a.category.localeCompare(b.category))
    .slice(0, Math.max(0, limit));
}

/**
 * @param {object} args
 * @param {object|null} [args.financeDashboard] buildFinanceDashboard output (slice invoices)
 * @param {object[]} [args.expenses] cfoExpenseStore rows
 * @param {Date} [args.now]
 * @param {string} [args.tenantId]
 * @param {boolean} [args.fortnoxConnected]
 */
function composeFinanceSummary({
  financeDashboard = null,
  expenses = [],
  now = new Date(),
  tenantId = null,
  fortnoxConnected = null,
} = {}) {
  const monthStartIso = periodStartUtcMonth(now, 0);
  const previousMonthStartIso = periodStartUtcMonth(now, -1);
  const currentEndExclusiveIso = endOfUtcDayExclusive(now);
  const previousComparableEndExclusiveIso = previousMonthSameDayEndExclusive(now);
  const monthStartDate = new Date(monthStartIso);
  const prevMonthStartDate = new Date(previousMonthStartIso);

  const invoices = financeDashboard?.invoices || null;
  const revenueHasCurrent =
    invoices &&
    typeof invoices.totalPaidThisMonthSek === 'number' &&
    Number.isFinite(invoices.totalPaidThisMonthSek);
  const revenueHasPrevious =
    invoices &&
    typeof invoices.totalPaidPreviousComparablePeriodSek === 'number' &&
    Number.isFinite(invoices.totalPaidPreviousComparablePeriodSek);

  const revenueCurrent = revenueHasCurrent
    ? Math.round(safeNum(invoices.totalPaidThisMonthSek))
    : null;
  const revenuePrevious = revenueHasPrevious
    ? Math.round(safeNum(invoices.totalPaidPreviousComparablePeriodSek))
    : null;

  const currentExp = sumExpensesInWindow(expenses, monthStartIso, currentEndExclusiveIso);
  const previousExp = sumExpensesInWindow(
    expenses,
    previousMonthStartIso,
    previousComparableEndExclusiveIso
  );

  const expensesCurrent = Math.round(currentExp.sumSek);
  const expensesPrevious = Math.round(previousExp.sumSek);

  const resultCurrent =
    revenueCurrent !== null ? Math.round(revenueCurrent - expensesCurrent) : null;
  const resultPrevious =
    revenuePrevious !== null ? Math.round(revenuePrevious - expensesPrevious) : null;

  const connected =
    typeof fortnoxConnected === 'boolean'
      ? fortnoxConnected
      : !!financeDashboard?.fortnox?.connected;

  const revenueSource = connected
    ? invoices?.note?.includes('Fortnox')
      ? 'fortnox_invoice_payments'
      : invoices?.partial === false
        ? 'fortnox_or_commercial'
        : 'commercial_or_partial'
    : revenueCurrent !== null
      ? 'commercial_proxy'
      : 'unavailable';

  const notLiveYet = [];
  if (revenueCurrent === null) notLiveYet.push('revenueSek');
  else if (revenuePrevious === null) notLiveYet.push('revenueSek.previous');
  if (resultCurrent === null) notLiveYet.push('resultSek');
  else if (resultPrevious === null) notLiveYet.push('resultSek.previous');

  const dataNote = [
    'Live-aggregat från major-arcana gateway. Same-day-fönster: hittills i månaden t.o.m. dagens kalenderdag mot samma kalenderdag föregående månad.',
    connected
      ? 'Intäkt: Fortnox betalda fakturor när anslutet (annars commercial-proxy).'
      : 'Intäkt: Fortnox ej ansluten — null om ingen commercial-proxy.',
    'Kostnader: summa av CFO-promotade utgifter (approved/ready_for_export/exported). CM-kandidater räknas inte. CM/CFO-kostnadshistorik är ofullständig — täckningen växer med intaget.',
  ].join(' ');

  return {
    tenantId: tenantId || null,
    period: periodLabel(monthStartDate),
    previousPeriod: periodLabel(prevMonthStartDate),
    source: 'live',
    revenueSek: { current: revenueCurrent, previous: revenuePrevious },
    expensesSek: { current: expensesCurrent, previous: expensesPrevious },
    resultSek: { current: resultCurrent, previous: resultPrevious },
    expenseCount: { current: currentExp.count, previous: previousExp.count },
    topCategories: {
      current: topCategoriesFromMap(currentExp.byCategory, 3),
      previous: topCategoriesFromMap(previousExp.byCategory, 3),
    },
    sources: {
      revenue: revenueSource,
      expenses: 'cfo_expense_store_promoted',
      fortnoxConnected: connected,
    },
    notLiveYet,
    dataNote,
  };
}

/**
 * Assert payload never leaks supplier/notes/receipt lines (v1 safety).
 * @param {object} summary
 * @returns {string[]} forbidden keys found (empty = ok)
 */
function findForbiddenPiiKeys(summary, path = '') {
  const forbidden = [];
  if (summary == null || typeof summary !== 'object') return forbidden;
  for (const [key, value] of Object.entries(summary)) {
    const next = path ? `${path}.${key}` : key;
    const lower = key.toLowerCase();
    if (
      lower.includes('supplier') ||
      lower.includes('receipt') ||
      lower === 'notes' ||
      lower === 'attachmentkeys' ||
      lower === 'customerid'
    ) {
      forbidden.push(next);
    }
    if (value && typeof value === 'object') {
      forbidden.push(...findForbiddenPiiKeys(value, next));
    }
  }
  return forbidden;
}

module.exports = {
  PROMOTED_EXPENSE_STATUSES,
  composeFinanceSummary,
  sumExpensesInWindow,
  expenseAtIso,
  isPromotedExpense,
  findForbiddenPiiKeys,
};
