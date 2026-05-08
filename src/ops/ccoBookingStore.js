const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const BOOKING_STATUSES = Object.freeze([
  'needs_triage',
  'slots_ready',
  'offered',
  'waiting_customer',
  'confirmed_external',
  'cancelled',
  'closed',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeStatus(value) {
  const normalized = normalizeKey(value);
  return BOOKING_STATUSES.includes(normalized) ? normalized : 'needs_triage';
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    cases: [],
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeCandidateSlot(slot = {}) {
  const safe = asObject(slot);
  const startsAt = normalizeText(safe.startsAt || safe.start || safe.from || safe.dateTime);
  const resourceId = normalizeText(safe.resourceId || safe.resId || safe.staffId);
  const serviceId = normalizeText(safe.serviceId || safe.srvId);
  const slotId =
    normalizeText(safe.slotId || safe.id) ||
    [startsAt, resourceId, serviceId].filter(Boolean).join('::');
  if (!slotId || !startsAt) return null;
  return {
    slotId,
    startsAt,
    endsAt: normalizeText(safe.endsAt || safe.end || safe.to),
    resourceId,
    resourceLabel: normalizeText(safe.resourceLabel || safe.resourceName || safe.staffName),
    serviceId,
    serviceLabel: normalizeText(safe.serviceLabel || safe.serviceName),
    locationLabel: normalizeText(safe.locationLabel || safe.locationName),
    source: normalizeText(safe.source) || 'cliento',
  };
}

function createEventId() {
  return `booking-event-${crypto.randomUUID()}`;
}

function normalizeBookingEvent(event = {}) {
  const safe = asObject(event);
  const type = normalizeText(safe.type) || 'note';
  const label = normalizeText(safe.label);
  const detail = normalizeText(safe.detail);
  const metadata = asObject(safe.metadata);
  if (!label && !detail) return null;
  return {
    eventId: normalizeText(safe.eventId) || createEventId(),
    type,
    label: label || detail,
    detail,
    metadata: { ...metadata },
    previousStatus: normalizeText(safe.previousStatus),
    nextStatus: normalizeText(safe.nextStatus),
    actorUserId: normalizeText(safe.actorUserId),
    actorName: normalizeText(safe.actorName),
    createdAt: normalizeText(safe.createdAt) || nowIso(),
  };
}

function cloneBookingCase(item) {
  return item
    ? {
        ...item,
        selectedSlots: asArray(item.selectedSlots).map((slot) => ({ ...slot })),
        events: asArray(item.events).map((event) => ({ ...event })),
        blocker: buildBookingCaseBlockerReadout(item),
      }
    : null;
}

function normalizeBookingCase(input = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const workspaceId = normalizeText(safe.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  if (!tenantId || !workspaceId || !conversationId || !customerEmail) return null;

  const createdAt = normalizeText(safe.createdAt) || nowIso();
  const selectedSlots = asArray(safe.selectedSlots)
    .map((slot) => normalizeCandidateSlot(slot))
    .filter(Boolean)
    .slice(0, 3);
  const events = asArray(safe.events)
    .map((event) => normalizeBookingEvent(event))
    .filter(Boolean)
    .slice(-50);

  return {
    bookingCaseId: normalizeText(safe.bookingCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    status: normalizeStatus(safe.status),
    source: normalizeText(safe.source) || 'operator',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    requestedTreatment: normalizeText(safe.requestedTreatment),
    preferredWindow: normalizeText(safe.preferredWindow),
    notes: normalizeText(safe.notes),
    selectedSlots,
    events,
    offeredAt: normalizeText(safe.offeredAt),
    confirmedExternalAt: normalizeText(safe.confirmedExternalAt),
    closedAt: normalizeText(safe.closedAt),
    createdAt,
    updatedAt: normalizeText(safe.updatedAt) || createdAt,
  };
}

function createStatusEvent(status, previousStatus = '') {
  const normalized = normalizeStatus(status);
  const labels = {
    needs_triage: 'Bokning kräver triage',
    slots_ready: 'Tider redo för validering',
    offered: 'Erbjudande infogat i Studio',
    waiting_customer: 'Väntar på kundsvar',
    confirmed_external: 'Bekräftad externt',
    cancelled: 'Bokningen avbröts',
    closed: 'Bokningsärendet stängdes',
  };
  const previous = normalizeStatus(previousStatus);
  if (normalized === 'confirmed_external') {
    return {
      type: 'external_confirmation_marked',
      label: labels[normalized],
      detail: 'Operatören markerade extern bekräftelse. Ingen direkt Cliento-write gjordes av CCO.',
    };
  }
  return {
    type: normalized === 'offered' ? 'offer_draft_inserted' : 'status_changed',
    label: labels[normalized] || 'Bokningsstatus uppdaterad',
    previousStatus: previous && previous !== normalized ? previous : '',
    nextStatus: normalized,
    detail: previous && previous !== normalized
      ? `${previous} → ${normalized}`
      : `Status: ${normalized}`,
  };
}

function createSlotsEvent(slots = []) {
  const count = asArray(slots).length;
  return {
    type: count ? 'candidate_slots_selected' : 'candidate_slots_cleared',
    label: count ? `${count} kandidat-tider valda` : 'Kandidat-tider rensades',
    detail: count
      ? 'Operatören valde tider som kan erbjudas efter manuell validering.'
      : 'Operatören tog bort valda kandidat-tider.',
  };
}

function hasBookingEvent(bookingCase = {}, eventTypes = []) {
  const types = new Set(asArray(eventTypes).map((item) => normalizeKey(item)).filter(Boolean));
  if (!types.size) return false;
  return asArray(bookingCase.events).some((event) => types.has(normalizeKey(event.type)));
}

function hoursSinceIso(value) {
  const ms = Date.parse(normalizeText(value));
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / 36e5);
}

function getBookingCaseBlockerScore(bookingCase = {}) {
  return buildBookingCaseBlockerReadout(bookingCase).score;
}

function buildBookingCaseBlockerReadout(bookingCase = {}) {
  const status = normalizeStatus(bookingCase.status);
  if (status === 'cancelled' || status === 'closed') {
    return {
      key: '',
      label: 'Redo',
      score: 0,
      action: '',
      nextActionLabel: status === 'closed' ? 'stängd' : 'avbruten',
      tone: 'closed',
    };
  }
  const slotCount = asArray(bookingCase.selectedSlots).length;
  const hasOffer =
    status === 'offered' ||
    status === 'waiting_customer' ||
    Boolean(normalizeText(bookingCase.offeredAt)) ||
    hasBookingEvent(bookingCase, ['offer_draft_inserted']);
  if (!slotCount) {
    return {
      key: 'candidate_slots',
      label: 'Saknar tider',
      score: 30,
      action: 'candidate_slots',
      nextActionLabel: 'välj kandidat-tider',
      tone: 'attention',
    };
  }
  if (!hasOffer) {
    return {
      key: 'insert_studio',
      label: 'Saknar Studio',
      score: 20,
      action: 'insert_studio',
      nextActionLabel: 'infoga i Studio',
      tone: 'attention',
    };
  }
  if (status === 'waiting_customer') {
    const waitingHours = hoursSinceIso(bookingCase.updatedAt || bookingCase.offeredAt);
    return {
      key: 'customer_state',
      label: waitingHours >= 24 ? 'Saknar uppföljning' : 'Kundsvar pågår',
      score: waitingHours >= 24 ? 15 : 10,
      action: waitingHours >= 24 ? 'schedule_followup' : 'confirm_external',
      nextActionLabel: waitingHours >= 24 ? 'schemalägg uppföljning' : 'bevaka kundsvar',
      tone: waitingHours >= 24 ? 'attention' : 'waiting',
    };
  }
  if (status === 'confirmed_external') {
    return {
      key: 'customer_state',
      label: 'Redo att stänga',
      score: 10,
      action: 'set_status:closed',
      nextActionLabel: 'stäng ärendet',
      tone: 'ready',
    };
  }
  return {
    key: 'customer_state',
    label: 'Saknar kundläge',
    score: 10,
    action: 'waiting_customer',
    nextActionLabel: 'markera kundläge',
    tone: 'stable',
  };
}

function getBookingCaseTimeMs(bookingCase = {}) {
  const latestEvent = asArray(bookingCase.events).at(-1);
  const ms = Date.parse(normalizeText(bookingCase.updatedAt || latestEvent?.createdAt));
  return Number.isFinite(ms) ? ms : 0;
}

function caseKey(input = {}) {
  return [
    normalizeText(input.tenantId),
    normalizeText(input.workspaceId) || 'major-arcana-preview',
    normalizeText(input.conversationId),
    normalizeKey(input.customerEmail || input.customerId),
  ].join('::');
}

async function createCcoBookingStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBookingStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    cases: asArray(state?.cases).map((item) => normalizeBookingCase(item)).filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function upsertCase(input = {}) {
    const normalized = normalizeBookingCase(input);
    if (!normalized) {
      throw new Error('Bokningsärendet saknar obligatoriska fält.');
    }
    const key = caseKey(normalized);
    const existingIndex = state.cases.findIndex((item) => caseKey(item) === key);
    const ts = nowIso();
    if (existingIndex >= 0) {
      const existing = state.cases[existingIndex];
      const events = normalized.events.length ? normalized.events : existing.events;
      state.cases[existingIndex] = {
        ...existing,
        ...normalized,
        bookingCaseId: existing.bookingCaseId,
        events,
        createdAt: existing.createdAt,
        updatedAt: ts,
      };
    } else {
      state.cases.push({
        ...normalized,
        events: normalized.events.length
          ? normalized.events
          : [
              normalizeBookingEvent({
                type: 'case_created',
                label: 'Bokningsärende öppnat',
                detail: 'Operatörsytan skapade ett additivt bokningsärende för tråden.',
              }),
            ].filter(Boolean),
        createdAt: ts,
        updatedAt: ts,
      });
    }
    await save();
    return cloneBookingCase(state.cases[existingIndex >= 0 ? existingIndex : state.cases.length - 1]);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    const match = state.cases.find((item) => caseKey(item) === key);
    return cloneBookingCase(match);
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function updateStatus(input = {}) {
    const existing = await ensureCase(input);
    const status = normalizeStatus(input.status);
    const ts = nowIso();
    return upsertCase({
      ...existing,
      status,
      events: [
        ...asArray(existing.events),
        normalizeBookingEvent({
          ...createStatusEvent(status, existing.status),
          actorUserId: normalizeText(input.ownerUserId),
          actorName: normalizeText(input.ownerName),
        }),
      ].filter(Boolean).slice(-50),
      ownerUserId: normalizeText(input.ownerUserId) || existing.ownerUserId,
      ownerName: normalizeText(input.ownerName) || existing.ownerName,
      notes: normalizeText(input.notes) || existing.notes,
      offeredAt: status === 'offered' ? ts : existing.offeredAt,
      confirmedExternalAt:
        status === 'confirmed_external' ? ts : existing.confirmedExternalAt,
      closedAt: status === 'closed' || status === 'cancelled' ? ts : existing.closedAt,
    });
  }

  async function setCandidateSlots(input = {}) {
    const slots = asArray(input.selectedSlots || input.slots)
      .map((slot) => normalizeCandidateSlot(slot))
      .filter(Boolean)
      .slice(0, 3);
    const existing = await ensureCase(input);
    return upsertCase({
      ...existing,
      selectedSlots: slots,
      status: slots.length ? 'slots_ready' : existing.status,
      events: [
        ...asArray(existing.events),
        normalizeBookingEvent({
          ...createSlotsEvent(slots),
          actorUserId: normalizeText(input.ownerUserId),
          actorName: normalizeText(input.ownerName),
        }),
      ].filter(Boolean).slice(-50),
      notes: normalizeText(input.notes) || existing.notes,
      ownerUserId: normalizeText(input.ownerUserId) || existing.ownerUserId,
      ownerName: normalizeText(input.ownerName) || existing.ownerName,
    });
  }

  async function addEvent(input = {}) {
    const existing = await ensureCase(input);
    return upsertCase({
      ...existing,
      events: [
        ...asArray(existing.events),
        normalizeBookingEvent({
          type: input.type,
          label: input.label,
          detail: input.detail,
          metadata: input.metadata,
          actorUserId: normalizeText(input.ownerUserId),
          actorName: normalizeText(input.ownerName),
        }),
      ].filter(Boolean).slice(-50),
      ownerUserId: normalizeText(input.ownerUserId) || existing.ownerUserId,
      ownerName: normalizeText(input.ownerName) || existing.ownerName,
    });
  }

  async function listCases({ tenantId, customerEmail, status, sort = 'recent', limit = 50 } = {}) {
    const tenant = normalizeText(tenantId);
    const customer = normalizeKey(customerEmail);
    const normalizedStatus = normalizeKey(status);
    const normalizedSort = normalizeKey(sort) === 'blocked' ? 'blocked' : 'recent';
    const max = Math.max(1, Math.min(200, Number(limit) || 50));
    return state.cases
      .filter((item) => !tenant || item.tenantId === tenant)
      .filter((item) => !customer || item.customerEmail === customer)
      .filter((item) => !normalizedStatus || item.status === normalizedStatus)
      .sort((a, b) => {
        if (normalizedSort === 'blocked') {
          const scoreDelta = getBookingCaseBlockerScore(b) - getBookingCaseBlockerScore(a);
          if (scoreDelta) return scoreDelta;
        }
        return getBookingCaseTimeMs(b) - getBookingCaseTimeMs(a);
      })
      .slice(0, max)
      .map((item) => cloneBookingCase(item));
  }

  return {
    addEvent,
    ensureCase,
    getCase,
    listCases,
    setCandidateSlots,
    updateStatus,
    upsertCase,
    _state: state,
  };
}

module.exports = {
  BOOKING_STATUSES,
  createCcoBookingStore,
  normalizeBookingEvent,
  normalizeCandidateSlot,
  normalizeBookingCase,
  getBookingCaseBlockerScore,
  buildBookingCaseBlockerReadout,
};
