'use strict';

/**
 * Clinic Performance composition (read-only, pure).
 *
 * Builds the ClinicMetrics shape that the CEO app (arcana-ceo-agent) already
 * consumes, from data that exists in major-arcana today. Deterministic, no I/O
 * — the route wires the real stores; this module just shapes the numbers so it
 * is unit-testable.
 *
 * HONEST PARTIAL LIVE (v0.2b step 2 / ORD-58 fas 1): bookings + no-show + intäkt +
 * snittordervärde bär ärlig same-day-jämförelse mot föregående månad. Intäkt kommer
 * från Fortnox InvoicePayments när anslutet, annars commercial-store-proxy (null om
 * saknas). utilizationRate och channelSplit har fortfarande ingen ren källa.
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
  customerPhone = '',
  clientoCustomerId = '',
  patientId = '',
  startsAt = '',
  status = '',
  source = '',
  serviceId = '',
  serviceLabel = '',
  resourceLabel = '',
  priceSek = null,
  notes = '',
  bookingNotes = '',
  internalNotes = '',
  treatmentNotes = '',
  customerMessage = '',
  bookingKind = '',
} = {}) {
  const normalizedStartsAt = normalizeText(startsAt);
  if (!normalizedStartsAt) return null;
  const normalizedStatus = normalizeText(status).toLowerCase();
  if (!normalizedStatus || normalizedStatus === 'cancelled') return null;
  const kind =
    normalizeText(bookingKind) ||
    classifyBookingKind({
      priceSek,
      serviceLabel,
      notes,
      bookingNotes,
      internalNotes,
      treatmentNotes,
      customerMessage,
    });
  return {
    bookingId: normalizeText(bookingId),
    customerEmail: normalizeEmail(customerEmail),
    // Matchningsfält för ORD-77 — används bara internt; exponeras aldrig i ClinicMetrics.
    customerPhone: normalizeText(customerPhone),
    clientoCustomerId: normalizeText(clientoCustomerId),
    patientId: normalizeText(patientId),
    startsAt: normalizedStartsAt,
    status: normalizedStatus,
    source: normalizeText(source),
    serviceId: normalizeText(serviceId),
    serviceLabel: normalizeText(serviceLabel),
    resourceLabel: normalizeText(resourceLabel),
    // bookingKind only — never notes/price toward CEO payload aggregates.
    bookingKind: kind,
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
  return !source || source === 'cliento' || source === 'cliento_csv';
}

/**
 * ORD-76: klassificera bokning som paying / included_in_package / consultation / unknown.
 * Pris är primär markör; tjänstenamn sekundär; anteckningar tertiär (endast internt).
 * Anteckningstext får ALDRIG lämna gatewayn — bara denna klass + aggregat.
 */
const PACKAGE_SERVICE_RE =
  /efter\s*tp|uppf[oö]ljning|op[-\s]?dagen|underh[aå]ll\s*efter|prp\s*efter\s*tp|ing[aå]r\s*i\s*(tp[-\s]?)?paket|efterv[aå]rd/i;
const CONSULTATION_SERVICE_RE = /konsultation|consultation|\bkonsult\b/i;
const PACKAGE_NOTE_RE =
  /ing[aå]r\s*i\s*(tp[-\s]?)?paketet|ing[aå]r\s*i\s*fastpriset|kompletterande\s+behandling\s+utan\s+kostnad|utan\s+kostnad|ing[aå]r\s*i\s*tp/i;

function classifyBookingKind(booking = {}) {
  const price =
    typeof booking.priceSek === 'number' && Number.isFinite(booking.priceSek)
      ? booking.priceSek
      : null;
  if (price !== null && price > 0) return 'paying';

  const label = normalizeText(booking.serviceLabel || booking.service);
  if (CONSULTATION_SERVICE_RE.test(label)) return 'consultation';
  if (PACKAGE_SERVICE_RE.test(label)) return 'included_in_package';

  const notesBlob = [
    booking.notes,
    booking.bookingNotes,
    booking.internalNotes,
    booking.treatmentNotes,
    booking.customerMessage,
  ]
    .map((v) => normalizeText(v))
    .filter(Boolean)
    .join('\n');
  if (notesBlob && PACKAGE_NOTE_RE.test(notesBlob)) return 'included_in_package';

  return 'unknown';
}

function emptyBookingsSplit() {
  return { paying: 0, includedInPackage: 0, consultations: 0, unknown: 0 };
}

function bumpBookingsSplit(split, kind) {
  if (kind === 'paying') split.paying += 1;
  else if (kind === 'included_in_package') split.includedInPackage += 1;
  else if (kind === 'consultation') split.consultations += 1;
  else split.unknown += 1;
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
        customerPhone: booking.customerPhone || booking.phone,
        clientoCustomerId: booking.clientoCustomerId || booking.customerId,
        patientId: booking.patientId,
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
        customerPhone: encounter.customerPhone || encounter.phone,
        clientoCustomerId: encounter.clientoCustomerId || encounter.customerId,
        patientId: encounter.patientId,
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
        customerPhone: booking.customerPhone || booking.phone,
        clientoCustomerId: booking.clientoCustomerId || booking.customerId,
        patientId: booking.patientId,
        startsAt: booking.startsAt,
        status: booking.status || 'confirmed',
        source: 'cliento',
        serviceLabel: booking.serviceLabel,
        resourceLabel: booking.staffName,
        priceSek: booking.priceSek,
        notes: booking.notes,
        bookingNotes: booking.bookingNotes,
        internalNotes: booking.internalNotes,
        treatmentNotes: booking.treatmentNotes,
        customerMessage: booking.customerMessage,
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
    customerPhone: row.customerPhone,
    clientoCustomerId: row.clientoCustomerId,
    patientId: row.patientId,
    startsAt: row.startsAt,
    status: row.status,
    source: row.source,
    serviceLabel: row.serviceLabel,
    resourceLabel: row.resourceLabel,
    bookingKind: row.bookingKind || 'unknown',
  }));
}

/**
 * @param {object} args
 * @param {Array} [args.bookings]              raw bookings (need `startsAt` + `status`)
 * @param {object|null} [args.financeDashboard] buildFinanceDashboard() output, or null
 * @param {Date} [args.now]                    reference time for the current-month window
 * @param {string|null} [args.tenantId]
 * @param {object|null} [args.conversionFunnel] ORD-77 aggregat (ingen PII)
 * @returns {object} ClinicMetrics (source: "live")
 */
function composeClinicMetrics({
  bookings = [],
  financeDashboard = null,
  now = new Date(),
  tenantId = null,
  conversionFunnel = null,
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
  //
  // ORD-75: no-show räknas ENBART på no-show-kapabla bokningar (Cliento / saknad
  // source). Blandade källor nullar inte längre hela raten — täckningsgraden
  // exponeras öppet i noShowCoverage + dataNote i stället.
  let bookingsCurrent = 0;
  let bookingsPrevious = 0;
  let noShowCapableCurrent = 0;
  let noShowCapablePrevious = 0;
  let noShowCurrent = 0;
  let noShowPrevious = 0;
  const bookingsSplitCurrent = emptyBookingsSplit();
  const bookingsSplitPrevious = emptyBookingsSplit();
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const t = b && b.startsAt ? Date.parse(b.startsAt) : NaN;
    if (!Number.isFinite(t)) continue;
    const kind = b.bookingKind || classifyBookingKind(b);
    if (t >= monthStart && t < currentPeriodEndExclusive) {
      bookingsCurrent += 1;
      bumpBookingsSplit(bookingsSplitCurrent, kind);
      if (bookingSourceSupportsNoShow(b)) {
        noShowCapableCurrent += 1;
        if (b.status === 'no_show') noShowCurrent += 1;
      }
      continue;
    }
    if (t >= prevMonthStart && t < previousComparableEndExclusive) {
      bookingsPrevious += 1;
      bumpBookingsSplit(bookingsSplitPrevious, kind);
      if (bookingSourceSupportsNoShow(b)) {
        noShowCapablePrevious += 1;
        if (b.status === 'no_show') noShowPrevious += 1;
      }
    }
  }
  const noShowRateCurrent =
    noShowCapableCurrent > 0 ? Number((noShowCurrent / noShowCapableCurrent).toFixed(4)) : null;
  const noShowRatePrevious =
    noShowCapablePrevious > 0 ? Number((noShowPrevious / noShowCapablePrevious).toFixed(4)) : null;
  const noShowCoverage = {
    current: { capable: noShowCapableCurrent, total: bookingsCurrent },
    previous: { capable: noShowCapablePrevious, total: bookingsPrevious },
  };

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

  const baseDataNote =
    'Live-data från major-arcanas gateway. Jämförelsen är hittills i månaden t.o.m. dagens kalenderdag mot samma kalenderdag i föregående månad. Intäkt/AOV: Fortnox betalda fakturor när anslutet, annars commercial-store-proxy.';
  const noShowCoverageNote = describeNoShowCoverage(noShowCoverage.current);
  const bookingsSplitNote = describeBookingsSplit(bookingsSplitCurrent, bookingsCurrent);
  const funnelNote =
    conversionFunnel && typeof conversionFunnel.dataNote === 'string'
      ? conversionFunnel.dataNote
      : null;
  const extraNotes = [noShowCoverageNote, bookingsSplitNote, funnelNote].filter(Boolean).join(' ');
  const funnelPayload =
    conversionFunnel && typeof conversionFunnel === 'object'
      ? {
          stoppedAtOfferDays: conversionFunnel.stoppedAtOfferDays,
          rollingDays: conversionFunnel.rollingDays,
          period: conversionFunnel.period,
          rolling90d: conversionFunnel.rolling90d,
          ...(funnelNote ? { dataNote: funnelNote } : {}),
        }
      : null;

  return {
    tenantId: tenantId || null,
    period: periodLabel(monthStartDate),
    previousPeriod: periodLabel(prevMonthStartDate),
    source: 'live',
    bookings: { current: bookingsCurrent, previous: bookingsPrevious },
    bookingsSplit: {
      current: bookingsSplitCurrent,
      previous: bookingsSplitPrevious,
    },
    revenueSek: { current: revenueCurrent, previous: revenuePrevious },
    noShowRate: { current: noShowRateCurrent, previous: noShowRatePrevious },
    noShowCoverage,
    utilizationRate: { current: null, previous: null },
    avgOrderValueSek: { current: avgOrderValueCurrent, previous: avgOrderValuePrevious },
    ...(funnelPayload ? { conversionFunnel: funnelPayload } : {}),
    // channelSplit medvetet utelämnad — ingen ren kanalkälla ännu (v0.2b).
    notLiveYet: [
      'utilizationRate',
      'channelSplit',
      ...(noShowRateCurrent === null || noShowRatePrevious === null ? ['noShowRate'] : []),
      ...(revenuePrevious === null ? ['revenueSek.previous'] : []),
      ...(avgOrderValuePrevious === null ? ['avgOrderValueSek.previous'] : []),
      ...(!funnelPayload ? ['conversionFunnel'] : []),
    ],
    dataNote: extraNotes ? `${baseDataNote} ${extraNotes}` : baseDataNote,
    avgOrderValueNote:
      'Proxy: intäkt betald i perioden ÷ bokningar i samma period (bokningsdata saknar pris per bokning).',
  };
}

/** Mänsklig täckningsnot — alltid synlig när < 100 % av periodens bokningar ingår. */
function describeNoShowCoverage({ capable = 0, total = 0 } = {}) {
  if (!total || total < 1) return null;
  if (capable >= total) return null;
  if (capable < 1) {
    return 'No-show saknas: perioden har inga Cliento-bokningar med no-show-stöd.';
  }
  const pct = Math.round((capable / total) * 100);
  return `No-show räknas på Cliento-bokningarna (${pct} % av perioden).`;
}

/** ORD-76: synlig split när unknown eller paketandel är relevant — alltid om unknown > 0. */
function describeBookingsSplit(split = emptyBookingsSplit(), total = 0) {
  if (!total || total < 1) return null;
  const parts = [];
  if (split.paying) parts.push(`${split.paying} betalande`);
  if (split.includedInPackage) parts.push(`${split.includedInPackage} ingår i TP-paket`);
  if (split.consultations) parts.push(`${split.consultations} konsultationer`);
  if (split.unknown) parts.push(`${split.unknown} oklassade`);
  if (!parts.length) return null;
  // Visa alltid när unknown > 0 eller när det finns mer än en klass (annars trivialt).
  const distinct =
    Number(split.paying > 0) +
    Number(split.includedInPackage > 0) +
    Number(split.consultations > 0) +
    Number(split.unknown > 0);
  if (split.unknown < 1 && distinct < 2) return null;
  return `Bokningsmix: ${parts.join(' · ')}.`;
}

module.exports = {
  composeClinicMetrics,
  periodLabel,
  bookingTenantCandidates,
  collectClinicPerformanceBookings,
  bookingSourceSupportsNoShow,
  describeNoShowCoverage,
  classifyBookingKind,
  describeBookingsSplit,
};
