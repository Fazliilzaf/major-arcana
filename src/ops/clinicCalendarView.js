'use strict';

/**
 * Read-only clinic calendar assembled from the existing CCO booking engine and
 * Cliento booking store. All timestamps are presented in clinic local time.
 */

const {
  brandForClientoServiceLabel,
  brandForClientoServiceId,
  normalizeBrandKey,
} = require('../brand/clientoServiceBrand');

/**
 * Varumärke för en Cliento-rad. srvId först, namnet som fallback.
 *
 * srvId är unikt per tjänst; namnet är det inte. "Uppföljning via telefon" bärs
 * av srvId 60041 (Hair TP) och 60223 (Curatiio) och kan därför inte klassas på
 * namn — namnuppslaget lämnar den medvetet omappad (''). Med ID:t blir svaret
 * exakt. Raden bär ID bara när den importerats efter att "Tjänste-id" började
 * läsas; äldre rader faller tillbaka på namnet precis som förut.
 */
function brandForClientoEntry(entry) {
  return (
    brandForClientoServiceId(entry?.serviceId) || brandForClientoServiceLabel(entry?.serviceLabel)
  );
}

const CLINIC_TIME_ZONE = 'Europe/Stockholm';
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'deleted']);
const ACTIVE_RESERVATION_STATUSES = new Set(['active', 'held', 'pending', 'reserved']);

const clinicDateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clinicDateTimeParts(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = {};
  for (const part of clinicDateTimeFormatter.formatToParts(parsed)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  if (!parts.year || !parts.month || !parts.day) return null;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour || '00'}:${parts.minute || '00'}`,
  };
}

function clinicToday() {
  return clinicDateTimeParts(new Date())?.date || new Date().toISOString().slice(0, 10);
}

function normalizeDateOnly(value, fallback = clinicToday()) {
  const raw = normalizeText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
    ? raw
    : fallback;
}

function addDays(dateOnly, days) {
  const parsed = new Date(`${normalizeDateOnly(dateOnly)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function durationMinutes(startsAt, endsAt, explicitDuration) {
  const explicit = Number(explicitDuration);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  const diff = endMs - startMs;
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff / 60000) : 30;
}

function resolveEndsAt(startsAt, endsAt, explicitDuration) {
  const parsedEnd = Date.parse(endsAt);
  if (Number.isFinite(parsedEnd)) return new Date(parsedEnd).toISOString();
  const parsedStart = Date.parse(startsAt);
  if (!Number.isFinite(parsedStart)) return '';
  return new Date(
    parsedStart + durationMinutes(startsAt, '', explicitDuration) * 60000
  ).toISOString();
}

function inferredResourceId(label) {
  const key = normalizeKey(label)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key ? `cliento-${key}` : '';
}

const TITLE_TOKENS = new Set(['dr', 'leg', 'sjukskoterska', 'underskoterska']);

// Cliento har virtuella banor (t.ex. "Fysisk konsultation", "Online konsultation")
// som egentligen är tjänstkanaler, inte resurser. De ska inte skapa egna
// resurskolumner eller dyka upp i resursfiltret.
const VIRTUAL_LANE_LABELS = new Set([
  normalizeKey('Fysisk konsultation'),
  normalizeKey('Online konsultation'),
]);

function buildResourceIndex(bookingEngineStore) {
  const resources = asArray(bookingEngineStore?._state?.resources)
    .filter((resource) => resource && resource.active !== false && normalizeText(resource.id))
    .map((resource) => ({
      resourceId: normalizeText(resource.id),
      resourceLabel: normalizeText(resource.label) || normalizeText(resource.id),
      role: normalizeText(resource.role) || 'Behandlare',
    }));
  const byLabel = new Map(
    resources.map((resource) => [normalizeKey(resource.resourceLabel), resource.resourceId])
  );
  // Cliento-bokningar har ofta bara förnamnet (t.ex. "Egzona") medan motorn
  // lagrar hela namnet ("Egzona Krasniqi"). Utan den här kartan får samma
  // person två resourceId — t.ex. "egzona" och "cliento-egzona" — vilket
  // gör att resursfiltret i kalendern döljer halva bokningarna.
  const byToken = new Map();
  for (const resource of resources) {
    const tokens = normalizeKey(resource.resourceLabel)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !TITLE_TOKENS.has(token));
    for (const token of tokens) {
      const existing = byToken.get(token);
      if (existing === undefined) {
        byToken.set(token, resource.resourceId);
      } else if (existing !== resource.resourceId) {
        byToken.set(token, null); // tvetydigt — lita inte på enskilt token
      }
    }
  }
  return { resources, byLabel, byToken };
}

function normalizeEngineEntry(raw, type = 'booking') {
  const slot = raw?.slot && typeof raw.slot === 'object' ? raw.slot : raw || {};
  const startsAt = normalizeText(slot.startsAt || raw?.startsAt);
  if (!Number.isFinite(Date.parse(startsAt))) return null;
  const resolvedEndsAt = resolveEndsAt(
    startsAt,
    normalizeText(slot.endsAt || raw?.endsAt),
    slot.durationMinutes || raw?.durationMinutes
  );
  const status = type === 'reservation' ? 'pending' : normalizeKey(raw?.status) || 'confirmed';
  return {
    id: normalizeText(raw?.bookingId || raw?.reservationId || raw?.id),
    type,
    tenantId: normalizeText(raw?.tenantId),
    workspaceId: normalizeText(raw?.workspaceId),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: resolvedEndsAt,
    durationMinutes: durationMinutes(startsAt, resolvedEndsAt, slot.durationMinutes),
    resourceId: normalizeText(slot.resourceId || raw?.resourceId),
    resourceLabel: normalizeText(slot.resourceLabel || raw?.resourceLabel),
    serviceId: normalizeText(slot.serviceId || raw?.serviceId),
    serviceLabel: normalizeText(slot.serviceLabel || raw?.serviceLabel),
    locationLabel: normalizeText(slot.locationLabel || raw?.locationLabel),
    patientName: normalizeText(raw?.customerName || raw?.contact?.name),
    patientEmail: normalizeKey(raw?.customerEmail || raw?.contact?.email),
    patientPhone: normalizeText(raw?.customerPhone || raw?.contact?.phone),
    // Motorn kallar fältet canonicalPatientId, storen och vyn kallar det
    // patientId. Namnet översätts här, en gång, i stället för i varje läsare.
    patientId: normalizeText(raw?.canonicalPatientId || raw?.patientId),
    patientIdResolutionStatus: normalizeText(raw?.patientIdResolutionStatus),
    conversationId: normalizeText(raw?.conversationId),
    status,
    source: type === 'reservation' ? 'cco_booking_reservation' : 'cco_booking_engine',
    notes: normalizeText(raw?.notes),
  };
}

function normalizeClientoEntry(raw, resourceIndex) {
  const startsAt = normalizeText(raw?.startsAt);
  if (!Number.isFinite(Date.parse(startsAt))) return null;
  const staffName = normalizeText(raw?.staffName || raw?.staff);
  const staffKey = normalizeKey(staffName);
  const isVirtualLane = VIRTUAL_LANE_LABELS.has(staffKey);
  const tokenMatch = isVirtualLane ? undefined : resourceIndex.byToken.get(staffKey);
  const resourceId = isVirtualLane
    ? '_unassigned'
    : resourceIndex.byLabel.get(staffKey) ||
      tokenMatch ||
      undefined ||
      inferredResourceId(staffName);
  const resolvedEndsAt = resolveEndsAt(startsAt, normalizeText(raw?.endsAt), raw?.durationMinutes);
  return {
    id: normalizeText(raw?.bookingId || raw?.id),
    // Blockerad tid (Cliento "Reservation") är ingen patientbokning. Historiska
    // rader utan fältet behåller 'booking' — ingen tyst omklassning.
    type: raw?.isReservation === true ? 'reservation' : 'booking',
    tenantId: '',
    workspaceId: normalizeText(raw?.workspaceId) || '',
    startsAt: new Date(startsAt).toISOString(),
    endsAt: resolvedEndsAt,
    durationMinutes: durationMinutes(startsAt, resolvedEndsAt, raw?.durationMinutes),
    resourceId,
    resourceLabel: staffName,
    // Cliento-tjänstens ID när storen bär det. Var hårdkodat till '' innan
    // importen började läsa "Tjänste-id" — det gjorde varumärkesfiltret
    // beroende av tjänstenamnet, som inte alltid är entydigt.
    serviceId: normalizeText(raw?.serviceId || raw?.srvId),
    serviceLabel: normalizeText(raw?.serviceLabel || raw?.service),
    locationLabel: normalizeText(raw?.locationName || raw?.location),
    patientName: normalizeText(raw?.customerName),
    patientEmail: normalizeKey(raw?.customerEmail),
    patientPhone: normalizeText(raw?.customerPhone || raw?.phone),
    // Satt av migreringen 2026-08-20 på 42 051 av 53 316 bokningar. Statusen
    // följer med så att gränssnittet kan skilja "saknar identitet" från
    // "tvetydig identitet" — det förra är en återvändsgränd, det senare något
    // en människa kan lösa.
    patientId: normalizeText(raw?.patientId),
    patientIdResolutionStatus: normalizeText(raw?.patientIdResolutionStatus),
    conversationId: normalizeText(raw?.conversationId),
    status: normalizeKey(raw?.status) || 'unknown',
    source: normalizeText(raw?.source) || 'cliento',
    notes: normalizeText(raw?.notes),
  };
}

function dedupeKey(entry) {
  const startMs = Date.parse(entry.startsAt);
  return [
    entry.patientEmail,
    Number.isFinite(startMs) ? String(startMs) : entry.startsAt,
    normalizeKey(entry.serviceLabel || entry.serviceId),
    normalizeKey(entry.resourceLabel || entry.resourceId),
  ].join('::');
}

function listEngineRows(bookingEngineStore, tenantId) {
  if (!bookingEngineStore) return [];
  if (typeof bookingEngineStore.listBookingsForEnrichment === 'function') {
    return asArray(
      bookingEngineStore.listBookingsForEnrichment(tenantId, { excludeTestData: true })
    );
  }
  return asArray(bookingEngineStore._state?.bookings).filter(
    (booking) => normalizeText(booking?.tenantId) === tenantId && !booking?.isTestData
  );
}

function listClientoRows(clientoBookingStore, tenantId) {
  if (!clientoBookingStore || typeof clientoBookingStore.listAllBookings !== 'function') return [];
  return asArray(clientoBookingStore.listAllBookings({ tenantId }));
}

function collectCalendarEntries({
  bookingEngineStore,
  clientoBookingStore,
  tenantId,
  resolveConversationId = null,
  brand = '',
}) {
  const scopedTenantId = normalizeText(tenantId);
  const scopedBrand = normalizeBrandKey(brand);
  const resourceIndex = buildResourceIndex(bookingEngineStore);
  const entries = [];
  const seenIds = new Set();
  const seenComposite = new Set();

  function push(entry) {
    if (!entry || CANCELLED_STATUSES.has(normalizeKey(entry.status))) return;
    const idKey = entry.id ? `${entry.source}::${entry.id}` : '';
    const crossSourceId = entry.id ? `id::${entry.id}` : '';
    const composite = dedupeKey(entry);
    if (
      (idKey && seenIds.has(idKey)) ||
      (crossSourceId && seenIds.has(crossSourceId)) ||
      seenComposite.has(composite)
    ) {
      return;
    }
    if (idKey) seenIds.add(idKey);
    if (crossSourceId) seenIds.add(crossSourceId);
    seenComposite.add(composite);
    entries.push(entry);
  }

  for (const raw of listEngineRows(bookingEngineStore, scopedTenantId)) {
    if (normalizeText(raw?.tenantId) !== scopedTenantId) continue;
    push(normalizeEngineEntry(raw, 'booking'));
  }

  for (const raw of asArray(bookingEngineStore?._state?.reservations)) {
    if (normalizeText(raw?.tenantId) !== scopedTenantId) continue;
    if (!ACTIVE_RESERVATION_STATUSES.has(normalizeKey(raw?.status))) continue;
    if (raw?.isTestData) continue;
    push(normalizeEngineEntry(raw, 'reservation'));
  }

  for (const raw of listClientoRows(clientoBookingStore, scopedTenantId)) {
    const entry = normalizeClientoEntry(raw, resourceIndex);
    // Läs-sidans varumärkesfilter.
    //   hair-tp-clinic: dölj kända Curatiio-tjänster, behåll övrigt
    //     (inkl. omatchade legacy-tjänster — annars döljs legit Hair TP-historik).
    //   curatiio: fail-closed — visa bara Curatiio-tjänster.
    if (scopedBrand === 'curatiio') {
      if (brandForClientoEntry(entry) !== 'curatiio') continue;
    } else if (scopedBrand === 'hair-tp-clinic') {
      if (brandForClientoEntry(entry) === 'curatiio') continue;
    }
    push(entry);
  }

  // Fas 2.2: om en bokning saknar conversationId, försök härleda det från
  // patientens epost via den injicerade resolvern (read-only, muterar ej storen).
  if (typeof resolveConversationId === 'function') {
    for (const entry of entries) {
      if (entry.conversationId) continue;
      try {
        const resolved = resolveConversationId({
          patientEmail: entry.patientEmail,
          patientName: entry.patientName,
          patientPhone: entry.patientPhone,
        });
        if (resolved) entry.conversationId = normalizeText(resolved);
      } catch (_err) {
        /* best-effort */
      }
    }
  }

  entries.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  return {
    entries,
    resources: resourceIndex.resources,
    dataSources: {
      bookingEngine: bookingEngineStore ? 'ready' : 'unavailable',
      cliento: clientoBookingStore ? 'ready' : 'unavailable',
    },
  };
}

function toSlot(entry) {
  const start = clinicDateTimeParts(entry.startsAt);
  const end = clinicDateTimeParts(entry.endsAt);
  return {
    id: entry.id,
    type: entry.type,
    time: start?.time || '',
    endTime: end?.time || '',
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    durationMinutes: entry.durationMinutes,
    resourceId: entry.resourceId,
    resourceLabel: entry.resourceLabel,
    serviceId: entry.serviceId,
    serviceLabel: entry.serviceLabel,
    patientName: entry.patientName,
    patientEmail: entry.patientEmail,
    patientPhone: entry.patientPhone,
    // Samma nyckel som patientEmail, men med det namn bokningsmotorn forvantar
    // sig nar den ska skriva (t.ex. ombokning). Undviker gissningar i UI.
    customerEmail: entry.patientEmail,
    // Utan det här fältet kan /calendar/day och /week inte länka till ett
    // kundkort, oavsett hur väl datan är kopplad i storen.
    patientId: entry.patientId,
    patientIdResolutionStatus: entry.patientIdResolutionStatus,
    // Klienten har sedan tidigare ett eget ordforrad for identitetslaget och
    // vagrar koppla en bokning vars identitet ar tvetydig. Den logiken finns
    // redan i cco-kalender-shell.js — den har bara aldrig fatt veta. Har
    // oversatts storens ord till klientens, pa ett stalle.
    identityMatchStatus:
      entry.identityMatchStatus ||
      (entry.patientIdResolutionStatus === 'ambiguous_identity' ? 'ambiguous' : ''),
    conversationId: entry.conversationId,
    workspaceId: entry.workspaceId,
    status: entry.status,
    source: entry.source,
    locationLabel: entry.locationLabel,
    notes: entry.notes,
  };
}

function buildDayView({
  date,
  bookingEngineStore,
  clientoBookingStore,
  encounterStore,
  tenantId,
  calendarData,
  resolveConversationId = null,
  brand = '',
}) {
  void encounterStore;
  const targetDate = normalizeDateOnly(date);
  const data =
    calendarData ||
    collectCalendarEntries({
      bookingEngineStore,
      clientoBookingStore,
      tenantId,
      resolveConversationId,
      brand,
    });
  const resources = data.resources.map((resource) => ({ ...resource, slots: [] }));
  const byResource = new Map(resources.map((resource) => [resource.resourceId, resource]));
  const dayEntries = data.entries.filter(
    (entry) => clinicDateTimeParts(entry.startsAt)?.date === targetDate
  );

  for (const entry of dayEntries) {
    let resourceId = entry.resourceId;
    if (!resourceId && entry.resourceLabel) resourceId = inferredResourceId(entry.resourceLabel);
    if (resourceId && !byResource.has(resourceId)) {
      const resource = {
        resourceId,
        resourceLabel: entry.resourceLabel || resourceId,
        role: 'Behandlare',
        slots: [],
      };
      resources.push(resource);
      byResource.set(resourceId, resource);
    }
    if (!resourceId) resourceId = '_unassigned';
    if (!byResource.has(resourceId)) {
      const resource = {
        resourceId: '_unassigned',
        resourceLabel: 'Ej tilldelad',
        role: '',
        slots: [],
      };
      resources.push(resource);
      byResource.set(resourceId, resource);
    }
    byResource.get(resourceId).slots.push(toSlot(entry));
  }

  const sourceCounts = dayEntries.reduce(
    (counts, entry) => {
      const key = entry.source.startsWith('cco_booking') ? 'bookingEngine' : 'cliento';
      counts[key] += 1;
      return counts;
    },
    { bookingEngine: 0, cliento: 0 }
  );

  return {
    date: targetDate,
    totalSlots: dayEntries.length,
    confirmedBookings: dayEntries.filter((entry) => entry.type === 'booking').length,
    pendingReservations: dayEntries.filter((entry) => entry.type === 'reservation').length,
    resources,
    dataSources: clone(data.dataSources),
    sourceCounts,
  };
}

function buildWeekView({
  startDate,
  bookingEngineStore,
  clientoBookingStore,
  encounterStore,
  tenantId,
  resolveConversationId = null,
  brand = '',
}) {
  const normalizedStart = normalizeDateOnly(startDate);
  const calendarData = collectCalendarEntries({
    bookingEngineStore,
    clientoBookingStore,
    tenantId,
    resolveConversationId,
    brand,
  });
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(normalizedStart, index);
    const dayView = buildDayView({
      date,
      bookingEngineStore,
      clientoBookingStore,
      encounterStore,
      tenantId,
      calendarData,
      resolveConversationId,
      brand,
    });
    days.push({
      ...dayView,
      weekday: new Date(`${date}T12:00:00.000Z`).toLocaleDateString('sv-SE', {
        weekday: 'short',
        timeZone: 'UTC',
      }),
    });
  }
  return {
    startDate: normalizedStart,
    totalSlots: days.reduce((sum, day) => sum + day.totalSlots, 0),
    days,
    dataSources: clone(calendarData.dataSources),
  };
}

module.exports = {
  CLINIC_TIME_ZONE,
  buildDayView,
  buildWeekView,
  buildResourceIndex,
  clinicDateTimeParts,
  collectCalendarEntries,
  inferredResourceId,
  normalizeDateOnly,
};
