'use strict';

/**
 * Clinic Performance composition (read-only, pure).
 *
 * Builds the ClinicMetrics shape that the CEO app (arcana-ceo-agent) already
 * consumes, from data that exists in major-arcana today. Deterministic, no I/O
 * — the route wires the real stores; this module just shapes the numbers so it
 * is unit-testable.
 *
 * HONEST PARTIAL LIVE (v0.2a): only the metrics with a clean truth source are
 * produced — bookings, no-show rate, revenue and a proxy avg order value, all
 * scoped to the current month. utilizationRate and channelSplit have no clean
 * source yet, so they are returned null / omitted (never fabricated). previous
 * is null across the board (no historical/period-sliced query yet → no trend).
 * These gaps are listed in `notLiveYet` so the consumer can be explicit.
 */

const MONTHS_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
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
function composeClinicMetrics({ bookings = [], financeDashboard = null, now = new Date(), tenantId = null } = {}) {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const monthStartDate = new Date(monthStart);
  const prevMonthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  // Bokningar denna månad (per startsAt) + no-show inom samma fönster.
  let bookingsCurrent = 0;
  let noShowCurrent = 0;
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const t = b && b.startsAt ? Date.parse(b.startsAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= monthStart && t < nextMonthStart) {
      bookingsCurrent += 1;
      if (b.status === 'no_show') noShowCurrent += 1;
    }
  }
  const noShowRateCurrent = bookingsCurrent > 0 ? Number((noShowCurrent / bookingsCurrent).toFixed(4)) : 0;

  // Intäkt betald denna månad ur finance-dashboarden (null om ej tillgänglig).
  const revenueCurrent = financeDashboard && financeDashboard.invoices
    ? safeNum(financeDashboard.invoices.totalPaidThisMonthSek)
    : null;

  // Snittordervärde: proxy = intäkt denna månad ÷ bokningar denna månad.
  // Inte exakt pris per bokning (bokningsdata saknar pris) — null om vi saknar del.
  const avgOrderValueCurrent = revenueCurrent !== null && bookingsCurrent > 0
    ? Math.round(revenueCurrent / bookingsCurrent)
    : null;

  return {
    tenantId: tenantId || null,
    period: periodLabel(monthStartDate),
    previousPeriod: periodLabel(prevMonthStartDate),
    source: 'live',
    bookings: { current: bookingsCurrent, previous: null },
    revenueSek: { current: revenueCurrent, previous: null },
    noShowRate: { current: noShowRateCurrent, previous: null },
    utilizationRate: { current: null, previous: null },
    avgOrderValueSek: { current: avgOrderValueCurrent, previous: null },
    // channelSplit medvetet utelämnad — ingen ren kanalkälla ännu (v0.2b).
    notLiveYet: ['utilizationRate', 'channelSplit', 'trend/previousPeriod'],
    avgOrderValueNote:
      'Proxy: intäkt betald denna månad ÷ bokningar denna månad (bokningsdata saknar pris per bokning).',
  };
}

module.exports = { composeClinicMetrics, periodLabel };
