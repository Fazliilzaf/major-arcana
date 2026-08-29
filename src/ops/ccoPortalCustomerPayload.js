'use strict';

/**
 * ccoPortalCustomerPayload — bygger den kundvända nivå-2-payloaden ur ett
 * commercialCase. READ-ONLY. Samma `offerPlan`-källa som PDF/signeringssida
 * (se docs/customer-portal-offer-flow-k1-k2-2026-07-01.md) → ingen andra sanning.
 *
 * Utöver offerten ingår en journal-REFERENS (antal/senaste/typer — INTE kliniskt
 * innehåll eller personnummer) och en kundvänd bokningsvy (bara säkra fält). Allt
 * bakom nivå-2 (BankID). Payloaden är rå data; portalen escape:ar vid rendering.
 */

const { getCoolingOffMeta, canAcceptOffer } = require('./ccoOfferEsign');
const { getDocumentTypeById } = require('./ccoDocumentTypeRegistry');

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Härled kundens offert-/signeringsstatus ur quoteStatus + betänketid.
 *   missing/draft  → 'preparing'    (offert ej redo)
 *   sent + cooling → 'cooling_off'
 *   sent + klar    → 'ready_to_sign'
 *   accepted       → 'accepted'     (offert accepterad — INTE avtalet signerat)
 */
function deriveSigningStatus(commercialCase, nowMs) {
  const quoteStatus = text(commercialCase.quoteStatus);
  const cooling = getCoolingOffMeta(commercialCase, nowMs);
  if (quoteStatus === 'accepted') {
    return { status: 'accepted', canAccept: false, coolingOff: cooling };
  }
  if (quoteStatus !== 'sent') {
    return { status: 'preparing', canAccept: false, coolingOff: cooling };
  }
  const accept = canAcceptOffer(commercialCase, { nowMs });
  return {
    status: cooling.active ? 'cooling_off' : 'ready_to_sign',
    canAccept: accept.allowed === true,
    coolingOff: cooling,
  };
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function laterIso(a, b) {
  const ma = Date.parse(text(a));
  const mb = Date.parse(text(b));
  if (!Number.isFinite(ma)) return text(b) || null;
  if (!Number.isFinite(mb)) return text(a) || null;
  return ma >= mb ? a : b;
}

/**
 * Journal-REFERENS (inte innehåll). Antal, senaste datum och distinkta typer —
 * INGET kliniskt innehåll, INGET personnummer. Full journal visas inte här;
 * det kräver ett separat medicinskt/juridiskt beslut (patientdatalagen).
 */
function buildJournalReference(entries) {
  const rows = asArray(entries);
  const types = new Set();
  let signedCount = 0;
  let latestAt = null;
  for (const e of rows) {
    const t = text(e && e.journalType);
    if (t) types.add(t);
    if (text(e && e.status) === 'signed' || (e && e.locked === true)) signedCount += 1;
    latestAt = laterIso(latestAt, (e && (e.signedAt || e.updatedAt || e.createdAt)) || '');
  }
  return {
    count: rows.length,
    signedCount,
    latestAt: latestAt || null,
    types: [...types],
  };
}

/** Kundvänd bokningsvy — bara säkra fält, inga interna anteckningar/tilldelningar. */
function buildBookingsView(cases, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const projected = asArray(cases)
    .map((c) => {
      const o = asObject(c);
      if (!o) return null;
      return {
        bookingId: text(o.bookingId) || text(o.id) || null,
        startsAt: text(o.startsAt) || null,
        endsAt: text(o.endsAt) || null,
        serviceLabel: text(o.serviceLabel) || null,
        encounterType: text(o.encounterType) || null,
        state: text(o.state) || null,
      };
    })
    .filter(Boolean);

  const withStart = projected.filter((b) => Number.isFinite(Date.parse(b.startsAt)));
  const upcoming = withStart
    .filter((b) => Date.parse(b.startsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const pastCount = withStart.length - upcoming.length;
  return { upcoming, upcomingCount: upcoming.length, pastCount };
}

function documentStatus(status) {
  const value = text(status).toLowerCase();
  if (value === 'signed' || value === 'delivered') return 'signerat';
  if (value === 'filled') return 'inskickat';
  return 'väntar';
}

function documentDate(row) {
  return (
    text(row && row.signedAt) ||
    text(row && row.deliveredAt) ||
    text(row && row.filledAt) ||
    text(row && row.sentAt) ||
    text(row && row.updatedAt) ||
    text(row && row.createdAt) ||
    null
  );
}

/**
 * Kundportalens dokumentlista är avsiktligt metadata-only. Dokumentinstansens
 * payload kan innehålla känsliga svar och skickas därför aldrig till klienten.
 */
function buildLevelTwoDocuments({ documentInstances, commercialCase, meridiqOriginals } = {}) {
  const rows = [];

  for (const instance of asArray(documentInstances)) {
    const row = asObject(instance);
    if (!row) continue;
    const type = getDocumentTypeById(text(row.documentTypeId));
    const instanceId = text(row.instanceId);
    rows.push({
      typ: text(type && type.category) || 'dokument',
      titel: text(type && type.name) || 'Dokument',
      status: documentStatus(row.status),
      datum: documentDate(row),
      källa: 'CCO',
      openUrl: instanceId
        ? `/api/v1/cco-portal/documents/instance/${encodeURIComponent(instanceId)}`
        : null,
    });
  }

  const commercial = asObject(commercialCase);
  const quoteStatus = text(commercial && commercial.quoteStatus).toLowerCase();
  const offerDocumentId = text(commercial && commercial.offerDocumentId);
  // ORD-146: offert-accept är INTE ett signerat avtal. Visa dokumentet som just
  // det — en accepterad offert — inte "Signerat avtal".
  if (offerDocumentId && (quoteStatus === 'accepted' || text(commercial.esignStatus) === 'accepted')) {
    rows.push({
      typ: 'offert',
      titel: 'Accepterad offert',
      status: 'accepterad',
      datum: text(commercial.quoteAcceptedAt) || text(commercial.updatedAt) || null,
      källa: 'CCO',
      openUrl: '/api/v1/cco-portal/documents/offer',
    });
  }

  // Meridiq-original är bara känd metadata i den här nivån. Ingen extern URL
  // eller API-hämtning får exponeras från kundportalen.
  for (const original of asArray(meridiqOriginals)) {
    const row = asObject(original);
    if (!row) continue;
    rows.push({
      typ: text(row.typ) || 'journaloriginal',
      titel: text(row.titel) || 'Journaloriginal',
      status: documentStatus(row.status || 'filled'),
      datum: documentDate(row),
      källa: 'Meridiq',
      openUrl: null,
    });
  }

  return rows.sort((a, b) => Date.parse(b.datum || '') - Date.parse(a.datum || ''));
}

/**
 * @param {object} ref
 * @param {string} ref.patientId
 * @param {string} [ref.displayName]
 * @param {object} [ref.commercialCase]
 * @param {Array}  [ref.journalEntries]  journalStore.listEntries(...)
 * @param {Array}  [ref.bookingCases]    bookingStore.listCasesForCustomer(...)
 * @param {Array}  [ref.documentInstances] documentInstanceStore.listForPatient(...)
 * @param {Array}  [ref.meridiqOriginals] metadata only; never fetched from Meridiq
 * @param {number} [ref.nowMs]
 */
function buildLevelTwoPayload(ref = {}) {
  const patientId = text(ref.patientId);
  const nowMs = Number.isFinite(ref.nowMs) ? ref.nowMs : Date.now();
  const commercialCase = asObject(ref.commercialCase);
  const journal = buildJournalReference(ref.journalEntries);
  const bookings = buildBookingsView(ref.bookingCases, nowMs);
  const documents = buildLevelTwoDocuments({
    documentInstances: ref.documentInstances,
    commercialCase,
    meridiqOriginals: ref.meridiqOriginals,
  });

  if (!commercialCase) {
    return {
      patientId,
      displayName: text(ref.displayName) || null,
      hasOffer: false,
      offerPlan: null,
      quoteStatus: 'missing',
      signing: { status: 'preparing', canAccept: false, coolingOff: getCoolingOffMeta({}, nowMs) },
      updatedAt: null,
      journal,
      bookings,
      documents,
    };
  }

  const offerPlan = asObject(commercialCase.offerPlan);
  return {
    patientId,
    displayName: text(ref.displayName) || text(commercialCase.customerName) || null,
    hasOffer: Boolean(offerPlan),
    offerPlan: offerPlan || null,
    quoteStatus: text(commercialCase.quoteStatus) || 'missing',
    signing: deriveSigningStatus(commercialCase, nowMs),
    updatedAt: text(commercialCase.updatedAt) || null,
    journal,
    bookings,
    documents,
  };
}

module.exports = {
  buildLevelTwoPayload,
  deriveSigningStatus,
  buildJournalReference,
  buildBookingsView,
  buildLevelTwoDocuments,
};
