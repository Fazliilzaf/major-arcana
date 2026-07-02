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

function endOfUtcDayExclusive(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function previousMonthSameDayEndExclusive(date) {
  const targetYear = date.getUTCMonth() === 0 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() === 0 ? 11 : date.getUTCMonth() - 1;
  const lastDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(date.getUTCDate(), lastDayInTargetMonth);
  return Date.UTC(targetYear, targetMonth, clampedDay + 1);
}

function safeNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isHairTpTenantFamily(tenantId = '') {
  const normalized = normalizeText(tenantId).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('hairtp') ||
    normalized.includes('hair-tp') ||
    normalized.includes('hair_tp')
  );
}

function bookingTenantCandidates(tenantId = '') {
  const base = normalizeText(tenantId);
  const rows = [base];
  if (base.includes('-')) rows.push(base.replace(/-/g, '_'));
  if (base.includes('_')) rows.push(base.replace(/_/g, '-'));
  if (isHairTpTenantFamily(base)) {
    rows.push('hair-tp-clinic', 'hair_tp', 'hairtp-clinic', 'hairtpclinic');
  }
  return [...new Set(rows.filter(Boolean))];
}

function bookingDedupeKey(booking = {}) {
  const bookingId = normalizeText(booking.bookingId || booking.id);
  if (bookingId) return `id:${bookingId}`;
  const email = normalizeEmail(booking.customerEmail);
  const startsAt = normalizeText(booking.startsAt);
  const status = normalizeText(booking.status);
  return `fallback:${email}::${startsAt}::${status}`;
}

function buildClinicPerformanceRow({
  bookingId = '',
  customerEmail = '',
  startsAt = '',
  status = '',
  source = '',
  serviceId = '',
  serviceLabel = '',
  resourceLabel = '',
} = {}) {
  const normalizedStartsAt = normalizeText(startsAt);
  if (!normalizedStartsAt) return null;
  const normalizedStatus = normalizeText(status).toLowerCase();
  if (!normalizedStatus || normalizedStatus === 'cancelled') return null;
  return {
    bookingId: normalizeText(bookingId),
    customerEmail: normalizeEmail(customerEmail),
    startsAt: normalizedStartsAt,
    status: normalizedStatus,
    source: normalizeText(source),
    serviceId: normalizeText(serviceId),
    serviceLabel: normalizeText(serviceLabel),
    resourceLabel: normalizeText(resourceLabel),
  };
}

function clinicPerformanceRowDedupeKey(row = {}) {
  const email = normalizeEmail(row.customerEmail);
  const startsAt = normalizeText(row.startsAt);
  const resource = normalizeText(row.resourceLabel).toLowerCase();
  if (email && startsAt) {
    return `slot:${email}::${startsAt}::${resource}`;
  }
  const bookingId = normalizeText(row.bookingId);
  if (bookingId) return `booking:${bookingId}`;
  return `fallback:${startsAt}::${resource}`;
}

function bookingSourceSupportsNoShow(row = {}) {
  const source = normalizeText(row.source).toLowerCase();
  // cliento is the only source that can currently carry explicit no_show state.
  // Missing source is treated as test/legacy input and remains no-show-capable.
  return !source || source === 'cliento';
}

function collectFromBookingEngineStore({ bookingEngineStore = null, tenantId = '' } = {}) {
  if (!bookingEngineStore || typeof bookingEngineStore.listBookingsForEnrichment !== 'function') {
    return [];
  }
  const rows = [];
  for (const candidate of bookingTenantCandidates(tenantId)) {
    const batch = bookingEngineStore.listBookingsForEnrichment(candidate) || [];
    for (const booking of asArray(batch)) {
      if (normalizeText(booking.status).toLowerCase() !== 'confirmed') continue;
      const slot = booking && booking.slot && typeof booking.slot === 'object' ? booking.slot : {};
      const row = buildClinicPerformanceRow({
        bookingId: booking.bookingId,
        customerEmail: booking.customerEmail,
        startsAt: slot.startsAt,
        status: booking.status,
        source: 'cco_booking_engine',
        serviceId: slot.serviceId,
        serviceLabel: slot.serviceLabel,
        resourceLabel: slot.resourceLabel,
      });
      if (row) rows.push(row);
    }
  }
  return rows;
}

function collectFromTreatmentEncounterStore({
  treatmentEncounterStore = null,
  tenantId = '',
} = {}) {
  if (
    !treatmentEncounterStore ||
    typeof treatmentEncounterStore.listEncountersForEnrichment !== 'function'
  ) {
    return [];
  }
  const allowedStatuses = new Set(['confirmed', 'checked_in', 'in_progress', 'completed']);
  const rows = [];
  for (const candidate of bookingTenantCandidates(tenantId)) {
    const batch = treatmentEncounterStore.listEncountersForEnrichment(candidate) || [];
    for (const encounter of asArray(batch)) {
      const status = normalizeText(encounter.status).toLowerCase();
      if (!allowedStatuses.has(status)) continue;
      const row = buildClinicPerformanceRow({
        bookingId: encounter.bookingId || encounter.encounterId,
        customerEmail: encounter.customerEmail,
        startsAt: encounter.startsAt,
        status,
        source: 'cco_treatment_encounter',
        serviceId: encounter.serviceId,
        serviceLabel: encounter.serviceLabel || encounter.encounterType,
        resourceLabel: encounter.resourceLabel,
      });
      if (row) rows.push(row);
    }
  }
  return rows;
}

function collectFromClientoBookingStore({ clientoBookingStore = null, tenantId = '' } = {}) {
  if (!clientoBookingStore || typeof clientoBookingStore.listAllBookings !== 'function') return [];
  const rows = [];
  for (const candidate of bookingTenantCandidates(tenantId)) {
    const batch = clientoBookingStore.listAllBookings({ tenantId: candidate }) || [];
    for (const booking of asArray(batch)) {
      const row = buildClinicPerformanceRow({
        bookingId: booking.bookingId,
        customerEmail: booking.customerEmail,
        startsAt: booking.startsAt,
        status: booking.status || 'confirmed',
        source: 'cliento',
        serviceLabel: booking.serviceLabel,
        resourceLabel: booking.staffName,
      });
      if (row) rows.push(row);
    }
  }
  return rows;
}

function collectClinicPerformanceBookings({
  clientoBookingStore = null,
  bookingEngineStore = null,
  treatmentEncounterStore = null,
  tenantId = '',
} = {}) {
  const sourceRank = {
    cco_treatment_encounter: 40,
    cco_booking_engine: 30,
    cliento: 10,
  };
  const byKey = new Map();
  const batches = [
    ...collectFromTreatmentEncounterStore({ treatmentEncounterStore, tenantId }),
    ...collectFromBookingEngineStore({ bookingEngineStore, tenantId }),
    ...collectFromClientoBookingStore({ clientoBookingStore, tenantId }),
  ];
  for (const row of batches) {
    const key = clinicPerformanceRowDedupeKey(row);
    const existing = byKey.get(key);
    if (!existing || (sourceRank[row.source] || 0) > (sourceRank[existing.source] || 0)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].map((row) => ({
    bookingId: row.bookingId,
    customerEmail: row.customerEmail,
    startsAt: row.startsAt,
    status: row.status,
    source: row.source,
    serviceLabel: row.serviceLabel,
    resourceLabel: row.resourceLabel,
  }));
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
  const monthStartDate = new Date(monthStart);
  const prevMonthStartDate = new Date(prevMonthStart);
  const currentPeriodEndExclusive = endOfUtcDayExclusive(now);
  const previousComparableEndExclusive = previousMonthSameDayEndExclusive(now);

  // Same-day framing: "hittills i månaden t.o.m. dagens kalenderdag" jämförs
  // med "föregående månad t.o.m. samma kalenderdag". Det undviker att tidig
  // månad ser artificiellt svag ut bara för att vi jämför med en hel månad.
  let bookingsCurrent = 0;
  let bookingsPrevious = 0;
  let noShowCurrent = 0;
  let noShowPrevious = 0;
  let noShowHasLiveCoverageCurrent = true;
  let noShowHasLiveCoveragePrevious = true;
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const t = b && b.startsAt ? Date.parse(b.startsAt) : NaN;
    if (!Number.isFinite(t)) continue;
    if (t >= monthStart && t < currentPeriodEndExclusive) {
      bookingsCurrent += 1;
      if (!bookingSourceSupportsNoShow(b)) noShowHasLiveCoverageCurrent = false;
      if (b.status === 'no_show') noShowCurrent += 1;
      continue;
    }
    if (t >= prevMonthStart && t < previousComparableEndExclusive) {
      bookingsPrevious += 1;
      if (!bookingSourceSupportsNoShow(b)) noShowHasLiveCoveragePrevious = false;
      if (b.status === 'no_show') noShowPrevious += 1;
    }
  }
  const noShowRateCurrent = noShowHasLiveCoverageCurrent
    ? bookingsCurrent > 0
      ? Number((noShowCurrent / bookingsCurrent).toFixed(4))
      : 0
    : null;
  const noShowRatePrevious = noShowHasLiveCoveragePrevious
    ? bookingsPrevious > 0
      ? Number((noShowPrevious / bookingsPrevious).toFixed(4))
      : 0
    : null;

  // Intäkt betald denna månad ur finance-dashboarden (null om ej tillgänglig).
  const revenueCurrent =
    financeDashboard && financeDashboard.invoices
      ? safeNum(financeDashboard.invoices.totalPaidThisMonthSek)
      : null;
  const revenuePrevious =
    financeDashboard && financeDashboard.invoices
      ? safeNum(financeDashboard.invoices.totalPaidPreviousComparablePeriodSek)
      : null;

  // Snittordervärde: proxy = intäkt denna månad ÷ bokningar denna månad.
  // Inte exakt pris per bokning (bokningsdata saknar pris) — null om vi saknar del.
  const avgOrderValueCurrent =
    revenueCurrent !== null && bookingsCurrent > 0
      ? Math.round(revenueCurrent / bookingsCurrent)
      : null;
  const avgOrderValuePrevious =
    revenuePrevious !== null && bookingsPrevious > 0
      ? Math.round(revenuePrevious / bookingsPrevious)
      : null;

  return {
    tenantId: tenantId || null,
    period: periodLabel(monthStartDate),
    previousPeriod: periodLabel(prevMonthStartDate),
    source: 'live',
    bookings: { current: bookingsCurrent, previous: bookingsPrevious },
    revenueSek: { current: revenueCurrent, previous: revenuePrevious },
    noShowRate: { current: noShowRateCurrent, previous: noShowRatePrevious },
    utilizationRate: { current: null, previous: null },
    avgOrderValueSek: { current: avgOrderValueCurrent, previous: avgOrderValuePrevious },
    // channelSplit medvetet utelämnad — ingen ren kanalkälla ännu (v0.2b).
    notLiveYet: [
      'utilizationRate',
      'channelSplit',
      ...(noShowRateCurrent === null || noShowRatePrevious === null ? ['noShowRate'] : []),
      ...(revenuePrevious === null ? ['revenueSek.previous'] : []),
      ...(avgOrderValuePrevious === null ? ['avgOrderValueSek.previous'] : []),
    ],
    dataNote:
      'Live-data från major-arcanas gateway. Jämförelsen är hittills i månaden t.o.m. dagens kalenderdag mot samma kalenderdag i föregående månad.',
    avgOrderValueNote:
      'Proxy: intäkt betald denna månad ÷ bokningar denna månad (bokningsdata saknar pris per bokning).',
  };
}

module.exports = {
  composeClinicMetrics,
  periodLabel,
  bookingTenantCandidates,
  collectClinicPerformanceBookings,
};
