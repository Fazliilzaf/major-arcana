'use strict';

/**
 * P0.4 — Booking/calendar signals for Kunder (engine bookings + cases + encounters).
 */

const path = require('node:path');
const { maxIsoDate } = require('./pipedriveDealHelpers');

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
    lastVisitType: null,
    lastVisitResourceLabel: null,
    lastActivityAt: null,
    lastEncounterAt: null,
    noShowCount: 0,
    completedVisitCount: 0,
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
    upcomingBookings: [],
    historyBookings: [],
  };
}

function normalizeEmail(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function phoneMatchKey(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  if (digits.length < 6) return '';
  return digits.slice(-10);
}

function buildPatientLookupMaps(patients = []) {
  const emailToPatient = new Map();
  const clientoIdToPatient = new Map();
  const phoneToPatient = new Map();
  for (const patient of asArray(patients)) {
    const patientId = normalizeText(patient.id);
    if (!patientId) continue;
    const emails = new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
    );
    for (const email of emails) {
      if (!emailToPatient.has(email)) emailToPatient.set(email, patientId);
    }
    const clientoId = normalizeText(asObject(patient.cliento).sourceId);
    if (clientoId && !clientoIdToPatient.has(clientoId)) {
      clientoIdToPatient.set(clientoId, patientId);
    }
    const phones = new Set(
      [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
    );
    for (const phone of phones) {
      if (!phoneToPatient.has(phone)) phoneToPatient.set(phone, patientId);
    }
  }
  return { emailToPatient, clientoIdToPatient, phoneToPatient };
}

function buildEmailToPatientMap(patients = []) {
  return buildPatientLookupMaps(patients).emailToPatient;
}

function resolvePatientIdFromClientoBooking(clientoBooking, lookup) {
  const email = normalizeEmail(clientoBooking.customerEmail);
  if (email && lookup.emailToPatient.has(email)) {
    return lookup.emailToPatient.get(email);
  }
  const clientoId = normalizeText(clientoBooking.clientoCustomerId || clientoBooking.customerId);
  if (clientoId && lookup.clientoIdToPatient.has(clientoId)) {
    return lookup.clientoIdToPatient.get(clientoId);
  }
  const phone = phoneMatchKey(clientoBooking.customerPhone || clientoBooking.phone);
  if (phone && lookup.phoneToPatient.has(phone)) {
    return lookup.phoneToPatient.get(phone);
  }
  return null;
}

function buildBookingDedupeKey(patientId, startsAt, serviceName) {
  const day = slotDateKey(startsAt);
  const time = normalizeText(startsAt).slice(11, 16);
  const type = normalizeKey(serviceName);
  return [normalizeText(patientId), day, time, type].join('::');
}

function bookingDateLabel(startsAt) {
  const day = slotDateKey(startsAt);
  if (!day) return '';
  return day;
}

function bookingTimeLabel(startsAt) {
  return normalizeText(startsAt).slice(11, 16);
}

function normalizeBookingReadout({
  patientId,
  startsAt,
  endsAt = '',
  durationMinutes = null,
  serviceId = '',
  serviceLabel = '',
  resourceLabel = '',
  status = 'confirmed',
  source = 'internal',
  id = '',
} = {}) {
  const start = normalizeText(startsAt);
  const pid = normalizeText(patientId);
  if (!pid || !start) return null;
  const title =
    serviceIdToTreatmentLabel(serviceId) ||
    normalizeText(serviceLabel) ||
    encounterTypeToTreatmentLabel(serviceId) ||
    'Bokning';
  const end = normalizeText(endsAt);
  let resolvedDuration = Number(durationMinutes);
  if (!Number.isFinite(resolvedDuration) && start && end) {
    const diff = Date.parse(end) - Date.parse(start);
    if (Number.isFinite(diff) && diff > 0) resolvedDuration = Math.round(diff / 60000);
  }
  return {
    id: normalizeText(id) || buildBookingDedupeKey(pid, start, title),
    patientId: pid,
    date: bookingDateLabel(start),
    dateLabel: bookingDateLabel(start),
    time: bookingTimeLabel(start),
    startsAt: start,
    startAt: start,
    endsAt: end || null,
    duration: Number.isFinite(resolvedDuration) ? resolvedDuration : null,
    durationMinutes: Number.isFinite(resolvedDuration) ? resolvedDuration : null,
    title,
    serviceName: title,
    staff: normalizeText(resourceLabel) || null,
    resourceLabel: normalizeText(resourceLabel) || null,
    status: normalizeText(status) || 'confirmed',
    source,
  };
}

function collectBookingReadouts({
  patients = [],
  engineBookings = [],
  bookingCases = [],
  clientoBookings = [],
  lookup = buildPatientLookupMaps(patients),
} = {}) {
  const emailToPatient = lookup.emailToPatient;
  const rows = [];
  const push = (row) => {
    if (row) rows.push(row);
  };

  for (const booking of asArray(engineBookings)) {
    const patientId = emailToPatient.get(normalizeEmail(booking.customerEmail));
    if (!patientId) continue;
    const slot = asObject(booking.slot);
    push(
      normalizeBookingReadout({
        patientId,
        id: booking.bookingId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        durationMinutes: slot.durationMinutes,
        serviceId: slot.serviceId,
        serviceLabel: slot.serviceLabel,
        resourceLabel: slot.resourceLabel,
        status: booking.status,
        source: 'cco_booking_engine',
      })
    );
  }

  for (const bookingCase of asArray(bookingCases)) {
    const patientId = emailToPatient.get(normalizeEmail(bookingCase.customerEmail));
    if (!patientId) continue;
    for (const slot of asArray(bookingCase.selectedSlots)) {
      const safeSlot = asObject(slot);
      push(
        normalizeBookingReadout({
          patientId,
          id: `${normalizeText(bookingCase.bookingCaseId)}:${normalizeText(safeSlot.slotId)}`,
          startsAt: safeSlot.startsAt,
          endsAt: safeSlot.endsAt,
          durationMinutes: safeSlot.durationMinutes,
          serviceId: safeSlot.serviceId,
          serviceLabel: safeSlot.serviceLabel,
          resourceLabel: safeSlot.resourceLabel,
          status:
            normalizeKey(bookingCase.status) === 'confirmed_external'
              ? 'confirmed'
              : bookingCase.status,
          source: 'cco_booking_store',
        })
      );
    }
  }

  for (const clientoBooking of asArray(clientoBookings)) {
    const patientId = resolvePatientIdFromClientoBooking(clientoBooking, lookup);
    if (!patientId) continue;
    if (normalizeKey(clientoBooking.status) === 'cancelled') continue;
    push(
      normalizeBookingReadout({
        patientId,
        id: clientoBooking.bookingId,
        startsAt: clientoBooking.startsAt,
        endsAt: clientoBooking.endsAt,
        durationMinutes: clientoBooking.durationMinutes,
        serviceLabel: clientoBooking.serviceLabel,
        resourceLabel: clientoBooking.staffName,
        status: clientoBooking.status,
        source: 'cliento',
      })
    );
  }

  const byPatient = new Map();
  const sourceRank = {
    cco_booking_engine: 30,
    cco_booking_store: 20,
    cliento: 10,
  };
  for (const row of rows) {
    const key = buildBookingDedupeKey(row.patientId, row.startsAt, row.serviceName || row.title);
    const existing = byPatient.get(key);
    if (!existing || (sourceRank[row.source] || 0) > (sourceRank[existing.source] || 0)) {
      byPatient.set(key, row);
    }
  }

  const now = Date.now();
  const out = new Map();
  for (const row of byPatient.values()) {
    if (!out.has(row.patientId)) {
      out.set(row.patientId, { upcomingBookings: [], historyBookings: [] });
    }
    const bucket = out.get(row.patientId);
    if (isFutureVisit(row.startsAt, now)) bucket.upcomingBookings.push(row);
    else bucket.historyBookings.push(row);
  }
  for (const value of out.values()) {
    value.upcomingBookings.sort((a, b) => (parseMs(a.startsAt) || 0) - (parseMs(b.startsAt) || 0));
    value.historyBookings.sort((a, b) => (parseMs(b.startsAt) || 0) - (parseMs(a.startsAt) || 0));
  }
  return out;
}

function bumpActivityAt(sig, iso) {
  const next = normalizeText(iso);
  if (!next) return;
  const curMs = parseMs(sig.lastActivityAt);
  const nextMs = parseMs(next);
  if (nextMs == null) return;
  if (curMs == null || nextMs > curMs) sig.lastActivityAt = next;
}

function applyPipedriveActivityToSignals(patient, sig) {
  const deals = asArray(asObject(patient.pipedrive).deals);
  for (const deal of deals) {
    const safe = asObject(deal);
    const activityAt = maxIsoDate(safe.treatmentDate, safe.wonAt, safe.updatedAt);
    if (!activityAt) continue;
    bumpActivityAt(sig, activityAt);
    if (isPastVisit(activityAt)) {
      const visitMs = parseMs(activityAt);
      const curVisitMs = parseMs(sig.lastVisitAt);
      if (curVisitMs == null || (visitMs != null && visitMs > curVisitMs)) {
        sig.lastVisitAt = activityAt;
        sig.lastBookingAt = activityAt;
        sig.completedVisitCount += 1;
      }
    }
  }
}

function applyPatientDerivedActivity(patient, sig) {
  applyPipedriveActivityToSignals(patient, sig);
  const fs = asObject(patient.fileSummary);
  if (Number(fs.journalPdfs) > 0 || Number(fs.totalFiles) > 0) {
    bumpActivityAt(sig, patient.updatedAt);
  }
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
      sig.lastVisitType =
        serviceIdToTreatmentLabel(serviceId) ||
        normalizeText(slot?.serviceLabel) ||
        sig.lastVisitType;
      sig.lastVisitResourceLabel = normalizeText(slot?.resourceLabel) || sig.lastVisitResourceLabel;
    }
    if (normalizeKey(bookingStatus) !== 'no_show') {
      sig.completedVisitCount += 1;
    }
    bumpActivityAt(sig, startsAt);
  } else if (isFutureVisit(startsAt, now)) {
    bumpActivityAt(sig, startsAt);
  }
}

function buildBookingSignalsIndex({
  patients = [],
  engineBookings = [],
  bookingCases = [],
  encounters = [],
  clientoBookings = [],
} = {}) {
  const index = new Map();
  const lookup = buildPatientLookupMaps(patients);
  const emailToPatient = lookup.emailToPatient;
  const conversationToPatient = new Map();
  const bookingReadoutsByPatient = collectBookingReadouts({
    patients,
    engineBookings,
    bookingCases,
    clientoBookings,
    lookup,
  });

  for (const patient of asArray(patients)) {
    const sig = getOrCreate(index, patient.id);
    if (sig) applyPatientDerivedActivity(patient, sig);
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
        if (!lv || next > lv) {
          sig.lastVisitAt = startsAt;
          sig.lastVisitType =
            encounterTypeToTreatmentLabel(enc.encounterType) ||
            serviceIdToTreatmentLabel(enc.serviceId) ||
            sig.lastVisitType;
          sig.lastVisitResourceLabel =
            normalizeText(enc.resourceLabel) || sig.lastVisitResourceLabel;
        }
        sig.completedVisitCount += 1;
      }
      bumpActivityAt(sig, startsAt);
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

  for (const clientoBooking of asArray(clientoBookings)) {
    const patientId = resolvePatientIdFromClientoBooking(clientoBooking, lookup);
    if (!patientId) continue;
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    const status = normalizeKey(clientoBooking.status);
    if (status === 'cancelled') continue;
    const startsAt = normalizeText(clientoBooking.startsAt);
    if (!startsAt) continue;
    const slot = {
      startsAt,
      serviceLabel: normalizeText(clientoBooking.serviceLabel),
      resourceLabel: normalizeText(clientoBooking.staffName),
    };
    if (status === 'no_show') {
      sig.noShowCount += 1;
      if (isPastVisit(startsAt)) bumpActivityAt(sig, startsAt);
      continue;
    }
    const bookingStatus =
      status === 'upcoming' || isFutureVisit(startsAt) ? 'confirmed' : 'confirmed';
    applyVisitSlot(sig, slot, bookingStatus, { bookingId: clientoBooking.bookingId });
  }

  for (const [, sig] of index) {
    if (sig.lastVisitAt || sig.lastEncounterAt || sig.lastBookingAt) {
      bumpActivityAt(sig, sig.lastVisitAt || sig.lastEncounterAt || sig.lastBookingAt);
    }
    if (sig.hasUpcomingBooking && !sig.encounterId) {
      sig.missingEncounterForBooking = true;
    } else {
      sig.missingEncounterForBooking = false;
    }
    sig.readyForVisit = null;
    sig.readyForTreatment = null;
  }

  for (const [patientId, readouts] of bookingReadoutsByPatient) {
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    sig.upcomingBookings = readouts.upcomingBookings;
    sig.historyBookings = readouts.historyBookings;
  }

  return { index, emailToPatient, conversationToPatient, lookup };
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
  readout.lastVisitType = sig.lastVisitType || readout.lastVisitType || null;
  readout.lastVisitResourceLabel =
    sig.lastVisitResourceLabel || readout.lastVisitResourceLabel || null;
  readout.lastBookingType = readout.lastVisitType || readout.lastBookingType || null;
  readout.lastActivityAt = sig.lastActivityAt;
  readout.lastEncounterAt = sig.lastEncounterAt;
  readout.noShowCount = sig.noShowCount;
  readout.completedVisitCount = sig.completedVisitCount;
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
  readout.upcomingBookings = asArray(sig.upcomingBookings);
  readout.bookingHistory = asArray(sig.historyBookings);
  readout.historyBookings = asArray(sig.historyBookings);
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

    let clientoBookings = [];
    try {
      const { createClientoBookingStore } = require('./clientoBookingStore');
      const candidatePaths = [
        config?.clientoBookingStorePath,
        path.join(process.cwd(), 'data', 'cco', 'cliento-bookings.json'),
        path.join(process.cwd(), 'data', 'cliento-booking-store.json'),
      ].filter(Boolean);
      for (const clientoPath of candidatePaths) {
        try {
          const clientoStore = await createClientoBookingStore({ filePath: clientoPath });
          const batch = clientoStore.listAllBookings({ tenantId: tid, limit: 50000 });
          if (batch.length > 0) {
            clientoBookings = batch;
            break;
          }
          if (!clientoBookings.length) clientoBookings = batch;
        } catch {
          /* try next path */
        }
      }
    } catch {
      clientoBookings = [];
    }

    const built = buildBookingSignalsIndex({
      patients,
      engineBookings,
      bookingCases,
      encounters,
      clientoBookings,
    });

    const hasAny =
      engineBookings.length > 0 ||
      bookingCases.length > 0 ||
      encounters.length > 0 ||
      clientoBookings.length > 0;
    const coverage = hasAny ? 'real' : 'partial';

    return {
      index: built.index,
      coverage,
      sources: {
        engineBookings: engineBookings.length,
        bookingCases: bookingCases.length,
        encounters: encounters.length,
        clientoBookings: clientoBookings.length,
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
