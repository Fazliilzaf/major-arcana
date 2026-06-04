/**
 * @deprecated LEGACY — använd ccoBookingEngineStore.js istället.
 *
 * Denna store hanterar äldre bokningsärenden (cases) och används fortfarande
 * av ccoBookings.js router. Alla NYA bokningar ska gå via ccoBookingEngineStore.
 *
 * Plan: migrera kvarvarande cases till engine-store och ta bort denna fil.
 * Se docs/strategy/CCO-KALENDER-MASTER.md §11 punkt 8.
 */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureDirectoryWithRetry } = require('./persistentDir');
const { rebuildBookingCasesByDate, listCasesInDateRange } = require('./ccoStoreIndexes');

const BOOKING_STATUSES = Object.freeze([
  'needs_triage',
  'slots_ready',
  'offered',
  'waiting_customer',
  'confirmed_external',
  'follow_up_completed',
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
  await ensureDirectoryWithRetry(path.dirname(filePath));
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
  const postConfirmation =
    normalizeStatus(item?.status) === 'confirmed_external'
      ? buildPostConfirmationContext(item)
      : null;
  const waitingCustomer =
    normalizeStatus(item?.status) === 'waiting_customer' ? buildWaitingCustomerContext(item) : null;
  const blocker = buildBookingCaseBlockerReadout(item);
  const recommendationMeta = buildBookingCaseRecommendationMeta(item, blocker, waitingCustomer);
  return item
    ? {
        ...item,
        selectedSlots: asArray(item.selectedSlots).map((slot) => ({ ...slot })),
        events: asArray(item.events).map((event) => ({ ...event })),
        postConfirmation,
        waitingCustomer,
        blocker,
        recommendedAction: normalizeText(blocker?.action),
        ...recommendationMeta,
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

function createStatusEvent(status, previousStatus = '', options = {}) {
  const normalized = normalizeStatus(status);
  const source = normalizeKey(options.statusSource || options.source);
  const labels = {
    needs_triage: 'Bokning kräver triage',
    slots_ready: 'Tider redo för validering',
    offered: 'Erbjudande infogat i Svarstudio',
    waiting_customer: 'Väntar på kundsvar',
    confirmed_external: 'Bekräftad externt',
    cancelled: 'Bokningen avbröts',
    closed: 'Bokningsärendet stängdes',
    follow_up_completed: 'Sista uppföljning klar — post-op-review-flow triggad',
  };
  const previous = normalizeStatus(previousStatus);
  if (normalized === 'confirmed_external') {
    return {
      type: 'external_confirmation_marked',
      label: labels[normalized],
      detail:
        source === 'cco_engine'
          ? 'Bokningen bekräftades i CCO:s egen bokningsmotor.'
          : 'Operatören markerade extern bekräftelse. Ingen direkt kalenderskrivning gjordes av CCO.',
    };
  }
  return {
    type: normalized === 'offered' ? 'offer_draft_inserted' : 'status_changed',
    label: labels[normalized] || 'Bokningsstatus uppdaterad',
    previousStatus: previous && previous !== normalized ? previous : '',
    nextStatus: normalized,
    detail:
      previous && previous !== normalized ? `${previous} → ${normalized}` : `Status: ${normalized}`,
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
  const types = new Set(
    asArray(eventTypes)
      .map((item) => normalizeKey(item))
      .filter(Boolean)
  );
  if (!types.size) return false;
  return asArray(bookingCase.events).some((event) => types.has(normalizeKey(event.type)));
}

function getLatestBookingEvent(bookingCase = {}, eventTypes = []) {
  const types = new Set(
    asArray(eventTypes)
      .map((item) => normalizeKey(item))
      .filter(Boolean)
  );
  if (!types.size) return null;
  return (
    asArray(bookingCase.events)
      .filter((event) => types.has(normalizeKey(event.type)))
      .sort(
        (left, right) =>
          Date.parse(normalizeText(left?.createdAt)) - Date.parse(normalizeText(right?.createdAt))
      )
      .at(-1) || null
  );
}

function isBookingOfferStaleAfterRebook(bookingCase = {}) {
  const latestRebook = getLatestBookingEvent(bookingCase, ['engine_booking_rebooked']);
  const latestOffer = getLatestBookingEvent(bookingCase, ['offer_draft_inserted']);
  const rebookMs = Date.parse(normalizeText(latestRebook?.createdAt));
  const offerMs = Date.parse(normalizeText(latestOffer?.createdAt));
  return Number.isFinite(rebookMs) && (!Number.isFinite(offerMs) || rebookMs > offerMs);
}

function hoursSinceIso(value) {
  const ms = Date.parse(normalizeText(value));
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / 36e5);
}

function getBookingWaitingReferenceAt(bookingCase = {}) {
  const latestWaitSignal = getLatestBookingEvent(bookingCase, [
    'offer_draft_inserted',
    'status_changed',
  ]);
  const latestWaitSignalStatus = normalizeKey(
    latestWaitSignal?.nextStatus || latestWaitSignal?.metadata?.nextStatus
  );
  if (
    latestWaitSignal &&
    (normalizeKey(latestWaitSignal?.type) === 'offer_draft_inserted' ||
      latestWaitSignalStatus === 'waiting_customer')
  ) {
    return normalizeText(latestWaitSignal.createdAt);
  }
  return normalizeText(bookingCase.offeredAt || bookingCase.updatedAt);
}

function getBookingConfirmedReferenceAt(bookingCase = {}) {
  const latestConfirmation = getLatestBookingEvent(bookingCase, [
    'external_confirmation_marked',
    'engine_booking_confirmed',
    'engine_booking_rebooked',
  ]);
  if (latestConfirmation) {
    return normalizeText(latestConfirmation.createdAt);
  }
  return normalizeText(bookingCase.confirmedExternalAt || bookingCase.updatedAt);
}

function buildPostConfirmationContext(bookingCase = {}) {
  if (normalizeStatus(bookingCase?.status) !== 'confirmed_external') return null;
  const confirmationReferenceAt = getBookingConfirmedReferenceAt(bookingCase);
  const confirmationReferenceMs = Date.parse(confirmationReferenceAt);
  const latestCustomerReply = getLatestBookingEvent(bookingCase, [
    'customer_replied',
    'customer_reply_received',
  ]);
  const latestFollowUp = getLatestBookingEvent(bookingCase, [
    'follow_up_scheduled',
    'follow_up_opened',
  ]);
  const customerReplyMs = Date.parse(normalizeText(latestCustomerReply?.createdAt));
  const followUpMs = Date.parse(normalizeText(latestFollowUp?.createdAt));
  const followUpDueAt = normalizeText(latestFollowUp?.metadata?.followUpDueAt);
  const followUpDueMs = Date.parse(followUpDueAt);
  const customerReplyIsAfterConfirmation =
    latestCustomerReply &&
    Number.isFinite(customerReplyMs) &&
    (!Number.isFinite(confirmationReferenceMs) || customerReplyMs >= confirmationReferenceMs);
  const followUpIsAfterConfirmation =
    latestFollowUp &&
    Number.isFinite(followUpMs) &&
    (!Number.isFinite(confirmationReferenceMs) || followUpMs >= confirmationReferenceMs);

  if (
    customerReplyIsAfterConfirmation &&
    (!Number.isFinite(followUpMs) || customerReplyMs >= followUpMs)
  ) {
    const customerReplyHours = hoursSinceIso(latestCustomerReply?.createdAt);
    const customerReplyStale = customerReplyHours >= 24;
    return {
      mode: 'post_confirmation_reply',
      label: customerReplyStale
        ? 'Bearbeta kundsvar efter bekräftelse'
        : 'Kundsvar efter bekräftelse',
      action: 'insert_studio',
      nextActionLabel: customerReplyStale ? 'öppna Svarstudio' : 'uppdatera Svarstudio',
      tone: 'attention',
      urgencyLevel: customerReplyStale ? 'high' : 'normal',
      urgencyReason: customerReplyStale
        ? 'Kunden har återkommit efter bekräftelsen och svaret har redan blivit liggande.'
        : 'Kunden har återkommit efter bekräftelsen och behöver ett nytt operatörssvar.',
      confirmationReferenceAt,
      latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
      latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
      customerReplyHours,
      customerReplyStale,
    };
  }

  if (followUpIsAfterConfirmation) {
    const followUpHours = hoursSinceIso(latestFollowUp?.createdAt);
    const followUpIsDue = Number.isFinite(followUpDueMs)
      ? followUpDueMs <= Date.now()
      : followUpHours >= 24;
    return {
      mode: followUpIsDue
        ? 'post_confirmation_follow_up_due'
        : 'post_confirmation_follow_up_active',
      label: followUpIsDue ? 'Följ upp efter bekräftelse' : 'Bevaka efter bekräftelse',
      action: followUpIsDue ? 'schedule_followup' : 'confirm_external',
      nextActionLabel: followUpIsDue ? 'påminn kunden igen' : 'invänta kundsvar',
      tone: followUpIsDue ? 'attention' : 'waiting',
      urgencyLevel: followUpIsDue ? 'high' : 'normal',
      urgencyReason: followUpIsDue
        ? 'Uppföljningen efter bekräftelsen har passerat sitt återupptagningsläge.'
        : 'En uppföljning pågår fortfarande efter bekräftelsen och kunden väntas återkomma.',
      confirmationReferenceAt,
      latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
      latestFollowUpDueAt: followUpDueAt,
      latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
      followUpHours,
      followUpIsDue,
    };
  }
  return null;
}

function buildWaitingCustomerContext(bookingCase = {}) {
  const waitingHours = hoursSinceIso(getBookingWaitingReferenceAt(bookingCase));
  const waitingReferenceAt = normalizeText(getBookingWaitingReferenceAt(bookingCase));
  const latestFollowUp = getLatestBookingEvent(bookingCase, [
    'follow_up_scheduled',
    'follow_up_opened',
  ]);
  const latestCustomerReply = getLatestBookingEvent(bookingCase, [
    'customer_replied',
    'customer_reply_received',
  ]);
  const followUpMs = Date.parse(normalizeText(latestFollowUp?.createdAt));
  const followUpDueAt = normalizeText(latestFollowUp?.metadata?.followUpDueAt);
  const followUpDueMs = Date.parse(followUpDueAt);
  const followUpHours = hoursSinceIso(latestFollowUp?.createdAt);
  const customerReplyMs = Date.parse(normalizeText(latestCustomerReply?.createdAt));
  const customerReplyHours = hoursSinceIso(latestCustomerReply?.createdAt);
  const customerReplyStale =
    latestCustomerReply && Number.isFinite(customerReplyMs) ? customerReplyHours >= 24 : false;

  if (
    latestCustomerReply &&
    Number.isFinite(customerReplyMs) &&
    (!Number.isFinite(followUpMs) || customerReplyMs >= followUpMs)
  ) {
    return {
      mode: 'customer_reply',
      label: customerReplyStale ? 'Bearbeta kundsvar' : 'Kundsvar inkommet',
      action: 'insert_studio',
      nextActionLabel: customerReplyStale ? 'öppna Svarstudio' : 'uppdatera Svarstudio',
      tone: 'attention',
      urgencyLevel: customerReplyStale ? 'high' : 'normal',
      urgencyReason: customerReplyStale
        ? 'Kunden har redan svarat och svaret har legat utan bearbetning.'
        : 'Kunden har svarat nyligen och behöver ett uppdaterat operatörssvar.',
      waitingHours,
      waitingReferenceAt,
      latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
      latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
      customerReplyHours,
      customerReplyStale,
    };
  }

  const followUpIsDue = latestFollowUp
    ? Number.isFinite(followUpDueMs)
      ? followUpDueMs <= Date.now()
      : followUpHours >= 24
    : false;

  if (latestFollowUp && !followUpIsDue) {
    return {
      mode: 'follow_up_active',
      label: 'Uppföljning pågår',
      action: 'confirm_external',
      nextActionLabel: 'invänta kundsvar',
      tone: 'waiting',
      urgencyLevel: 'normal',
      urgencyReason: 'En uppföljning är redan igång och kunden väntas återkomma.',
      waitingHours,
      waitingReferenceAt,
      latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
      latestFollowUpDueAt: followUpDueAt,
      latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
    };
  }
  if (latestFollowUp && followUpIsDue) {
    return {
      mode: 'follow_up_due',
      label: 'Följ upp igen',
      action: 'schedule_followup',
      nextActionLabel: 'påminn kunden',
      tone: 'attention',
      urgencyLevel: 'high',
      urgencyReason: 'Den senaste uppföljningen har passerat sitt förväntade återupptagningsläge.',
      waitingHours,
      waitingReferenceAt,
      latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
      latestFollowUpDueAt: followUpDueAt,
      latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
    };
  }
  return {
    mode: waitingHours >= 24 ? 'waiting_stale' : 'waiting_monitor',
    label: waitingHours >= 24 ? 'Saknar uppföljning' : 'Kundsvar pågår',
    action: waitingHours >= 24 ? 'schedule_followup' : 'confirm_external',
    nextActionLabel: waitingHours >= 24 ? 'schemalägg uppföljning' : 'bevaka kundsvar',
    tone: waitingHours >= 24 ? 'attention' : 'waiting',
    urgencyLevel: waitingHours >= 24 ? 'high' : 'low',
    urgencyReason:
      waitingHours >= 24
        ? 'Kundväntan har blivit gammal utan aktiv uppföljning.'
        : 'Ärendet väntar fortfarande naturligt på kundens återkoppling.',
    waitingHours,
    waitingReferenceAt,
    latestFollowUpAt: normalizeText(latestFollowUp?.createdAt),
    latestCustomerReplyAt: normalizeText(latestCustomerReply?.createdAt),
  };
}

function buildWaitingCustomerBlocker(bookingCase = {}) {
  const context = buildWaitingCustomerContext(bookingCase);
  const followUpOverdueHours = hoursSinceIso(context.latestFollowUpDueAt);
  let score = 10;
  if (context.mode === 'customer_reply') {
    if (context.customerReplyStale) {
      score = context.customerReplyHours >= 48 ? 24 : 23;
    } else {
      score = 21;
    }
  } else if (context.mode === 'follow_up_due') {
    score = followUpOverdueHours >= 24 ? 23 : 22;
  } else if (context.mode === 'follow_up_active') {
    score = 12;
  } else if (context.mode === 'waiting_stale') {
    score = context.waitingHours >= 48 ? 18 : 16;
  } else if (context.mode === 'waiting_monitor') {
    score = 10;
  }
  return {
    key: 'customer_state',
    label: context.label,
    score,
    action: context.action,
    nextActionLabel: context.nextActionLabel,
    tone: context.tone,
  };
}

function buildBookingCaseRecommendationMeta(
  bookingCase = {},
  blocker = null,
  waitingCustomer = null
) {
  const safeBlocker = blocker && typeof blocker === 'object' ? blocker : null;
  const postConfirmationContext = buildPostConfirmationContext(bookingCase);
  if (postConfirmationContext) {
    const postConfirmationStateByMode = {
      post_confirmation_reply: postConfirmationContext.customerReplyStale
        ? 'act_now_overdue'
        : 'act_now',
      post_confirmation_follow_up_active: 'monitor',
      post_confirmation_follow_up_due: 'reengage_now',
    };
    const postConfirmationReasonByMode = {
      post_confirmation_reply: postConfirmationContext.customerReplyStale
        ? 'Kunden har svarat efter bekräftelsen och svaret ligger redan och väntar på bearbetning.'
        : 'Kunden har svarat efter bekräftelsen och behöver ett uppdaterat operatörssvar.',
      post_confirmation_follow_up_active:
        'En uppföljning pågår fortfarande efter bekräftelsen och kunden väntas återkomma.',
      post_confirmation_follow_up_due:
        'Uppföljningen efter bekräftelsen är förfallen och bör återupptas nu.',
    };
    return {
      recommendedActionState:
        postConfirmationStateByMode[postConfirmationContext.mode] || 'act_now',
      recommendedActionReason:
        postConfirmationReasonByMode[postConfirmationContext.mode] ||
        postConfirmationContext.urgencyReason ||
        '',
    };
  }
  const waitingContext =
    waitingCustomer && typeof waitingCustomer === 'object'
      ? waitingCustomer
      : normalizeStatus(bookingCase?.status) === 'waiting_customer'
        ? buildWaitingCustomerContext(bookingCase)
        : null;

  if (waitingContext) {
    const stateByMode = {
      customer_reply: waitingContext.customerReplyStale ? 'act_now_overdue' : 'act_now',
      follow_up_active: 'monitor',
      follow_up_due: 'reengage_now',
      waiting_stale: 'reengage_now',
      waiting_monitor: 'monitor',
    };
    const reasonByMode = {
      customer_reply: waitingContext.customerReplyStale
        ? 'Kundsvar ligger redan och väntar på bearbetning i Svarstudio.'
        : 'Kunden har svarat och behöver ett uppdaterat operatörssvar.',
      follow_up_active: 'Tråden bevakas fortfarande enligt aktiv uppföljning.',
      follow_up_due: 'Planerad uppföljning är förfallen och bör återupptas nu.',
      waiting_stale: 'Kunden har väntat länge utan aktiv uppföljning och bör lyftas igen.',
      waiting_monitor: 'Ärendet väntar fortfarande naturligt på kundens återkoppling.',
    };
    return {
      recommendedActionState: stateByMode[waitingContext.mode] || 'act_now',
      recommendedActionReason:
        reasonByMode[waitingContext.mode] || waitingContext.urgencyReason || '',
    };
  }

  const actionStateByAction = {
    candidate_slots: 'act_now',
    reserve_slots: 'act_now',
    renew_reservation: 'act_now',
    insert_studio: 'act_now',
    confirm_external: 'act_now',
    'set_status:closed': 'ready_to_close',
    waiting_customer: 'set_customer_state',
  };
  const actionReasonByAction = {
    candidate_slots: 'Välj tider innan bokningsflödet kan gå vidare.',
    reserve_slots: 'Valda tider behöver reserveras i CCO innan de är säkra.',
    renew_reservation: 'Reservationen behöver förnyas innan hållet går ut.',
    insert_studio: 'Förslaget behöver lyftas in i Svarstudio för att nå kunden.',
    confirm_external: 'Bokningen finns redan i CCO och behöver speglas i ärendet.',
    'set_status:closed': 'Ärendet är redo att stängas utan fler kundsteg.',
    waiting_customer: 'Kundläget behöver markeras tydligt för att flödet ska bli korrekt.',
  };
  const action = normalizeText(safeBlocker?.action);
  return {
    recommendedActionState: actionStateByAction[action] || 'act_now',
    recommendedActionReason: actionReasonByAction[action] || normalizeText(safeBlocker?.label),
  };
}

function createSyntheticHistoryCustomerReplyEvent(historyAction = {}) {
  const recordedAt = normalizeText(historyAction?.recordedAt);
  if (!recordedAt) return null;
  return normalizeBookingEvent({
    eventId: `booking-event-history-reply-${recordedAt}`,
    type: 'customer_reply_received',
    label: 'Kundsvar mottaget',
    detail:
      'Historiklagret visar att kunden har svarat i samma tråd efter senaste utskick eller uppföljning.',
    metadata: {
      source: 'cco_history_store',
      actionType: normalizeText(historyAction?.actionType) || 'customer_replied',
      mailboxId: normalizeText(historyAction?.mailboxId),
      messageId: normalizeText(historyAction?.messageId),
    },
    createdAt: recordedAt,
  });
}

function createSyntheticHistoryFollowUpEvent(historyAction = {}) {
  const recordedAt = normalizeText(historyAction?.recordedAt);
  if (!recordedAt) return null;
  const followUpDueAt = normalizeText(historyAction?.followUpDueAt);
  return normalizeBookingEvent({
    eventId: `booking-event-history-followup-${recordedAt}`,
    type: 'follow_up_scheduled',
    label: 'Uppföljning schemalagd',
    detail:
      normalizeText(historyAction?.nextActionSummary) ||
      'Historiklagret visar att tråden markerades för återupptagning eller kunduppföljning.',
    metadata: {
      source: 'cco_history_store',
      actionType: normalizeText(historyAction?.actionType) || 'reply_later',
      mailboxId: normalizeText(historyAction?.mailboxId),
      nextActionLabel: normalizeText(historyAction?.nextActionLabel),
      followUpDueAt,
    },
    createdAt: recordedAt,
  });
}

async function enrichBookingCaseWithHistorySignals(bookingCase = {}, historyStore = null) {
  if (!bookingCase || typeof bookingCase !== 'object') {
    return null;
  }
  if (
    !['waiting_customer', 'confirmed_external'].includes(normalizeStatus(bookingCase.status)) ||
    !historyStore ||
    typeof historyStore.searchHistoryRecords !== 'function'
  ) {
    return cloneBookingCase(bookingCase);
  }

  const latestEventReply = getLatestBookingEvent(bookingCase, [
    'customer_replied',
    'customer_reply_received',
  ]);
  const latestEventReplyMs = Date.parse(normalizeText(latestEventReply?.createdAt));
  const latestEventFollowUp = getLatestBookingEvent(bookingCase, [
    'follow_up_scheduled',
    'follow_up_opened',
  ]);
  const latestEventFollowUpMs = Date.parse(normalizeText(latestEventFollowUp?.createdAt));

  const historyActions = await historyStore.searchHistoryRecords({
    tenantId: normalizeText(bookingCase.tenantId),
    conversationId: normalizeText(bookingCase.conversationId),
    customerEmail: normalizeText(bookingCase.customerEmail),
    limit: 20,
    includeMessages: false,
    includeOutcomes: false,
    includeActions: true,
    resultTypes: ['action'],
    actionTypes: ['customer_replied', 'reply_later'],
  });

  const actionResults = asArray(historyActions).filter(
    (item) => normalizeKey(item?.resultType) === 'action'
  );
  const latestHistoryReply =
    actionResults
      .filter((item) => normalizeKey(item?.actionType) === 'customer_replied')
      .sort(
        (left, right) =>
          Date.parse(normalizeText(right?.recordedAt)) - Date.parse(normalizeText(left?.recordedAt))
      )[0] || null;
  const latestHistoryFollowUp =
    actionResults
      .filter((item) => normalizeKey(item?.actionType) === 'reply_later')
      .sort(
        (left, right) =>
          Date.parse(normalizeText(right?.recordedAt)) - Date.parse(normalizeText(left?.recordedAt))
      )[0] || null;
  const latestHistoryReplyMs = Date.parse(normalizeText(latestHistoryReply?.recordedAt));
  const latestHistoryFollowUpMs = Date.parse(normalizeText(latestHistoryFollowUp?.recordedAt));
  const nextEvents = [...asArray(bookingCase.events)];
  let changed = false;

  if (
    Number.isFinite(latestHistoryFollowUpMs) &&
    (!Number.isFinite(latestEventFollowUpMs) || latestHistoryFollowUpMs > latestEventFollowUpMs)
  ) {
    const syntheticFollowUpEvent = createSyntheticHistoryFollowUpEvent(latestHistoryFollowUp);
    if (syntheticFollowUpEvent) {
      nextEvents.push(syntheticFollowUpEvent);
      changed = true;
    }
  }

  if (
    Number.isFinite(latestHistoryReplyMs) &&
    (!Number.isFinite(latestEventReplyMs) || latestHistoryReplyMs > latestEventReplyMs)
  ) {
    const syntheticReplyEvent = createSyntheticHistoryCustomerReplyEvent(latestHistoryReply);
    if (syntheticReplyEvent) {
      nextEvents.push(syntheticReplyEvent);
      changed = true;
    }
  }

  if (!changed) {
    return cloneBookingCase(bookingCase);
  }

  const updatedAt = [
    normalizeText(bookingCase.updatedAt),
    normalizeText(latestHistoryReply?.recordedAt),
    normalizeText(latestHistoryFollowUp?.recordedAt),
  ]
    .filter(Boolean)
    .sort((left, right) => Date.parse(left) - Date.parse(right))
    .at(-1);

  return cloneBookingCase({
    ...bookingCase,
    updatedAt: updatedAt || bookingCase.updatedAt,
    events: nextEvents,
  });
}

function getBookingCaseBlockerScore(bookingCase = {}) {
  return buildBookingCaseBlockerReadout(bookingCase).score;
}

function buildBookingCaseBlockerReadout(bookingCase = {}) {
  if (!bookingCase || typeof bookingCase !== 'object') {
    return {
      key: 'candidate_slots',
      label: 'Saknar tider',
      score: 30,
      action: 'candidate_slots',
      nextActionLabel: 'välj kandidat-tider',
      tone: 'warning',
    };
  }
  const status = normalizeStatus(bookingCase.status);
  const postConfirmationContext = buildPostConfirmationContext(bookingCase);
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
  if (isBookingOfferStaleAfterRebook(bookingCase)) {
    return {
      key: 'insert_studio',
      label: 'Erbjudandet är gammalt',
      score: 23,
      action: 'insert_studio',
      nextActionLabel: 'uppdatera Svarstudio',
      tone: 'attention',
    };
  }
  if (postConfirmationContext) {
    const scoreByMode = {
      post_confirmation_reply: postConfirmationContext.customerReplyStale ? 25 : 22,
      post_confirmation_follow_up_due: 23,
      post_confirmation_follow_up_active: 12,
    };
    return {
      key: normalizeKey(postConfirmationContext.action) || 'customer_state',
      label: postConfirmationContext.label,
      score: scoreByMode[postConfirmationContext.mode] || 22,
      action: postConfirmationContext.action,
      nextActionLabel: postConfirmationContext.nextActionLabel,
      tone: postConfirmationContext.tone,
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
  if (!hasOffer) {
    return {
      key: 'insert_studio',
      label: 'Saknar Svarstudio',
      score: 20,
      action: 'insert_studio',
      nextActionLabel: 'infoga i Svarstudio',
      tone: 'attention',
    };
  }
  if (status === 'waiting_customer') {
    return buildWaitingCustomerBlocker(bookingCase);
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

function getBookingCaseRecommendationStatePriority(bookingCase = {}) {
  const recommendationMeta = buildBookingCaseRecommendationMeta(bookingCase);
  const priorityByState = {
    act_now_overdue: 60,
    reengage_now: 50,
    act_now: 40,
    set_customer_state: 30,
    monitor: 20,
    ready_to_close: 10,
  };
  return priorityByState[normalizeKey(recommendationMeta?.recommendedActionState)] || 0;
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
    cases: asArray(state?.cases)
      .map((item) => normalizeBookingCase(item))
      .filter(Boolean),
  };
  rebuildBookingCasesByDate(state);

  async function save() {
    state.updatedAt = nowIso();
    rebuildBookingCasesByDate(state);
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
    return cloneBookingCase(
      state.cases[existingIndex >= 0 ? existingIndex : state.cases.length - 1]
    );
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    const match = state.cases.find((item) => caseKey(item) === key);
    return cloneBookingCase(match);
  }

  /** Slå upp case via bookingCaseId eller conversationId (CCO URL :caseId). */
  function findCaseByRef({ tenantId, caseRef } = {}) {
    const ref = normalizeText(caseRef);
    const tenant = normalizeText(tenantId);
    if (!ref) return null;
    const match = state.cases.find((item) => {
      if (tenant && item.tenantId !== tenant) return false;
      return item.bookingCaseId === ref || item.conversationId === ref;
    });
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
          ...createStatusEvent(status, existing.status, input),
          actorUserId: normalizeText(input.ownerUserId),
          actorName: normalizeText(input.ownerName),
        }),
      ]
        .filter(Boolean)
        .slice(-50),
      ownerUserId: normalizeText(input.ownerUserId) || existing.ownerUserId,
      ownerName: normalizeText(input.ownerName) || existing.ownerName,
      notes: normalizeText(input.notes) || existing.notes,
      offeredAt: status === 'offered' ? ts : existing.offeredAt,
      confirmedExternalAt: status === 'confirmed_external' ? ts : existing.confirmedExternalAt,
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
      ]
        .filter(Boolean)
        .slice(-50),
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
          createdAt: normalizeText(input.createdAt),
          actorUserId: normalizeText(input.ownerUserId),
          actorName: normalizeText(input.ownerName),
        }),
      ]
        .filter(Boolean)
        .slice(-50),
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
          const recommendationDelta =
            getBookingCaseRecommendationStatePriority(b) -
            getBookingCaseRecommendationStatePriority(a);
          if (recommendationDelta) return recommendationDelta;
        }
        return getBookingCaseTimeMs(b) - getBookingCaseTimeMs(a);
      })
      .slice(0, max)
      .map((item) => cloneBookingCase(item));
  }

  async function listCasesInRange({ tenantId, fromDate, toDate, limit = 200 } = {}) {
    return listCasesInDateRange(state, { tenantId, fromDate, toDate, limit }).map((item) =>
      cloneBookingCase(item)
    );
  }

  async function listCasesForEnrichment({ tenantId, limit = 5000 } = {}) {
    return listCases({ tenantId, limit });
  }

  return {
    addEvent,
    ensureCase,
    findCaseByRef,
    getCase,
    listCases,
    listCasesForEnrichment,
    listCasesInRange,
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
  buildBookingCaseRecommendationMeta,
  buildWaitingCustomerBlocker,
  buildWaitingCustomerContext,
  buildPostConfirmationContext,
  enrichBookingCaseWithHistorySignals,
  getBookingWaitingReferenceAt,
};
