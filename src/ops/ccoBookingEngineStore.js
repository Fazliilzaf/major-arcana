const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

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

function normalizeWeekdays(value) {
  const weekdays = asArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return weekdays.length ? Array.from(new Set(weekdays)) : [1, 2, 3, 4, 5];
}

function normalizeStartTimes(value) {
  const times = asArray(value)
    .map((item) => normalizeText(item))
    .filter((item) => /^\d{2}:\d{2}$/.test(item));
  return times.length ? Array.from(new Set(times)) : ['09:30', '13:30', '15:00'];
}

function normalizeDateOnly(value) {
  const raw = normalizeText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeIso(value) {
  const raw = normalizeText(value);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function addMinutes(isoString, minutesToAdd) {
  const ms = Date.parse(normalizeText(isoString));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + Math.max(0, Number(minutesToAdd) || 0) * 60 * 1000).toISOString();
}

function toSlotId({ resourceId = '', serviceId = '', startsAt = '' } = {}) {
  return [normalizeText(resourceId), normalizeText(serviceId), normalizeIso(startsAt)]
    .filter(Boolean)
    .join('::');
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

function defaultState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    resources: [
      { id: 'egzona', label: 'Egzona', active: true },
      { id: 'dr-eriksson', label: 'Dr. Eriksson', active: true },
      { id: 'dr-sara', label: 'Dr. Sara', active: true },
    ],
    services: [
      { id: 'consultation', label: 'Konsultation', durationMinutes: 60, active: true },
      { id: 'prp', label: 'PRP-behandling', durationMinutes: 45, active: true },
      { id: 'transplant-followup', label: 'Efterkontroll', durationMinutes: 30, active: true },
    ],
    availabilityRules: [
      {
        ruleId: 'rule-consultation-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:30', '13:30', '15:00'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-consultation-eriksson',
        resourceId: 'dr-eriksson',
        serviceId: 'consultation',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-prp-sara',
        resourceId: 'dr-sara',
        serviceId: 'prp',
        weekdays: [2, 4],
        startTimes: ['11:00', '15:30'],
        locationLabel: 'Hair TP Clinic',
      },
    ],
    reservations: [],
    bookings: [],
  };
}

function normalizeResource(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  return {
    id,
    label: normalizeText(safe.label || safe.name || id),
    active: safe.active !== false,
  };
}

function normalizeService(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  return {
    id,
    label: normalizeText(safe.label || safe.title || safe.name || id),
    durationMinutes: Math.max(15, Number(safe.durationMinutes) || 60),
    active: safe.active !== false,
  };
}

function normalizeAvailabilityRule(input = {}) {
  const safe = asObject(input);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!resourceId || !serviceId) return null;
  return {
    ruleId: normalizeText(safe.ruleId) || crypto.randomUUID(),
    resourceId,
    serviceId,
    weekdays: normalizeWeekdays(safe.weekdays),
    startTimes: normalizeStartTimes(safe.startTimes),
    locationLabel: normalizeText(safe.locationLabel || 'Hair TP Clinic'),
    active: safe.active !== false,
  };
}

function normalizeEngineSlot(slot = {}, services = [], resources = []) {
  const safe = asObject(slot);
  const startsAt = normalizeIso(safe.startsAt || safe.start);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!startsAt || !resourceId || !serviceId) return null;
  const service =
    asArray(services).find((item) => normalizeText(item.id) === serviceId) ||
    asObject(safe.service);
  const resource =
    asArray(resources).find((item) => normalizeText(item.id) === resourceId) ||
    asObject(safe.resource);
  return {
    slotId: normalizeText(safe.slotId || safe.id) || toSlotId({ resourceId, serviceId, startsAt }),
    startsAt,
    endsAt:
      normalizeIso(safe.endsAt || safe.end) ||
      addMinutes(startsAt, Number(service.durationMinutes) || 60),
    resourceId,
    resourceLabel: normalizeText(safe.resourceLabel || resource.label || resource.name),
    serviceId,
    serviceLabel: normalizeText(safe.serviceLabel || service.label || service.title),
    locationLabel: normalizeText(safe.locationLabel || safe.locationName || 'Hair TP Clinic'),
    source: 'cco_engine',
  };
}

function normalizeReservation(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  return {
    reservationId: normalizeText(safe.reservationId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    slot,
    status: normalizeKey(safe.status) || 'active',
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
    expiresAt: normalizeIso(safe.expiresAt),
  };
}

function normalizeBookingRecord(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  return {
    bookingId: normalizeText(safe.bookingId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    slot,
    status: normalizeKey(safe.status) || 'confirmed',
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    confirmedAt: normalizeIso(safe.confirmedAt) || nowIso(),
    cancelledAt: normalizeIso(safe.cancelledAt),
    cancellationReason: normalizeText(safe.cancellationReason),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isReservationExpired(reservation = {}, referenceMs = Date.now()) {
  const expiresAtMs = Date.parse(normalizeText(reservation.expiresAt));
  return Number.isFinite(expiresAtMs) && expiresAtMs <= referenceMs;
}

function getReservationExpiryMeta(reservations = [], referenceMs = Date.now()) {
  const activeReservations = asArray(reservations).filter(
    (item) => normalizeKey(item?.status) === 'active'
  );
  const nextExpiringReservation = activeReservations
    .map((item) => ({
      reservation: item,
      expiresAt: normalizeIso(item.expiresAt),
      expiresAtMs: Date.parse(normalizeText(item.expiresAt)),
    }))
    .filter((item) => Number.isFinite(item.expiresAtMs))
    .sort((left, right) => left.expiresAtMs - right.expiresAtMs)[0];
  if (!nextExpiringReservation) {
    return {
      nextExpiryAt: '',
      expiresInMinutes: null,
      expiresSoon: false,
    };
  }
  const expiresInMinutes = Math.max(
    0,
    Math.ceil((nextExpiringReservation.expiresAtMs - referenceMs) / (60 * 1000))
  );
  return {
    nextExpiryAt: nextExpiringReservation.expiresAt,
    expiresInMinutes,
    expiresSoon: expiresInMinutes <= 120,
  };
}

function buildDateRange(fromDate, toDate) {
  const start = normalizeDateOnly(fromDate);
  const end = normalizeDateOnly(toDate);
  if (!start || !end) return [];
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  const days = [];
  for (let current = startMs; current <= endMs; current += 24 * 60 * 60 * 1000) {
    days.push(new Date(current));
  }
  return days;
}

async function createCcoBookingEngineStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBookingEngineStore.');
  }

  const initial = await readJson(filePath, defaultState());
  const state = {
    ...defaultState(),
    ...(asObject(initial) || {}),
  };
  state.resources = asArray(state.resources).map(normalizeResource).filter(Boolean);
  state.services = asArray(state.services).map(normalizeService).filter(Boolean);
  state.availabilityRules = asArray(state.availabilityRules)
    .map(normalizeAvailabilityRule)
    .filter(Boolean);
  state.reservations = asArray(state.reservations)
    .map((item) => normalizeReservation(item, state))
    .filter(Boolean);
  state.bookings = asArray(state.bookings)
    .map((item) => normalizeBookingRecord(item, state))
    .filter(Boolean);

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function expireStaleReservations() {
    const referenceMs = Date.now();
    let changed = false;
    state.reservations = state.reservations.map((item) => {
      if (normalizeKey(item.status) !== 'active') return item;
      if (!isReservationExpired(item, referenceMs)) return item;
      changed = true;
      return {
        ...item,
        status: 'expired',
        updatedAt: nowIso(),
      };
    });
    if (changed) {
      await save();
    }
    return changed;
  }

  function getResourceById(resourceId) {
    return state.resources.find((item) => item.id === normalizeText(resourceId)) || null;
  }

  function getServiceById(serviceId) {
    return state.services.find((item) => item.id === normalizeText(serviceId)) || null;
  }

  function slotsOverlap(left = {}, right = {}) {
    const leftResourceId = normalizeText(left.resourceId);
    const rightResourceId = normalizeText(right.resourceId);
    if (!leftResourceId || !rightResourceId || leftResourceId !== rightResourceId) return false;
    const leftStart = Date.parse(normalizeText(left.startsAt));
    const leftEnd = Date.parse(normalizeText(left.endsAt));
    const rightStart = Date.parse(normalizeText(right.startsAt));
    const rightEnd = Date.parse(normalizeText(right.endsAt));
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) return false;
    if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) return false;
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function isSlotTaken(slot = {}, { excludeConversationId = '' } = {}) {
    const slotId = normalizeText(slot.slotId);
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      }) ||
      state.bookings.some((item) => {
        if (normalizeKey(item.status) !== 'confirmed') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      })
    );
  }

  function buildAvailabilitySlot(rule, day, timeLabel) {
    const dateOnly = day.toISOString().slice(0, 10);
    const startsAt = `${dateOnly}T${timeLabel}:00.000Z`;
    const service = getServiceById(rule.serviceId) || {};
    const resource = getResourceById(rule.resourceId) || {};
    return normalizeEngineSlot(
      {
        slotId: toSlotId({ resourceId: rule.resourceId, serviceId: rule.serviceId, startsAt }),
        startsAt,
        resourceId: rule.resourceId,
        resourceLabel: resource.label,
        serviceId: rule.serviceId,
        serviceLabel: service.label,
        locationLabel: rule.locationLabel,
      },
      state.services,
      state.resources
    );
  }

  async function listAvailability({
    tenantId,
    fromDate,
    toDate,
    resIds = '',
    srvIds = '',
    excludeConversationId = '',
  } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    if (!tenant) throw new Error('tenantId krävs för booking engine availability.');
    const resourceIds = normalizeText(resIds)
      ? normalizeText(resIds)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const serviceIds = normalizeText(srvIds)
      ? normalizeText(srvIds)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const days = buildDateRange(fromDate, toDate);
    const slots = [];
    days.forEach((day) => {
      const weekday = day.getUTCDay();
      state.availabilityRules
        .filter((rule) => rule.active !== false)
        .filter((rule) => !resourceIds.length || resourceIds.includes(rule.resourceId))
        .filter((rule) => !serviceIds.length || serviceIds.includes(rule.serviceId))
        .filter((rule) => asArray(rule.weekdays).includes(weekday))
        .forEach((rule) => {
          asArray(rule.startTimes).forEach((timeLabel) => {
            const slot = buildAvailabilitySlot(rule, day, timeLabel);
            if (slot && !isSlotTaken(slot, { excludeConversationId })) {
              slots.push(slot);
            }
          });
        });
    });
    slots.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    return clone(slots);
  }

  async function reserveSlots(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      throw new Error('Booking-reservation saknar tenant, conversation eller customer.');
    }
    const selectedSlots = asArray(input.selectedSlots || input.slots)
      .map((slot) => normalizeEngineSlot(slot, state.services, state.resources))
      .filter(Boolean)
      .slice(0, 3);
    selectedSlots.forEach((slot) => {
      if (isSlotTaken(slot, { excludeConversationId: conversationId })) {
        const error = new Error(`Tiden ${slot.startsAt} är inte längre ledig.`);
        error.statusCode = 409;
        throw error;
      }
    });
    state.reservations = state.reservations.filter((item) => {
      if (normalizeText(item.tenantId) !== tenantId) return true;
      if (normalizeText(item.conversationId) !== conversationId) return true;
      return normalizeKey(item.status) !== 'active';
    });
    const reservations = selectedSlots.map((slot) =>
      normalizeReservation(
        {
          tenantId,
          workspaceId: input.workspaceId,
          conversationId,
          customerEmail,
          customerName: input.customerName,
          ownerUserId: input.ownerUserId,
          ownerName: input.ownerName,
          slot,
          status: 'active',
          expiresAt: addMinutes(nowIso(), 72 * 60),
        },
        state
      )
    );
    state.reservations.push(...reservations);
    await save();
    return clone(reservations);
  }

  async function renewReservations(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      const error = new Error('Saknar aktiv reservation att förnya i CCO.');
      error.statusCode = 400;
      throw error;
    }
    const extensionMinutes = Math.max(60, Number(input.extensionMinutes) || 72 * 60);
    const renewedAt = nowIso();
    const nextExpiryAt = addMinutes(renewedAt, extensionMinutes);
    let renewedCount = 0;
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId) return item;
      if (item.conversationId !== conversationId) return item;
      if (item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      renewedCount += 1;
      return {
        ...item,
        updatedAt: renewedAt,
        expiresAt: nextExpiryAt,
      };
    });
    if (!renewedCount) {
      const error = new Error('Ingen aktiv reservation hittades att förnya.');
      error.statusCode = 404;
      throw error;
    }
    await save();
    return clone(
      state.reservations.filter((item) => {
        return (
          item.tenantId === tenantId &&
          item.conversationId === conversationId &&
          item.customerEmail === customerEmail &&
          normalizeKey(item.status) === 'active'
        );
      })
    );
  }

  async function getActiveReservations({ tenantId, conversationId, customerEmail } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    const conversation = normalizeText(conversationId);
    const customer = normalizeKey(customerEmail);
    return clone(
      state.reservations.filter((item) => {
        if (tenant && item.tenantId !== tenant) return false;
        if (conversation && item.conversationId !== conversation) return false;
        if (customer && item.customerEmail !== customer) return false;
        return normalizeKey(item.status) === 'active';
      })
    );
  }

  function buildCaseWorkflowSummary({ reservations = [], booking = null } = {}) {
    const activeReservations = asArray(reservations).filter(
      (item) => normalizeKey(item?.status) === 'active'
    );
    const confirmedBooking =
      booking && normalizeKey(booking.status) === 'confirmed' ? booking : null;
    const primaryReservation = activeReservations[0] || null;
    const primarySlot = confirmedBooking?.slot || primaryReservation?.slot || null;
    const expiryMeta = getReservationExpiryMeta(activeReservations);
    const workflowState = confirmedBooking
      ? 'confirmed'
      : activeReservations.length
        ? 'reserved'
        : 'idle';
    return {
      state: workflowState,
      stateLabel:
        workflowState === 'confirmed'
          ? 'Bekräftad'
          : workflowState === 'reserved'
            ? activeReservations.length === 1
              ? 'Reserverad'
              : `${activeReservations.length} reserverade`
            : 'Ingen reservation',
      recommendedAction:
        workflowState === 'confirmed'
          ? 'none'
          : workflowState === 'reserved'
            ? expiryMeta.expiresSoon
              ? 'renew_reservation'
              : 'confirm_external'
            : 'candidate_slots',
      reservationCount: activeReservations.length,
      hasReservations: activeReservations.length > 0,
      hasConfirmedBooking: Boolean(confirmedBooking),
      activeReservation: primaryReservation ? clone(primaryReservation) : null,
      primarySlot: primarySlot ? clone(primarySlot) : null,
      nextExpiryAt: expiryMeta.nextExpiryAt,
      expiresInMinutes: Number.isFinite(expiryMeta.expiresInMinutes)
        ? expiryMeta.expiresInMinutes
        : null,
      expiresSoon: expiryMeta.expiresSoon === true,
      stateReason:
        workflowState === 'confirmed'
          ? 'Bokningen är bekräftad i CCO:s egen bokningsmotor.'
          : workflowState === 'reserved'
            ? expiryMeta.nextExpiryAt
              ? expiryMeta.expiresSoon
                ? `Reservationen håller tiden till ${expiryMeta.nextExpiryAt} och bör bekräftas snart.`
                : `Reservationen håller tiden till ${expiryMeta.nextExpiryAt}.`
              : 'Valda tider hålls i CCO i väntan på bekräftelse.'
            : 'Välj tider först och reservera dem sedan i CCO innan slutlig bekräftelse.',
      updatedAt:
        confirmedBooking?.updatedAt ||
        confirmedBooking?.confirmedAt ||
        primaryReservation?.updatedAt ||
        primaryReservation?.createdAt ||
        nowIso(),
    };
  }

  async function confirmBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const preferredSlot =
      normalizeEngineSlot(input.slot || input.selectedSlot, state.services, state.resources) ||
      null;
    const activeReservations = await getActiveReservations({
      tenantId,
      conversationId,
      customerEmail,
    });
    const selectedReservation =
      activeReservations.find((item) => {
        if (!preferredSlot) return true;
        return normalizeText(item.slot.slotId) === normalizeText(preferredSlot.slotId);
      }) || null;
    const slot = selectedReservation?.slot || preferredSlot;
    if (!tenantId || !conversationId || !customerEmail || !slot) {
      const error = new Error('Saknar reserverad eller vald tid för att bekräfta bokningen.');
      error.statusCode = 400;
      throw error;
    }
    const existingConfirmedBooking =
      state.bookings.find((item) => {
        if (item.tenantId !== tenantId || item.conversationId !== conversationId) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    if (
      !selectedReservation &&
      preferredSlot &&
      isSlotTaken(preferredSlot, { excludeConversationId: conversationId })
    ) {
      const error = new Error(
        `Tiden ${preferredSlot.startsAt} är inte längre ledig för bekräftelse.`
      );
      error.statusCode = 409;
      throw error;
    }
    if (
      existingConfirmedBooking &&
      normalizeText(existingConfirmedBooking.slot?.slotId) &&
      normalizeText(existingConfirmedBooking.slot?.slotId) !== normalizeText(slot.slotId)
    ) {
      const error = new Error(
        'Det finns redan en bekräftad tid i CCO. Använd ombokning för att ersätta den.'
      );
      error.statusCode = 409;
      error.metadata = {
        code: 'booking_rebook_required',
        confirmedSlotId: normalizeText(existingConfirmedBooking.slot?.slotId),
        selectedSlotId: normalizeText(slot.slotId),
      };
      throw error;
    }
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId || item.conversationId !== conversationId) return item;
      return {
        ...item,
        status:
          normalizeText(selectedReservation?.reservationId) === item.reservationId
            ? 'confirmed'
            : 'released',
        updatedAt: nowIso(),
      };
    });
    const existingBookingIndex = state.bookings.findIndex(
      (item) =>
        item.tenantId === tenantId &&
        item.conversationId === conversationId &&
        normalizeKey(item.status) === 'confirmed'
    );
    const bookingRecord = normalizeBookingRecord(
      {
        ...(existingBookingIndex >= 0 ? state.bookings[existingBookingIndex] : {}),
        tenantId,
        workspaceId: input.workspaceId,
        conversationId,
        customerEmail,
        customerName: input.customerName,
        ownerUserId: input.ownerUserId,
        ownerName: input.ownerName,
        slot,
        status: 'confirmed',
        confirmedAt: nowIso(),
      },
      state
    );
    if (existingBookingIndex >= 0) {
      state.bookings[existingBookingIndex] = bookingRecord;
    } else {
      state.bookings.push(bookingRecord);
    }
    await save();
    return clone(bookingRecord);
  }

  async function cancelBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const reason = normalizeText(input.reason) || 'Avbokad i CCO';
    let changed = false;
    state.bookings = state.bookings.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'confirmed') return item;
      changed = true;
      return {
        ...item,
        status: 'cancelled',
        cancelledAt: nowIso(),
        cancellationReason: reason,
        updatedAt: nowIso(),
      };
    });
    state.reservations = state.reservations.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      changed = true;
      return {
        ...item,
        status: 'released',
        updatedAt: nowIso(),
      };
    });
    if (!changed) {
      const error = new Error('Ingen aktiv bokning hittades att avboka.');
      error.statusCode = 404;
      throw error;
    }
    await save();
    return {
      tenantId,
      conversationId,
      customerEmail,
      status: 'cancelled',
      cancellationReason: reason,
    };
  }

  async function rebookBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const previousBooking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== tenantId) return false;
        if (conversationId && item.conversationId !== conversationId) return false;
        if (customerEmail && item.customerEmail !== customerEmail) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    await cancelBooking({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerEmail: input.customerEmail || input.customerId,
      reason: normalizeText(input.reason) || 'Ombokad i CCO',
    });
    await reserveSlots(input);
    const booking = await confirmBooking(input);
    return {
      ...booking,
      previousBooking: previousBooking ? clone(previousBooking) : null,
      previousSlot: previousBooking?.slot ? clone(previousBooking.slot) : null,
    };
  }

  async function getCaseSummary({ tenantId, conversationId, customerEmail } = {}) {
    const reservations = await getActiveReservations({ tenantId, conversationId, customerEmail });
    const booking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== normalizeText(tenantId)) return false;
        if (conversationId && item.conversationId !== normalizeText(conversationId)) return false;
        if (customerEmail && item.customerEmail !== normalizeKey(customerEmail)) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    const workflow = buildCaseWorkflowSummary({ reservations, booking });
    return {
      reservations,
      booking: clone(booking),
      ...workflow,
      resources: clone(state.resources.filter((item) => item.active !== false)),
      services: clone(state.services.filter((item) => item.active !== false)),
    };
  }

  return {
    listAvailability,
    reserveSlots,
    renewReservations,
    getActiveReservations,
    confirmBooking,
    cancelBooking,
    rebookBooking,
    getCaseSummary,
    listResources: async () => clone(state.resources.filter((item) => item.active !== false)),
    listServices: async () => clone(state.services.filter((item) => item.active !== false)),
    _state: state,
  };
}

module.exports = {
  createCcoBookingEngineStore,
};
