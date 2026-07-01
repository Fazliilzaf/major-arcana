'use strict';

/**
 * Clinic Performance composition (read-only, pure).
 *
 * Builds the ClinicMetrics shape that the CEO app (arcana-ceo-agent) already
 * consumes, from data that exists in major-arcana today. Deterministic, no I/O
 * — the route wires the real stores; this module just shapes the numbers so it
 * is unit-testable.
 *
 * HONEST PARTIAL LIVE (v0.2b step 1): bookings + no-show now carry an honest
 * delta against the previous month because bookings already exist all-time in
 * the source store. revenue and avg order value still have `previous: null`
 * until finance gets a proper period-sliced source. utilizationRate and
 * channelSplit still have no clean source and stay null / omitted.
 */

const MONTHS_SV = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

function periodLabel(date) {
  return `${MONTHS_SV[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function safeNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * @param {object} args
 * @param {Array} [args.bookings]              raw bookings (need `startsAt` + `status`)
 * @param {object|null} [args.financeDashboard] buildFinanceDashboard() output, or null
 * @param {Date} [args.now]                    reference time for the current-month window
 * @param {string|null} [args.tenantId]
 * @returns {object} ClinicMetrics (source: "live")
 */
function composeClinicMetrics({
  bookings = [],
  financeDashboard = null,
  now = new Date(),
  tenantId = null,
} = {}) {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const prevMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const monthStartDate = new Date(monthStart);
  const prevMonthStartDate = new Date(prevMonthStart);

  // Bokningar denna månad och föregående månad (per startsAt) + no-show inom samma fönster.
  let bookingsCurrent = 0;
  let bookingsPrevious = 0;
  let noShowCurrent = 0;
  let noShowPrevious = 0;
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const t = b && b.startsAt ? Date.parse(b.startsAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= monthStart && t < nextMonthStart) {
      bookingsCurrent += 1;
      if (b.status === 'no_show') noShowCurrent += 1;
      continue;
    }
    if (t >= prevMonthStart && t < monthStart) {
      bookingsPrevious += 1;
      if (b.status === 'no_show') noShowPrevious += 1;
    }
  }
  const noShowRateCurrent =
    bookingsCurrent > 0 ? Number((noShowCurrent / bookingsCurrent).toFixed(4)) : 0;
  const noShowRatePrevious =
    bookingsPrevious > 0 ? Number((noShowPrevious / bookingsPrevious).toFixed(4)) : 0;

  // Intäkt betald denna månad ur finance-dashboarden (null om ej tillgänglig).
  const revenueCurrent =
    financeDashboard && financeDashboard.invoices
      ? safeNum(financeDashboard.invoices.totalPaidThisMonthSek)
      : null;

  // Snittordervärde: proxy = intäkt denna månad ÷ bokningar denna månad.
  // Inte exakt pris per bokning (bokningsdata saknar pris) — null om vi saknar del.
  const avgOrderValueCurrent =
    revenueCurrent !== null && bookingsCurrent > 0
      ? Math.round(revenueCurrent / bookingsCurrent)
      : null;

  return {
    tenantId: tenantId || null,
    period: periodLabel(monthStartDate),
    previousPeriod: periodLabel(prevMonthStartDate),
    source: 'live',
    bookings: { current: bookingsCurrent, previous: bookingsPrevious },
    revenueSek: { current: revenueCurrent, previous: null },
    noShowRate: { current: noShowRateCurrent, previous: noShowRatePrevious },
    utilizationRate: { current: null, previous: null },
    avgOrderValueSek: { current: avgOrderValueCurrent, previous: null },
    // channelSplit medvetet utelämnad — ingen ren kanalkälla ännu (v0.2b).
    notLiveYet: [
      'utilizationRate',
      'channelSplit',
      'revenueSek.previous',
      'avgOrderValueSek.previous',
    ],
    avgOrderValueNote:
      'Proxy: intäkt betald denna månad ÷ bokningar denna månad (bokningsdata saknar pris per bokning).',
  };
}

module.exports = { composeClinicMetrics, periodLabel };
