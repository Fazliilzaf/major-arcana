'use strict';

/**
 * P0.4 — Booking/calendar signals for Kunder (engine bookings + cases + encounters).
 */

const path = require('node:path');

const MS_DAY = 24 * 60 * 60 * 1000;

const WAITLIST_STATUSES = new Set(['waiting_customer', 'needs_triage', 'offered', 'slots_ready']);

const TREATMENT_SEGMENT_DEFS = [
  { id: 'treatment_fue', serviceIds: ['fue'], label: 'FUE' },
  { id: 'treatment_dhi', serviceIds: ['dhi'], label: 'DHI' },
  { id: 'treatment_prp', serviceIds: ['prp-hair', 'prp-skin'], label: 'PRP' },
  { id: 'treatment_microneedling', serviceIds: ['microneedling'], label: 'Microneedling' },
  {
    id: 'treatment_consultation',
    serviceIds: ['consultation', 'consultation-online', 'consultation-physical'],
    label: 'Konsultation',
  },
  {
    id: 'treatment_followup',
    serviceIds: ['followup', 'followup-transplant'],
    label: 'Uppföljning',
  },
  {
    id: 'treatment_curatiio',
    serviceIds: ['curatiio', 'bleph'],
    encounterTypes: ['curatiio_estetik', 'bleph'],
    label: 'Curatiio',
  },
];

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
}
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function slotDateKey(startsAt) {
  return normalizeText(startsAt).slice(0, 10);
}

function parseMs(iso) {
  const ms = Date.parse(normalizeText(iso));
  return Number.isFinite(ms) ? ms : null;
}

function isTodayVisit(startsAt) {
  const key = slotDateKey(startsAt);
  return Boolean(key && key === isoToday());
}

function isThisWeekVisit(startsAt) {
  const key = slotDateKey(startsAt);
  if (!key) return false;
  const slotMs = Date.parse(key);
  const todayMs = Date.parse(isoToday());
  if (!Number.isFinite(slotMs) || !Number.isFinite(todayMs)) return false;
  const diff = Math.floor((slotMs - todayMs) / MS_DAY);
  return diff >= 0 && diff < 7;
}

function isFutureVisit(startsAt, nowMs = Date.now()) {
  const ms = parseMs(startsAt);
  return ms != null && ms >= nowMs;
}

function isPastVisit(startsAt, nowMs = Date.now()) {
  const ms = parseMs(startsAt);
  return ms != null && ms < nowMs;
}

function serviceIdToTreatmentLabel(serviceId) {
  const id = normalizeKey(serviceId);
  const map = {
    fue: 'FUE',
    dhi: 'DHI',
    beard: 'Skägg',
    eyebrow: 'Ögonbryn',
    'prp-hair': 'PRP',
    'prp-skin': 'PRP',
    microneedling: 'Microneedling',
    'consultation-online': 'Konsultation',
    'consultation-physical': 'Konsultation',
    consultation: 'Konsultation',
    followup: 'Uppföljning',
    'followup-transplant': 'Uppföljning',
    bleph: 'Curatiio',
    curatiio: 'Curatiio',
  };
  return map[id] || null;
}

function encounterTypeToTreatmentLabel(encounterType) {
  const key = normalizeKey(encounterType);
  const map = {
    consultation: 'Konsultation',
    transplant_fue: 'FUE',
    transplant_dhi: 'DHI',
    prp_hair: 'PRP',
    prp_skin: 'PRP',
    microneedling: 'Microneedling',
    follow_up: 'Uppföljning',
    bleph: 'Curatiio',
    curatiio_estetik: 'Curatiio',
  };
  return map[key] || null;
}

function emptyBookingSignals() {
  return {
    hasUpcomingBooking: false,
    nextBookingAt: null,
    nextBookingType: null,
    nextBookingStatus: null,
    nextBookingResourceLabel: null,
    lastBookingAt: null,
    lastVisitAt: null,
    lastEncounterAt: null,
    treatmentTypes: [],
    treatmentServiceIds: [],
    bookingCaseId: null,
    bookingCaseStatus: null,
    encounterId: null,
    waitingListStatus: null,
    onWaitlist: false,
    todayVisit: false,
    thisWeekVisit: false,
    missingEncounterForBooking: false,
    readyForVisit: null,
    readyForTreatment: null,
    conversationId: null,
    engineBookingId: null,
  };
}

function buildEmailToPatientMap(patients = []) {
  const map = new Map();
  for (const patient of asArray(patients)) {
    const patientId = normalizeText(patient.id);
    if (!patientId) continue;
    const emails = new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeKey).filter(Boolean)
    );
    for (const email of emails) {
      if (!map.has(email)) map.set(email, patientId);
    }
  }
  return map;
}

function getOrCreate(index, patientId) {
  const id = normalizeText(patientId);
  if (!id) return null;
  if (!index.has(id)) index.set(id, emptyBookingSignals());
  return index.get(id);
}

function mergeTreatment(sig, serviceId, encounterType) {
  const sid = normalizeKey(serviceId);
  if (sid && !sig.treatmentServiceIds.includes(sid)) {
    sig.treatmentServiceIds.push(sid);
  }
  const label =
    serviceIdToTreatmentLabel(serviceId) || encounterTypeToTreatmentLabel(encounterType);
  if (label && !sig.treatmentTypes.includes(label)) {
    sig.treatmentTypes.push(label);
  }
}

function applyVisitSlot(sig, slot, bookingStatus, extra = {}) {
  const startsAt = normalizeText(slot?.startsAt);
  if (!startsAt) return;
  const now = Date.now();
  const serviceId = normalizeText(slot?.serviceId);
  mergeTreatment(sig, serviceId, extra.encounterType);

  if (isTodayVisit(startsAt)) sig.todayVisit = true;
  if (isThisWeekVisit(startsAt)) sig.thisWeekVisit = true;

  if (isFutureVisit(startsAt, now) && normalizeKey(bookingStatus) === 'confirmed') {
    sig.hasUpcomingBooking = true;
    const cur = parseMs(sig.nextBookingAt);
    const next = parseMs(startsAt);
    if (!cur || (next != null && next < cur)) {
      sig.nextBookingAt = startsAt;
      sig.nextBookingType =
        serviceIdToTreatmentLabel(serviceId) || normalizeText(slot?.serviceLabel);
      sig.nextBookingStatus = bookingStatus || 'confirmed';
      sig.nextBookingResourceLabel = normalizeText(slot?.resourceLabel) || null;
      sig.engineBookingId = extra.bookingId || sig.engineBookingId;
      sig.conversationId = extra.conversationId || sig.conversationId;
    }
  }

  if (isPastVisit(startsAt, now)) {
    const cur = parseMs(sig.lastVisitAt);
    const visit = parseMs(startsAt);
    if (!cur || (visit != null && visit > cur)) {
      sig.lastVisitAt = startsAt;
      sig.lastBookingAt = startsAt;
    }
  }
}

function buildBookingSignalsIndex({
  patients = [],
  engineBookings = [],
  bookingCases = [],
  encounters = [],
} = {}) {
  const index = new Map();
  const emailToPatient = buildEmailToPatientMap(patients);
  const conversationToPatient = new Map();

  for (const patient of asArray(patients)) {
    getOrCreate(index, patient.id);
  }

  for (const enc of asArray(encounters)) {
    const patientId = normalizeText(enc.patientId);
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    const startsAt = normalizeText(enc.startsAt);
    if (startsAt) {
      const cur = parseMs(sig.lastEncounterAt);
      const next = parseMs(startsAt);
      if (!cur || (next != null && next > cur)) {
        sig.lastEncounterAt = startsAt;
      }
      if (isPastVisit(startsAt)) {
        const lv = parseMs(sig.lastVisitAt);
        if (!lv || next > lv) sig.lastVisitAt = startsAt;
      }
      if (isFutureVisit(startsAt)) {
        sig.hasUpcomingBooking = true;
        const nb = parseMs(sig.nextBookingAt);
        if (!nb || (next != null && next < nb)) {
          sig.nextBookingAt = startsAt;
          sig.nextBookingType =
            encounterTypeToTreatmentLabel(enc.encounterType) ||
            serviceIdToTreatmentLabel(enc.serviceId);
          sig.nextBookingStatus = normalizeText(enc.status) || 'reserved';
          sig.nextBookingResourceLabel = normalizeText(enc.resourceLabel) || null;
        }
      }
      if (isTodayVisit(startsAt)) sig.todayVisit = true;
      if (isThisWeekVisit(startsAt)) sig.thisWeekVisit = true;
    }
    sig.encounterId = normalizeText(enc.encounterId) || sig.encounterId;
    mergeTreatment(sig, enc.serviceId, enc.encounterType);
    const conv = normalizeText(enc.conversationId);
    if (conv) conversationToPatient.set(conv, patientId);
  }

  for (const booking of asArray(engineBookings)) {
    const email = normalizeKey(booking.customerEmail);
    const patientId = emailToPatient.get(email);
    if (!patientId) continue;
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    const status = normalizeKey(booking.status);
    const slot = asObject(booking.slot);
    const conv = normalizeText(booking.conversationId);
    if (conv) conversationToPatient.set(conv, patientId);
    if (status === 'confirmed') {
      applyVisitSlot(sig, slot, 'confirmed', {
        bookingId: booking.bookingId,
        conversationId: conv,
      });
    }
  }

  for (const bookingCase of asArray(bookingCases)) {
    const email = normalizeKey(bookingCase.customerEmail);
    const patientId = emailToPatient.get(email);
    if (!patientId) continue;
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    const status = normalizeKey(bookingCase.status);
    const conv = normalizeText(bookingCase.conversationId);
    if (conv) conversationToPatient.set(conv, patientId);

    if (!sig.bookingCaseId) {
      sig.bookingCaseId = normalizeText(bookingCase.bookingCaseId) || null;
      sig.bookingCaseStatus = status || null;
    }

    if (WAITLIST_STATUSES.has(status)) {
      sig.onWaitlist = true;
      sig.waitingListStatus = status;
    }

    for (const slot of asArray(bookingCase.selectedSlots)) {
      applyVisitSlot(sig, slot, status === 'confirmed_external' ? 'confirmed' : status, {
        conversationId: conv,
      });
    }
  }

  for (const [, sig] of index) {
    if (sig.hasUpcomingBooking && !sig.encounterId) {
      sig.missingEncounterForBooking = true;
    } else {
      sig.missingEncounterForBooking = false;
    }
    sig.readyForVisit = null;
    sig.readyForTreatment = null;
  }

  return { index, emailToPatient, conversationToPatient };
}

function getBookingSignals(index, patientId) {
  if (!index) return emptyBookingSignals();
  return index.get(normalizeText(patientId)) || emptyBookingSignals();
}

function patientMatchesTreatmentSegment(signals, segmentId) {
  const def = TREATMENT_SEGMENT_DEFS.find((item) => item.id === segmentId);
  if (!def) return false;
  const serviceHit = def.serviceIds.some((sid) =>
    asArray(signals.treatmentServiceIds).includes(normalizeKey(sid))
  );
  if (serviceHit) return true;
  if (def.encounterTypes?.length) {
    return def.label === 'Curatiio' && signals.treatmentTypes.includes('Curatiio');
  }
  return false;
}

function applyBookingToReadout(readout, bookingSignals) {
  const sig = bookingSignals || emptyBookingSignals();
  readout.hasUpcomingBooking = sig.hasUpcomingBooking;
  readout.nextBookingAt = sig.nextBookingAt;
  readout.nextBookingType = sig.nextBookingType;
  readout.nextBookingStatus = sig.nextBookingStatus;
  readout.nextBookingResourceLabel = sig.nextBookingResourceLabel;
  readout.lastBookingAt = sig.lastBookingAt;
  readout.lastVisitAt = sig.lastVisitAt || readout.lastVisitAt;
  readout.lastEncounterAt = sig.lastEncounterAt;
  readout.treatmentTypes = [
    ...new Set([...asArray(readout.treatmentTypes), ...sig.treatmentTypes]),
  ];
  readout.bookingCaseId = sig.bookingCaseId;
  readout.bookingCaseStatus = sig.bookingCaseStatus;
  readout.encounterId = sig.encounterId;
  readout.waitingListStatus = sig.waitingListStatus;
  readout.todayVisit = sig.todayVisit;
  readout.thisWeekVisit = sig.thisWeekVisit;
  readout.missingEncounterForBooking = sig.missingEncounterForBooking;
  readout.readyForVisit = sig.readyForVisit;
  readout.readyForTreatment = sig.readyForTreatment ?? sig.readyForVisit;
  if (sig.onWaitlist)
    readout.reviewFlags = [...new Set([...asArray(readout.reviewFlags), 'waitlist'])];
  if (sig.missingEncounterForBooking) {
    readout.reviewFlags = [...new Set([...asArray(readout.reviewFlags), 'missing_encounter'])];
  }
  if (sig.hasUpcomingBooking && !readout.missingForm && readout.hasJournal) {
    readout.readyForVisit = true;
    readout.readyForTreatment = true;
  } else if (sig.hasUpcomingBooking) {
    readout.readyForVisit = readout.missingForm ? false : null;
    readout.readyForTreatment = readout.readyForVisit;
  }
  return readout;
}

let bookingStoresPromise = null;

async function loadKunderBookingIndex(config, tenantId, patients = []) {
  const empty = {
    index: new Map(),
    coverage: 'missing',
    sources: {},
    engineBookings: [],
    bookingCases: [],
    encounters: [],
  };
  try {
    if (!bookingStoresPromise) {
      bookingStoresPromise = (async () => {
        const { createCcoBookingEngineStore } = require('./ccoBookingEngineStore');
        const { createCcoBookingStore } = require('./ccoBookingStore');
        const { createCcoTreatmentEncounterStore } = require('./ccoTreatmentEncounterStore');
        const enginePath =
          config?.ccoBookingEngineStorePath ||
          path.join(process.cwd(), 'data', 'cco-booking-engine.json');
        const casesPath =
          config?.ccoBookingStorePath || path.join(process.cwd(), 'data', 'cco-bookings.json');
        const encPath =
          config?.ccoTreatmentEncounterStorePath ||
          path.join(process.cwd(), 'data', 'cco-treatment-encounters.json');
        const [engineStore, caseStore, encounterStore] = await Promise.all([
          createCcoBookingEngineStore({ filePath: enginePath }),
          createCcoBookingStore({ filePath: casesPath }),
          createCcoTreatmentEncounterStore({ filePath: encPath }),
        ]);
        return { engineStore, caseStore, encounterStore };
      })();
    }
    const stores = await bookingStoresPromise;
    const tid = normalizeText(tenantId);

    const engineBookings =
      typeof stores.engineStore.listBookingsForEnrichment === 'function'
        ? stores.engineStore.listBookingsForEnrichment(tid)
        : [];
    const bookingCases =
      typeof stores.caseStore.listCasesForEnrichment === 'function'
        ? await stores.caseStore.listCasesForEnrichment({ tenantId: tid, limit: 5000 })
        : await stores.caseStore.listCases({ tenantId: tid, limit: 5000 });
    const encounters =
      typeof stores.encounterStore.listEncountersForEnrichment === 'function'
        ? stores.encounterStore.listEncountersForEnrichment(tid)
        : [];

    const built = buildBookingSignalsIndex({
      patients,
      engineBookings,
      bookingCases,
      encounters,
    });

    const hasAny = engineBookings.length > 0 || bookingCases.length > 0 || encounters.length > 0;
    const coverage = hasAny ? 'real' : 'partial';

    return {
      index: built.index,
      coverage,
      sources: {
        engineBookings: engineBookings.length,
        bookingCases: bookingCases.length,
        encounters: encounters.length,
      },
      engineBookings,
      bookingCases,
      encounters,
    };
  } catch {
    return empty;
  }
}

function isBookingWithinDays(startsAt, days, nowMs = Date.now()) {
  const ms = parseMs(startsAt);
  if (ms == null) return false;
  const end = nowMs + Math.max(0, Number(days) || 0) * MS_DAY;
  return ms >= nowMs && ms <= end;
}

/**
 * Count past visits in the last 4 calendar weeks; compare recent 2 vs prior 2.
 */
function computeVisitTrendFromBundle({
  engineBookings = [],
  bookingCases = [],
  encounters = [],
} = {}) {
  const now = Date.now();
  const buckets = [0, 0, 0, 0];

  const addPastVisit = (startsAt) => {
    const ms = parseMs(startsAt);
    if (ms == null || ms > now) return;
    const ageDays = Math.floor((now - ms) / MS_DAY);
    const weekIndex = Math.floor(ageDays / 7);
    if (weekIndex < 0 || weekIndex > 3) return;
    buckets[3 - weekIndex] += 1;
  };

  for (const booking of asArray(engineBookings)) {
    if (normalizeKey(booking.status) !== 'confirmed') continue;
    addPastVisit(asObject(booking.slot).startsAt);
  }
  for (const bookingCase of asArray(bookingCases)) {
    for (const slot of asArray(bookingCase.selectedSlots)) {
      addPastVisit(asObject(slot).startsAt);
    }
  }
  for (const enc of asArray(encounters)) {
    addPastVisit(enc.startsAt);
  }

  const priorAvg = (buckets[0] + buckets[1]) / 2;
  const recentAvg = (buckets[2] + buckets[3]) / 2;
  let pctChange = 0;
  if (priorAvg > 0) {
    pctChange = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
  } else if (recentAvg > 0) {
    pctChange = 100;
  }

  return {
    buckets,
    priorAvg,
    recentAvg,
    pctChange,
    direction: pctChange > 0 ? 'up' : pctChange < 0 ? 'down' : 'flat',
  };
}

module.exports = {
  TREATMENT_SEGMENT_DEFS,
  buildBookingSignalsIndex,
  getBookingSignals,
  applyBookingToReadout,
  loadKunderBookingIndex,
  patientMatchesTreatmentSegment,
  emptyBookingSignals,
  isTodayVisit,
  isThisWeekVisit,
  isBookingWithinDays,
  computeVisitTrendFromBundle,
};
