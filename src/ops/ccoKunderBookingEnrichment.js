'use strict';

/**
 * P0.4 — Booking/calendar signals for Kunder (engine bookings + cases + encounters).
 */

const path = require('node:path');
const { maxIsoDate } = require('./pipedriveDealHelpers');
const {
  buildClientoHistoricalShadowReadmodel,
  HISTORICAL_BOOKING_REASON,
} = require('./clientoHistoricalShadowReadmodel');
const {
  buildResourceIndex,
  inferredResourceId,
} = require('./clinicCalendarView');

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * Statusar dar en manniska bevisligen har gjort nagot med arendet.
 *
 * needs_triage saknas har med flit. Den ar storens default for allt — och
 * viktigare: ett tomt bokningsarende skapas automatiskt varje gang nagon bara
 * OPPNAR en konversation (ccoWorkspace.js:770) eller bokningsytan
 * (ccoBookings.js:849). I produktion var 134 av 148 arenden sadana skal.
 *
 * Nar needs_triage rakandes som vantelista blev foljden att patienter visades
 * som vantande pa tid for att nagon rakat titta pa deras konversation. Det syns
 * hela vagen ut i segmentet "Vantelista", raknaren och taggen "Pa vantelistan".
 */
const AKTIVA_VANTELISTESTATUSAR = new Set(['waiting_customer', 'offered', 'slots_ready']);

/**
 * Innehaller arendet nagot som en manniska har lagt dit?
 *
 * Ett skal har exakt en handelse (case_created) och inget annat. Sa fort en
 * operator valt tider, angett behandling, satt onskad tidsram eller tagit
 * agarskap finns det nagot att vanta pa — oavsett om statusen hunnit andras.
 */
function bookingCaseHarManskligtInnehall(bookingCase = {}) {
  if (asArray(bookingCase.selectedSlots).length > 0) return true;
  if (normalizeText(bookingCase.requestedTreatment)) return true;
  if (normalizeText(bookingCase.preferredWindow)) return true;
  if (normalizeText(bookingCase.ownerUserId)) return true;
  return asArray(bookingCase.events).length > 1;
}

function arPaVantelista(bookingCase = {}) {
  const status = normalizeKey(bookingCase.status);
  if (AKTIVA_VANTELISTESTATUSAR.has(status)) return true;
  if (status !== 'needs_triage') return false;
  // Ett otriagerat arende raknas — men bara om det ar ett riktigt arende.
  return bookingCaseHarManskligtInnehall(bookingCase);
}

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
  if (digits.startsWith('46') && digits.length >= 10) {
    return `0${digits.slice(2)}`.slice(-10);
  }
  return digits.slice(-10);
}

function buildPatientLookupMaps(patients = []) {
  const emailToPatient = new Map();
  const clientoIdToPatient = new Map();
  const phoneToPatient = new Map();
  const patientIds = new Set();
  const ambiguous = { emails: new Set(), clientoIds: new Set(), phones: new Set() };
  const addUnique = (map, conflicts, key, patientId) => {
    if (!key || conflicts.has(key)) return;
    const existing = map.get(key);
    if (existing && existing !== patientId) {
      map.delete(key);
      conflicts.add(key);
      return;
    }
    map.set(key, patientId);
  };
  for (const patient of asArray(patients)) {
    const patientId = normalizeText(patient.id);
    if (!patientId) continue;
    patientIds.add(patientId);
    const emails = new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
    );
    for (const email of emails) {
      addUnique(emailToPatient, ambiguous.emails, email, patientId);
    }
    const cliento = asObject(patient.cliento);
    const clientoIds = new Set(
      [cliento.sourceId, cliento.canonicalCustomerId, cliento.customerKey]
        .map(normalizeText)
        .filter(Boolean)
    );
    for (const identity of asArray(patient.identities)) {
      if (normalizeKey(identity?.source || identity?.system) === 'cliento') {
        const id = normalizeText(identity?.sourceId || identity?.externalId || identity?.id);
        if (id) clientoIds.add(id);
      }
    }
    for (const clientoId of clientoIds) {
      addUnique(clientoIdToPatient, ambiguous.clientoIds, clientoId, patientId);
    }
    const phones = new Set(
      [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
    );
    for (const phone of phones) {
      addUnique(phoneToPatient, ambiguous.phones, phone, patientId);
    }
  }
  return { emailToPatient, clientoIdToPatient, phoneToPatient, patientIds, ambiguous };
}

function buildEmailToPatientMap(patients = []) {
  return buildPatientLookupMaps(patients).emailToPatient;
}

function resolvePatientIdFromClientoBooking(clientoBooking, lookup) {
  const explicitPatientId = normalizeText(clientoBooking.patientId);
  if (explicitPatientId && lookup.patientIds?.has(explicitPatientId)) return explicitPatientId;
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

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return '';
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return `${local.slice(0, 1) || '*'}***`;
  const domainParts = domain.split('.');
  const suffix = domainParts.length > 1 ? `.${domainParts.at(-1)}` : '';
  return `${local.slice(0, 1) || '*'}***@${domain.slice(0, 1) || '*'}***${suffix}`;
}

function maskPhone(value) {
  const digits = normalizeText(value).replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : '';
}

function maskExternalId(value) {
  const id = normalizeText(value);
  if (!id) return '';
  if (id.length <= 4) return `${id.slice(0, 1)}***`;
  return `${id.slice(0, 2)}***${id.slice(-2)}`;
}

function buildUnlinkedClientoBookingReview({ patients = [], clientoBookings = [] } = {}) {
  const lookup = buildPatientLookupMaps(patients);
  const rows = [];

  for (const booking of asArray(clientoBookings)) {
    const explicitPatientId = normalizeText(booking?.patientId);
    if (explicitPatientId && lookup.patientIds.has(explicitPatientId)) continue;

    const identities = [
      {
        type: 'email',
        key: normalizeEmail(booking?.customerEmail),
        masked: maskEmail(booking?.customerEmail),
        map: lookup.emailToPatient,
        ambiguous: lookup.ambiguous.emails,
      },
      {
        type: 'cliento_customer_id',
        key: normalizeText(booking?.clientoCustomerId || booking?.customerId),
        masked: maskExternalId(booking?.clientoCustomerId || booking?.customerId),
        map: lookup.clientoIdToPatient,
        ambiguous: lookup.ambiguous.clientoIds,
      },
      {
        type: 'phone',
        key: phoneMatchKey(booking?.customerPhone || booking?.phone),
        masked: maskPhone(booking?.customerPhone || booking?.phone),
        map: lookup.phoneToPatient,
        ambiguous: lookup.ambiguous.phones,
      },
    ].filter((identity) => identity.key);

    const collisions = identities.filter((identity) => identity.ambiguous.has(identity.key));
    const uniqueMatches = new Set(
      identities.map((identity) => identity.map.get(identity.key)).filter(Boolean)
    );

    let reasonCode = '';
    let reason = '';
    if (explicitPatientId) {
      reasonCode = 'explicit_patient_not_found';
      reason =
        'Angivet canonical patientId finns inte i patientpopulationen; ingen reservmatchning gjordes.';
    } else if (collisions.length) {
      const labels = collisions.map((identity) => identity.type).join(', ');
      reasonCode = 'identity_collision';
      reason = `Identitetsgrund matchar flera canonical patienter (${labels}); ingen koppling gjordes.`;
    } else if (uniqueMatches.size > 1) {
      reasonCode = 'conflicting_identity_matches';
      reason =
        'Olika identitetsgrunder pekar på olika canonical patienter; ingen koppling gjordes.';
    } else if (uniqueMatches.size === 1) {
      continue;
    } else if (!identities.length) {
      reasonCode = 'missing_identity';
      reason = 'E-post, telefon och Cliento kund-id saknas; posten kan inte kopplas säkert.';
    } else {
      reasonCode = 'no_canonical_match';
      reason = 'Maskerade identitetsgrunder finns men matchar ingen canonical patient.';
    }

    const identityBasis = identities.map((identity) => ({
      type: identity.type,
      masked: identity.masked,
    }));
    if (!identityBasis.length) identityBasis.push({ type: 'none', masked: 'saknas' });
    rows.push({
      bookingId: normalizeText(booking?.bookingId || booking?.id) || null,
      date: slotDateKey(booking?.startsAt) || null,
      startsAt: normalizeText(booking?.startsAt) || null,
      identityBasis,
      reasonCode,
      reason,
      patientId: null,
      encounterId: null,
      readOnly: true,
      linkAllowed: false,
    });
  }

  rows.sort((left, right) => {
    const byDate = String(left.startsAt || '').localeCompare(String(right.startsAt || ''));
    return byDate || String(left.bookingId || '').localeCompare(String(right.bookingId || ''));
  });
  const byReason = {};
  for (const row of rows) byReason[row.reasonCode] = (byReason[row.reasonCode] || 0) + 1;
  return { zeroWrites: true, total: rows.length, byReason, rows };
}

function buildBookingDedupeKey(patientId, startsAt, serviceName) {
  const day = slotDateKey(startsAt);
  const time = normalizeText(startsAt).slice(11, 16);
  const type = normalizeKey(serviceName);
  return [normalizeText(patientId), day, time, type].join('::');
}

function clientoSourceKey(booking) {
  const tenantId = normalizeText(booking?.tenantId || booking?.tenant);
  const bookingId = normalizeText(booking?.bookingId || booking?.id);
  return tenantId && bookingId ? `${tenantId}::${bookingId}` : '';
}

function firstText(values = []) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function collectShadowNoteRows(sourceRecords = []) {
  const rows = [];
  for (const record of asArray(sourceRecords)) {
    const tenantId = normalizeText(record?.tenantId);
    const prefix = tenantId ? `${tenantId} · ` : '';
    const segments = asObject(record?.noteSegments);
    for (const [field, label] of [
      ['bookingNotes', 'Bokningsanteckning'],
      ['customerMessage', 'Kundmeddelande'],
      ['internalNotes', 'Intern anteckning'],
      ['treatmentNotes', 'Behandlingsanteckning'],
      ['notes', 'Anteckning'],
    ]) {
      const text = normalizeText(segments[field]);
      if (text) rows.push({ label: `${prefix}${label}`, text, field, tenantId });
    }
  }
  return rows;
}

function buildHistoricalShadowReadouts({ clientoBookings = [], ledgerEvents = [] } = {}) {
  if (!asArray(clientoBookings).length || !asArray(ledgerEvents).length) {
    return { rows: [], consumedSourceKeys: new Set(), model: null };
  }
  const model = buildClientoHistoricalShadowReadmodel({
    bookings: clientoBookings,
    ledgerEvents,
    includeUnmerged: false,
  });
  const consumedSourceKeys = new Set();
  const rows = [];
  for (const event of asArray(model.events)) {
    if (event?.eventType !== 'cliento_historical_booking_shadow_merge') continue;
    const sourceRecords = asArray(event.sourceRecords);
    for (const record of sourceRecords) {
      const key = clientoSourceKey(record);
      if (key) consumedSourceKeys.add(key);
    }
    const display = asObject(event.display);
    const sourceLabels = sourceRecords
      .map((record) => normalizeText(record.tenantId))
      .filter(Boolean);
    const notes = collectShadowNoteRows(sourceRecords);
    const readout = normalizeBookingReadout({
      patientId: event.canonicalPatientId,
      id: `shadow:${normalizeText(event.linkId || event.ledgerEventId || event.bookingRef)}`,
      startsAt: display.startsAt,
      endsAt: display.endsAt,
      serviceLabel: display.serviceLabel,
      serviceDisplayName: display.serviceLabel,
      resourceLabel: firstText(sourceRecords.map((record) => record.resourceLabel)),
      notes: notes.length
        ? notes.map((note) => `${note.label}: ${note.text}`).join('\n\n')
        : `Approved historical shadow · ${sourceLabels.join(' + ')}`,
      bookingNotes: firstText(sourceRecords.map((record) => record.noteSegments?.bookingNotes)),
      customerMessage: firstText(
        sourceRecords.map((record) => record.noteSegments?.customerMessage)
      ),
      internalNotes: firstText(sourceRecords.map((record) => record.noteSegments?.internalNotes)),
      treatmentNotes: firstText(sourceRecords.map((record) => record.noteSegments?.treatmentNotes)),
      status: display.status || 'completed',
      source: 'cliento_historical_shadow',
      encounterId: '',
    });
    if (!readout) continue;
    rows.push({
      ...readout,
      bookingId: normalizeText(event.linkId) || readout.bookingId,
      canonicalEncounterId: null,
      encounterId: null,
      readOnly: true,
      linkAllowed: false,
      shadowReadmodel: true,
      shadowReadOnly: true,
      historicalReason: HISTORICAL_BOOKING_REASON,
      linkId: normalizeText(event.linkId) || null,
      ledgerEventId: normalizeText(event.ledgerEventId) || null,
      sourceRecords,
      shadowNoteSegments: notes,
      provenance: event.provenance || null,
    });
  }
  return { rows, consumedSourceKeys, model };
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
  serviceDisplayName = '',
  resourceId = '',
  resourceLabel = '',
  locationLabel = '',
  notes = '',
  bookingNotes = '',
  customerMessage = '',
  internalNotes = '',
  treatmentNotes = '',
  encounterId = '',
  patientName = '',
  status = 'confirmed',
  source = 'internal',
  id = '',
} = {}) {
  const start = normalizeText(startsAt);
  const pid = normalizeText(patientId);
  if (!pid || !start) return null;
  const title =
    normalizeText(serviceDisplayName) ||
    normalizeText(serviceLabel) ||
    serviceIdToTreatmentLabel(serviceId) ||
    encounterTypeToTreatmentLabel(serviceId) ||
    'Bokning';
  const end = normalizeText(endsAt);
  let resolvedDuration = Number(durationMinutes);
  if (!Number.isFinite(resolvedDuration) && start && end) {
    const diff = Date.parse(end) - Date.parse(start);
    if (Number.isFinite(diff) && diff > 0) resolvedDuration = Math.round(diff / 60000);
  }
  const staffName = normalizeText(resourceLabel) || null;
  const durationLabel = Number.isFinite(resolvedDuration) ? `${resolvedDuration} min` : '';
  return {
    id: normalizeText(id) || buildBookingDedupeKey(pid, start, title),
    bookingId: normalizeText(id) || null,
    patientId: pid,
    date: bookingDateLabel(start),
    dateLabel: bookingDateLabel(start),
    time: bookingTimeLabel(start),
    startsAt: start,
    startAt: start,
    endsAt: end || null,
    duration: Number.isFinite(resolvedDuration) ? resolvedDuration : null,
    durationMinutes: Number.isFinite(resolvedDuration) ? resolvedDuration : null,
    durationLabel,
    title,
    serviceId: normalizeText(serviceId) || null,
    serviceDisplayName: title,
    serviceName: title,
    staff: staffName,
    staffName,
    practitioner: staffName,
    resourceId: normalizeText(resourceId) || null,
    resourceLabel: staffName,
    locationLabel: normalizeText(locationLabel) || null,
    notes: normalizeText(notes) || null,
    bookingNotes: normalizeText(bookingNotes) || null,
    customerMessage: normalizeText(customerMessage) || null,
    internalNotes: normalizeText(internalNotes) || null,
    treatmentNotes: normalizeText(treatmentNotes) || null,
    encounterId: normalizeText(encounterId) || null,
    patientName: normalizeText(patientName) || null,
    status: normalizeText(status) || 'confirmed',
    source,
  };
}

function collectBookingReadouts({
  patients = [],
  engineBookings = [],
  bookingCases = [],
  clientoBookings = [],
  historicalShadowClientoBookings = clientoBookings,
  historicalShadowLedgerEvents = [],
  encounters = [],
  services = [],
  resources = [],
  lookup = buildPatientLookupMaps(patients),
} = {}) {
  const emailToPatient = lookup.emailToPatient;
  const resourceIndex = buildResourceIndex({ _state: { resources } });
  const rows = [];
  const serviceDisplayNames = new Map(
    asArray(services)
      .map((service) => [
        normalizeKey(service?.id),
        normalizeText(service?.displayName || service?.label || service?.name),
      ])
      .filter(([serviceId, displayName]) => serviceId && displayName)
  );
  const resolveServiceDisplayName = (serviceId, fallback = '') =>
    serviceDisplayNames.get(normalizeKey(serviceId)) || normalizeText(fallback);
  const encounterByBookingId = new Map();
  const encountersByPatient = new Map();
  for (const encounter of asArray(encounters)) {
    const patientId = normalizeText(encounter.patientId);
    const bookingId = normalizeText(encounter.bookingId);
    if (bookingId && patientId) encounterByBookingId.set(`${patientId}::${bookingId}`, encounter);
    if (patientId) {
      if (!encountersByPatient.has(patientId)) encountersByPatient.set(patientId, []);
      encountersByPatient.get(patientId).push(encounter);
    }
  }
  const resolveEncounterId = (patientId, booking) => {
    const explicit = normalizeText(booking?.encounterId || booking?.treatmentEncounterId);
    if (explicit) return explicit;
    const bookingId = normalizeText(booking?.bookingId || booking?.id);
    const exact = bookingId ? encounterByBookingId.get(`${patientId}::${bookingId}`) : null;
    if (exact) return normalizeText(exact.encounterId);
    const startsAtMs = parseMs(booking?.startsAt || booking?.slot?.startsAt);
    if (startsAtMs == null) return '';
    const candidates = asArray(encountersByPatient.get(patientId)).filter((encounter) => {
      const encounterMs = parseMs(encounter.startsAt);
      return encounterMs != null && Math.abs(encounterMs - startsAtMs) <= 5 * 60 * 1000;
    });
    return candidates.length === 1 ? normalizeText(candidates[0].encounterId) : '';
  };
  const push = (row) => {
    if (row) rows.push(row);
  };
  const historicalShadow = buildHistoricalShadowReadouts({
    clientoBookings: historicalShadowClientoBookings,
    ledgerEvents: historicalShadowLedgerEvents,
  });
  for (const row of historicalShadow.rows) push(row);

  for (const booking of asArray(engineBookings)) {
    // FÄLTET HETER canonicalPatientId PÅ ENGINE-POSTER, INTE patientId.
    //
    // normalizeBookingRecord (ccoBookingEngineStore.js:911) tar emot bådadera
    // men LAGRAR under `canonicalPatientId`; `patientId` finns inte på posten.
    // Grenen läste därför alltid undefined och föll igenom till e-post — den
    // canonical-patient som create/confirm-flödet bevisligen verifierade
    // (ccoBookingEngine.js:1002) kastades bort vid varje kortbygge.
    //
    // Följden var tyst: en bokning vars kund har en annan e-post än den
    // registrerade försvann helt från kundkortet, trots korrekt patientkoppling.
    const canonicalPatientId = normalizeText(booking.canonicalPatientId);
    const patientId =
      (lookup.patientIds?.has(canonicalPatientId) && canonicalPatientId) ||
      emailToPatient.get(normalizeEmail(booking.customerEmail));
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
        serviceDisplayName: resolveServiceDisplayName(slot.serviceId, slot.serviceLabel),
        resourceId: slot.resourceId,
        resourceLabel: slot.resourceLabel,
        notes: booking.notes,
        status: booking.status,
        encounterId: resolveEncounterId(patientId, booking),
        patientName: booking.customerName,
        source: 'cco_booking_engine',
      })
    );
  }

  for (const bookingCase of asArray(bookingCases)) {
    // Samma bugg som redan ar fixad for engine-poster ovan, men for arenden.
    //
    // Uppslaget gjordes bara pa e-post, sa det patientId som migreringen
    // 2026-08-20 skrev pa arendet kastades bort vid varje kortbygge. Foljden
    // var tyst: en kund vars arende har en annan mejladress an den registrerade
    // tappade sitt bokningsarende fran kundkortet, trots korrekt koppling.
    const explicitPatientId = normalizeText(bookingCase.patientId);
    const patientId =
      (lookup.patientIds?.has(explicitPatientId) && explicitPatientId) ||
      emailToPatient.get(normalizeEmail(bookingCase.customerEmail));
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
          serviceDisplayName: resolveServiceDisplayName(safeSlot.serviceId, safeSlot.serviceLabel),
          resourceId: safeSlot.resourceId,
          resourceLabel: safeSlot.resourceLabel,
          notes: bookingCase.notes,
          status:
            normalizeKey(bookingCase.status) === 'confirmed_external'
              ? 'confirmed'
              : bookingCase.status,
          source: 'cco_booking_store',
          encounterId: resolveEncounterId(patientId, {
            ...safeSlot,
            bookingId: bookingCase.bookingId,
          }),
          patientName: bookingCase.customerName,
        })
      );
    }
  }

  for (const clientoBooking of asArray(clientoBookings)) {
    const sourceKey = clientoSourceKey(clientoBooking);
    if (sourceKey && historicalShadow.consumedSourceKeys.has(sourceKey)) continue;
    const patientId = resolvePatientIdFromClientoBooking(clientoBooking, lookup);
    if (!patientId) continue;
    const staffName = normalizeText(clientoBooking.staffName || clientoBooking.staff);
    const resourceId =
      resourceIndex.byLabel.get(normalizeKey(staffName)) || inferredResourceId(staffName);
    push(
      normalizeBookingReadout({
        patientId,
        id: clientoBooking.bookingId,
        startsAt: clientoBooking.startsAt,
        endsAt: clientoBooking.endsAt,
        durationMinutes: clientoBooking.durationMinutes,
        serviceLabel: clientoBooking.serviceLabel,
        serviceDisplayName: resolveServiceDisplayName(
          clientoBooking.serviceId,
          clientoBooking.serviceLabel
        ),
        resourceId,
        resourceLabel: staffName,
        locationLabel: clientoBooking.locationName,
        notes: clientoBooking.notes,
        bookingNotes: clientoBooking.bookingNotes,
        customerMessage: clientoBooking.customerMessage,
        internalNotes: clientoBooking.internalNotes,
        treatmentNotes: clientoBooking.treatmentNotes,
        status: clientoBooking.status,
        source: 'cliento',
        encounterId: resolveEncounterId(patientId, clientoBooking),
        patientName: clientoBooking.customerName,
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
    const status = normalizeKey(row.status);
    const historical = ['completed', 'cancelled', 'canceled', 'no_show'].includes(status);
    if (!historical && isFutureVisit(row.startsAt, now)) bucket.upcomingBookings.push(row);
    else bucket.historyBookings.push(row);
  }
  for (const value of out.values()) {
    value.upcomingBookings.sort((a, b) => (parseMs(a.startsAt) || 0) - (parseMs(b.startsAt) || 0));
    value.historyBookings.sort((a, b) => (parseMs(b.startsAt) || 0) - (parseMs(a.startsAt) || 0));
  }
  out._historicalShadowConsumedSourceKeys = historicalShadow.consumedSourceKeys;
  out._historicalShadowCounts = historicalShadow.model?.counts || null;
  return out;
}

const CANONICAL_BOOKING_STATUSES = new Set([
  'confirmed',
  'upcoming',
  'completed',
  'cancelled',
  'canceled',
  'no_show',
]);
const CANONICAL_BOOKING_SOURCES = new Set([
  'cco_booking_engine',
  'cco_booking_store',
  'cliento',
  'cliento_historical_shadow',
]);

function canonicalIntegritySource(value) {
  const source = normalizeText(value);
  return CANONICAL_BOOKING_SOURCES.has(source) ? source : 'unknown';
}

function buildCanonicalBookingIntegrityReport({
  patients = [],
  byPatient = new Map(),
  encounters = [],
} = {}) {
  const canonicalPatientIds = new Set(
    asArray(patients)
      .map((patient) => normalizeText(patient?.id))
      .filter(Boolean)
  );
  const issues = [];
  const byStatus = {};
  const bySource = {};
  const noteCoverage = {
    notes: 0,
    bookingNotes: 0,
    customerMessage: 0,
    internalNotes: 0,
    treatmentNotes: 0,
  };
  const seenVisitIds = new Set();
  const encounterPatientById = new Map(
    asArray(encounters)
      .map((encounter) => [
        normalizeText(encounter?.encounterId),
        normalizeText(encounter?.patientId),
      ])
      .filter(([encounterId]) => encounterId)
  );
  let totalVisits = 0;
  let visitsWithEncounter = 0;

  const addIssue = (code, visit, bucketPatientId) => {
    issues.push({
      code,
      bookingId: maskExternalId(visit?.id) || null,
      patientId: maskExternalId(visit?.patientId || bucketPatientId) || null,
      date: parseMs(visit?.startsAt) == null ? null : slotDateKey(visit?.startsAt) || null,
      source: canonicalIntegritySource(visit?.source),
    });
  };

  for (const [rawBucketPatientId, bucket] of byPatient instanceof Map ? byPatient : new Map()) {
    const bucketPatientId = normalizeText(rawBucketPatientId);
    const visits = [...asArray(bucket?.upcomingBookings), ...asArray(bucket?.historyBookings)];
    for (const visit of visits) {
      totalVisits += 1;
      const patientId = normalizeText(visit?.patientId);
      const bookingId = normalizeText(visit?.id);
      const source = canonicalIntegritySource(visit?.source);
      const status = normalizeKey(visit?.status) || 'missing';
      const statusBucket = CANONICAL_BOOKING_STATUSES.has(status) ? status : 'invalid';
      byStatus[statusBucket] = (byStatus[statusBucket] || 0) + 1;
      bySource[source] = (bySource[source] || 0) + 1;

      for (const field of Object.keys(noteCoverage)) {
        if (normalizeText(visit?.[field])) noteCoverage[field] += 1;
        if (visit?.[field] != null && typeof visit[field] !== 'string') {
          addIssue(`invalid_${field}_type`, visit, bucketPatientId);
        }
      }
      const encounterId = normalizeText(visit?.encounterId);
      if (encounterId) {
        visitsWithEncounter += 1;
        if (!encounterPatientById.has(encounterId)) {
          addIssue('unknown_encounter_id', visit, bucketPatientId);
        } else if (encounterPatientById.get(encounterId) !== patientId) {
          addIssue('encounter_patient_mismatch', visit, bucketPatientId);
        }
      }

      if (!patientId) addIssue('missing_patient_id', visit, bucketPatientId);
      else if (!canonicalPatientIds.has(patientId)) {
        addIssue('unknown_patient_id', visit, bucketPatientId);
      }
      if (patientId && bucketPatientId && patientId !== bucketPatientId) {
        addIssue('patient_bucket_mismatch', visit, bucketPatientId);
      }
      if (!bookingId) addIssue('missing_booking_id', visit, bucketPatientId);
      if (!normalizeText(visit?.startsAt) || parseMs(visit?.startsAt) == null) {
        addIssue('invalid_starts_at', visit, bucketPatientId);
      }
      if (!CANONICAL_BOOKING_STATUSES.has(status)) {
        addIssue('invalid_status', visit, bucketPatientId);
      }

      if (bookingId) {
        const visitId = `${source}::${bookingId}`;
        if (seenVisitIds.has(visitId)) addIssue('duplicate_visit_id', visit, bucketPatientId);
        seenVisitIds.add(visitId);
      }
    }
  }

  const byIssue = {};
  for (const issue of issues) byIssue[issue.code] = (byIssue[issue.code] || 0) + 1;
  return {
    zeroWrites: true,
    readOnly: true,
    ok: issues.length === 0,
    totalPatients: canonicalPatientIds.size,
    totalVisits,
    totalIssues: issues.length,
    byStatus,
    bySource,
    noteCoverage,
    encounterCoverage: {
      withEncounter: visitsWithEncounter,
      withoutEncounter: totalVisits - visitsWithEncounter,
    },
    byIssue,
    issues: issues.slice(0, 200),
    issueSamplesTruncated: issues.length > 200,
  };
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
  historicalShadowClientoBookings = clientoBookings,
  historicalShadowLedgerEvents = [],
  services = [],
  resources = [],
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
    historicalShadowClientoBookings,
    historicalShadowLedgerEvents,
    encounters,
    services,
    resources,
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
    // Samma brygga som i collectBookingReadouts ovan. Signalindexet hade ingen
    // canonical-gren alls, bara e-post — så en bokning kunde synas i readouts
    // men saknas i signalerna, vilket är ett sämre läge än att båda saknar den.
    // Valideras mot lookup.patientIds eftersom getOrCreate skapar en post för
    // vilket id som helst och annars skulle hitta på en patient.
    const canonicalPatientId = normalizeText(booking.canonicalPatientId);
    const patientId =
      (lookup.patientIds?.has(canonicalPatientId) && canonicalPatientId) ||
      emailToPatient.get(normalizeKey(booking.customerEmail));
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

    if (arPaVantelista(bookingCase)) {
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
    const sourceKey = clientoSourceKey(clientoBooking);
    if (sourceKey && bookingReadoutsByPatient._historicalShadowConsumedSourceKeys?.has(sourceKey)) {
      continue;
    }
    const patientId = resolvePatientIdFromClientoBooking(clientoBooking, lookup);
    if (!patientId) continue;
    const sig = getOrCreate(index, patientId);
    if (!sig) continue;
    const status = normalizeKey(clientoBooking.status);
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
    if (status === 'cancelled' || status === 'canceled') {
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
    for (const booking of [
      ...asArray(readouts.upcomingBookings),
      ...asArray(readouts.historyBookings),
    ].filter((row) => normalizeText(row?.source) === 'cliento_historical_shadow')) {
      const status = normalizeKey(booking.status);
      const startsAt = normalizeText(booking.startsAt);
      if (!startsAt) continue;
      if (status === 'no_show') {
        sig.noShowCount += 1;
        if (isPastVisit(startsAt)) bumpActivityAt(sig, startsAt);
      } else if (status === 'cancelled' || status === 'canceled') {
        if (isPastVisit(startsAt)) bumpActivityAt(sig, startsAt);
      } else {
        applyVisitSlot(
          sig,
          {
            startsAt,
            serviceLabel: normalizeText(booking.serviceName || booking.title),
            resourceLabel: normalizeText(booking.resourceLabel || booking.staffName),
          },
          isFutureVisit(startsAt) ? 'confirmed' : status || 'completed',
          { bookingId: booking.bookingId }
        );
      }
    }
    sig.upcomingBookings = readouts.upcomingBookings;
    sig.historyBookings = readouts.historyBookings;
  }

  return {
    index,
    emailToPatient,
    conversationToPatient,
    lookup,
    historicalShadowCounts: bookingReadoutsByPatient._historicalShadowCounts || null,
  };
}

function resolveClientoLinkSidecarLedgerPath(config = {}) {
  const explicit = normalizeText(config.clientoLinkSidecarLedgerPath);
  if (explicit) return explicit;
  const stateRoot = normalizeText(config.stateRoot || process.env.ARCANA_STATE_ROOT);
  if (stateRoot) return path.join(stateRoot, 'cco', 'cliento-link-sidecar-ledger.jsonl');
  return path.join(process.cwd(), 'data', 'cco', 'cliento-link-sidecar-ledger.jsonl');
}

async function loadClientoLinkSidecarLedgerEvents(config = {}) {
  try {
    const { createClientoLinkSidecarLedger } = require('./clientoLinkSidecarLedger');
    const ledger = await createClientoLinkSidecarLedger({
      filePath: resolveClientoLinkSidecarLedgerPath(config),
      gates: { ledgerWriteAllowed: false, activationAllowed: false },
    });
    return typeof ledger.listEvents === 'function' ? ledger.listEvents() : [];
  } catch {
    return [];
  }
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

async function loadKunderBookingIndex(
  config,
  tenantId,
  patients = [],
  { includeClientoBookings = true, includeHistoricalShadowLinks = true } = {}
) {
  const empty = {
    index: new Map(),
    coverage: 'missing',
    sources: {},
    engineBookings: [],
    bookingCases: [],
    encounters: [],
    clientoBookings: [],
    historicalShadowLedgerEvents: [],
  };
  try {
    if (!bookingStoresPromise) {
      bookingStoresPromise = (async () => {
        const { createCcoBookingEngineStore } = require('./ccoBookingEngineStore');
        const { createCcoBookingStore } = require('./ccoBookingStore');
        const { createCcoTreatmentEncounterStore } = require('./ccoTreatmentEncounterStore');
        // Fallbacken pekade tidigare på path.join(process.cwd(), 'data', ...) —
        // en hårdkodad sökväg som gick förbi ARCANA_STATE_ROOT helt. Den träffar
        // bara när anroparen glömt tråda igenom config, och då skrev en lokal
        // körning rakt in i repots data/. Samma fallback finns kvar, men löses nu
        // via config-modulens resolveStatePath i stället.
        const { config: defaultConfig } = require('../config');
        const enginePath =
          config?.ccoBookingEngineStorePath || defaultConfig.ccoBookingEngineStorePath;
        const casesPath = config?.ccoBookingStorePath || defaultConfig.ccoBookingStorePath;
        const encPath =
          config?.ccoTreatmentEncounterStorePath || defaultConfig.ccoTreatmentEncounterStorePath;
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
        ? stores.engineStore.listBookingsForEnrichment(tid, { excludeTestData: true })
        : [];
    const bookingCases =
      typeof stores.caseStore.listCasesForEnrichment === 'function'
        ? // excludeTestData: annars flaggar de 199 RFC-2606-arendena riktiga
          // patienter som vantande pa tid.
          await stores.caseStore.listCasesForEnrichment({
            tenantId: tid,
            limit: 5000,
            excludeTestData: true,
          })
        : await stores.caseStore.listCases({
            tenantId: tid,
            limit: 5000,
            excludeTestData: true,
          });
    const encounters =
      typeof stores.encounterStore.listEncountersForEnrichment === 'function'
        ? stores.encounterStore.listEncountersForEnrichment(tid)
        : [];
    const services =
      typeof stores.engineStore.listServices === 'function'
        ? await stores.engineStore.listServices({})
        : [];

    let clientoBookings = [];
    let historicalShadowClientoBookings = [];
    if (includeClientoBookings) {
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
            const batch = clientoStore.listAllBookings({ tenantId: tid, limit: 0 });
            const allForShadow =
              includeHistoricalShadowLinks && typeof clientoStore.listAllBookings === 'function'
                ? clientoStore.listAllBookings({ tenantId: '', limit: 0 })
                : [];
            if (batch.length > 0) {
              clientoBookings = batch;
              historicalShadowClientoBookings = allForShadow.length ? allForShadow : batch;
              break;
            }
            if (!clientoBookings.length) clientoBookings = batch;
            if (!historicalShadowClientoBookings.length) {
              historicalShadowClientoBookings = allForShadow.length ? allForShadow : batch;
            }
          } catch {
            /* try next path */
          }
        }
      } catch {
        clientoBookings = [];
      }
    }
    const historicalShadowLedgerEvents =
      includeHistoricalShadowLinks && includeClientoBookings
        ? await loadClientoLinkSidecarLedgerEvents(config || {})
        : [];

    const built = buildBookingSignalsIndex({
      patients,
      engineBookings,
      bookingCases,
      encounters,
      clientoBookings,
      historicalShadowClientoBookings,
      historicalShadowLedgerEvents,
      services,
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
        historicalShadowLedgerEvents: historicalShadowLedgerEvents.length,
        historicalShadowBookings: built.historicalShadowCounts?.mergedApprovedLinks || 0,
      },
      engineBookings,
      bookingCases,
      encounters,
      clientoBookings,
      historicalShadowLedgerEvents,
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
  collectBookingReadouts,
  buildCanonicalBookingIntegrityReport,
  buildUnlinkedClientoBookingReview,
  buildHistoricalShadowReadouts,
  buildPatientLookupMaps,
  resolvePatientIdFromClientoBooking,
  getBookingSignals,
  applyBookingToReadout,
  loadKunderBookingIndex,
  loadClientoLinkSidecarLedgerEvents,
  resolveClientoLinkSidecarLedgerPath,
  patientMatchesTreatmentSegment,
  emptyBookingSignals,
  isTodayVisit,
  isThisWeekVisit,
  isBookingWithinDays,
  computeVisitTrendFromBundle,
};
