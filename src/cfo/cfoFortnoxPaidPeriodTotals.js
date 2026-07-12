'use strict';

function safeNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function endOfUtcDayExclusive(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

function previousMonthSameDayEndExclusive(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  const targetYear = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const targetMonth = d.getUTCMonth() === 0 ? 11 : d.getUTCMonth() - 1;
  const lastDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d.getUTCDate(), lastDayInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay + 1)).toISOString();
}

function periodStartUtcMonth(dateLike, monthOffset = 0) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1)).toISOString();
}

function paymentPaidAtIso(payment = {}) {
  const raw =
    normalizeText(payment.PaymentDate) ||
    normalizeText(payment.BookkeepingDate) ||
    normalizeText(payment.InvoiceDate);
  if (!raw) return '';
  return raw.includes('T') ? raw : `${raw}T12:00:00.000Z`;
}

function sumPaymentsInWindow(payments, startIso, endExclusiveIso) {
  let total = 0;
  for (const payment of Array.isArray(payments) ? payments : []) {
    const paidAt = paymentPaidAtIso(payment);
    if (!paidAt) continue;
    if (paidAt >= startIso && paidAt < endExclusiveIso) {
      total += safeNum(payment.Amount ?? payment.Total);
    }
  }
  return total;
}

function buildFortnoxPaidPeriodTotals(payments = [], now = new Date()) {
  const monthStartIso = periodStartUtcMonth(now, 0);
  const previousMonthStartIso = periodStartUtcMonth(now, -1);
  const currentEndExclusiveIso = endOfUtcDayExclusive(now);
  const previousComparableEndExclusiveIso = previousMonthSameDayEndExclusive(now);

  const current = sumPaymentsInWindow(payments, monthStartIso, currentEndExclusiveIso);
  const previous = sumPaymentsInWindow(
    payments,
    previousMonthStartIso,
    previousComparableEndExclusiveIso
  );

  return {
    totalPaidThisMonthSek: current,
    totalPaidPreviousComparablePeriodSek: previous,
    source: 'fortnox_invoice_payments',
  };
}

module.exports = {
  buildFortnoxPaidPeriodTotals,
  paymentPaidAtIso,
  sumPaymentsInWindow,
  endOfUtcDayExclusive,
  previousMonthSameDayEndExclusive,
  periodStartUtcMonth,
};
