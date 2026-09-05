const express = require('express');
const crypto = require('crypto');
const { roleHasPermission } = require('../security/ccoRbac');
const { isLocalPreviewAllowed } = require('../security/lokalForhandsvisning');

const {
  buildBookingCaseBlockerReadout,
  buildBookingCaseRecommendationMeta,
  buildPostConfirmationContext,
  buildWaitingCustomerBlocker,
  buildWaitingCustomerContext,
  enrichBookingCaseWithHistorySignals,
} = require('../ops/ccoBookingStore');
const { syncPatient360FromBookingCase } = require('../ops/ccoPatient360Bridge');
const { syncBookingConfirmedToJournal } = require('../ops/ccoJournalBookingBridge');
const { loadLegacyCatalogBundle } = require('../ops/legacyCatalogLoader');
const {
  notifyStaffBookingCancelled,
  notifyStaffBookingConfirmed,
} = require('../ops/ccoBookingStaffNotify');
const { dispatchBookingCancellationEmail } = require('../ops/ccoPatientCareOps');
const { dispatchBookingConfirmationEmail } = require('../ops/ccoCommercialMailDispatch');
const { createAutomationConversationBridge } = require('../ops/ccoAutomationConversationBridge');
const { recordBookingConversationEvent } = require('../ops/ccoBookingConversationEvent');
const { buildMeridiqConsentReadout } = require('../ops/meridiqConsentCatalogRuntime');
const { resolveBookingCancellation } = require('../ops/ccoFollowUpCancellation');
const {
  assertTreatmentBookingAllowed,
  buildTreatmentAgreementBookingBlocker,
  checkTreatmentBookingGate,
} = require('../ops/ccoTreatmentBookingGate');

const WORKSPACE_ID = 'major-arcana-preview';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const STAFF_ROLES = new Set(['OWNER', 'STAFF']);
const CREATE_CONFIRM_TEXT = 'SKAPA BOKNING';
const CLINIC_TIME_ZONE = 'Europe/Stockholm';

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePriceReadout(price = {}) {
  const safe = asObject(price);
  return {
    currency: normalizeText(safe.currency) || 'SEK',
    amountSek:
      safe.amountSek == null || Number.isNaN(Number(safe.amountSek))
        ? null
        : Number(safe.amountSek),
    display: normalizeText(safe.display) || null,
    priceType: normalizeText(safe.priceType) || null,
  };
}

function buildInternalServiceVariantCatalog(services = []) {
  return asArray(services)
    .flatMap((service) => {
      const parentServiceId = normalizeText(service?.id);
      const parentRegister = asObject(service?.serviceRegister);
      return asArray(service?.serviceRegister?.serviceVariants || service?.serviceVariants).map(
        (variant) => {
          const variantId = normalizeText(variant?.variantId);
          const clinicalParentServiceId =
            normalizeText(variant?.clinicalParentArcanaServiceId) || parentServiceId;
          return {
            id: variantId,
            variantId,
            label: normalizeText(variant?.label),
            secondaryLabel: normalizeText(variant?.secondaryLabel) || null,
            parentServiceId,
            clinicalParentServiceId,
            meridiqApiId: variant?.meridiqApiId == null ? null : Number(variant.meridiqApiId),
            facitCategory: normalizeText(variant?.facitCategory) || null,
            price: normalizePriceReadout(variant?.price),
            internalBookable: variant?.internalBookable === true,
            publicBookable: variant?.publicBookable === true,
            publicBookableDecision: normalizeText(variant?.publicBookableDecision) || null,
            encounterType:
              normalizeText(service?.encounterType) ||
              normalizeText(parentRegister.encounterType) ||
              null,
            bookingMethodLabel:
              normalizeText(service?.bookingMethodLabel) ||
              normalizeText(parentRegister.bookingMethodLabel) ||
              null,
            offerTemplateKey:
              normalizeText(service?.offerTemplateKey) ||
              normalizeText(parentRegister.offerTemplateKey) ||
              null,
            documentRequirementKey:
              normalizeText(service?.documentRequirementKey) ||
              normalizeText(parentRegister.documentRequirementKey) ||
              null,
          };
        }
      );
    })
    .filter(
      (variant) =>
        variant.id &&
        variant.label &&
        variant.parentServiceId &&
        variant.internalBookable === true &&
        variant.meridiqApiId != null
    );
}

function resolveInternalServiceSelection(services = [], requestedServiceId = '') {
  const requested = normalizeText(requestedServiceId);
  const directService =
    asArray(services).find((item) => normalizeText(item.id) === requested) || null;
  if (directService) {
    return {
      requestedServiceId: requested,
      serviceId: normalizeText(directService.id),
      service: directService,
      variant: null,
    };
  }
  const variants = buildInternalServiceVariantCatalog(services);
  const variant = variants.find((item) => item.variantId === requested) || null;
  if (!variant) {
    return null;
  }
  const parentService =
    asArray(services).find((item) => normalizeText(item.id) === variant.parentServiceId) || null;
  return {
    requestedServiceId: requested,
    serviceId: variant.parentServiceId,
    service: parentService,
    variant,
  };
}

function resolveInternalVariantSelection(runtimeServices = [], requestedServiceId = '') {
  const requested = normalizeText(requestedServiceId);
  const variants = buildInternalServiceVariantCatalog(runtimeServices);
  const variant = variants.find((item) => item.variantId === requested) || null;
  if (!variant) return null;
  const parentService =
    asArray(runtimeServices).find((item) => normalizeText(item.id) === variant.parentServiceId) ||
    null;
  if (!parentService || variant.internalBookable !== true) return null;
  return {
    requestedServiceId: requested,
    serviceId: variant.parentServiceId,
    service: parentService,
    variant,
  };
}

function hasBookingEvent(bookingCase = {}, eventTypes = []) {
  const wanted = new Set(
    asArray(eventTypes)
      .map((item) => normalizeKey(item))
      .filter(Boolean)
  );
  if (!wanted.size) return false;
  return asArray(bookingCase.events).some((event) => wanted.has(normalizeKey(event?.type)));
}

function getLatestBookingEvent(bookingCase = {}, eventTypes = []) {
  const wanted = new Set(
    asArray(eventTypes)
      .map((item) => normalizeKey(item))
      .filter(Boolean)
  );
  if (!wanted.size) return null;
  return (
    asArray(bookingCase.events)
      .filter((event) => wanted.has(normalizeKey(event?.type)))
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

function createWorkflowBlocker({
  key = '',
  label = '',
  score = 0,
  action = '',
  nextActionLabel = '',
  tone = 'stable',
} = {}) {
  return {
    key: normalizeText(key),
    label: normalizeText(label),
    score: Math.max(0, Number(score) || 0),
    action: normalizeText(action),
    nextActionLabel: normalizeText(nextActionLabel),
    tone: normalizeText(tone) || 'stable',
  };
}

function buildBookingWorkflowBlocker(summary = {}, bookingCase = null) {
  const safeSummary = asObject(summary);
  const caseData = bookingCase && typeof bookingCase === 'object' ? bookingCase : null;
  const caseBlocker = caseData ? buildBookingCaseBlockerReadout(caseData) : null;
  const postConfirmationContext = caseData ? buildPostConfirmationContext(caseData) : null;
  const status = normalizeKey(caseData?.status);
  const slotCount = asArray(caseData?.selectedSlots).length;
  const hasOffer =
    status === 'offered' ||
    status === 'waiting_customer' ||
    Boolean(normalizeText(caseData?.offeredAt)) ||
    hasBookingEvent(caseData, ['offer_draft_inserted']);

  if (status === 'cancelled' || status === 'closed') {
    return caseBlocker || createWorkflowBlocker({ label: 'Redo', tone: 'closed' });
  }
  if (postConfirmationContext) {
    const scoreByMode = {
      post_confirmation_reply: postConfirmationContext.customerReplyStale ? 25 : 22,
      post_confirmation_follow_up_due: 23,
      post_confirmation_follow_up_active: 12,
    };
    return createWorkflowBlocker({
      key: normalizeText(postConfirmationContext.action) || 'customer_state',
      label: postConfirmationContext.label,
      score: scoreByMode[postConfirmationContext.mode] || 22,
      action: postConfirmationContext.action,
      nextActionLabel: postConfirmationContext.nextActionLabel,
      tone: postConfirmationContext.tone,
    });
  }
  if (isBookingOfferStaleAfterRebook(caseData)) {
    return createWorkflowBlocker({
      key: 'insert_studio',
      label: 'Erbjudandet är gammalt',
      score: 23,
      action: 'insert_studio',
      nextActionLabel: 'uppdatera Svarstudio',
      tone: 'attention',
    });
  }
  if (safeSummary.hasConfirmedBooking === true) {
    if (status === 'confirmed_external' || normalizeText(caseData?.confirmedExternalAt)) {
      return (
        caseBlocker ||
        createWorkflowBlocker({
          key: 'customer_state',
          label: 'Redo att stänga',
          score: 10,
          action: 'set_status:closed',
          nextActionLabel: 'stäng ärendet',
          tone: 'ready',
        })
      );
    }
    return createWorkflowBlocker({
      key: 'customer_state',
      label: 'Bokning klar i CCO',
      score: 20,
      action: 'confirm_external',
      nextActionLabel: 'markera bekräftad',
      tone: 'ready',
    });
  }
  if (status === 'confirmed_external' || normalizeText(caseData?.confirmedExternalAt)) {
    return (
      caseBlocker ||
      createWorkflowBlocker({
        key: 'customer_state',
        label: 'Redo att stänga',
        score: 10,
        action: 'set_status:closed',
        nextActionLabel: 'stäng ärendet',
        tone: 'ready',
      })
    );
  }
  if (status === 'waiting_customer' && hasOffer) {
    return buildWaitingCustomerBlocker(caseData);
  }
  if (!slotCount) {
    return (
      caseBlocker ||
      createWorkflowBlocker({
        key: 'candidate_slots',
        label: 'Saknar tider',
        score: 30,
        action: 'candidate_slots',
        nextActionLabel: 'välj kandidat-tider',
        tone: 'attention',
      })
    );
  }
  if (safeSummary.hasReservations === true && safeSummary.expiresSoon === true) {
    return createWorkflowBlocker({
      key: 'reservation_expiring',
      label: 'Reservation utgår snart',
      score: 26,
      action: 'renew_reservation',
      nextActionLabel: 'förnya håll',
      tone: 'attention',
    });
  }
  if (safeSummary.state === 'idle') {
    return createWorkflowBlocker({
      key: 'reserve_slots',
      label: 'Tider ej reserverade',
      score: 24,
      action: 'reserve_slots',
      nextActionLabel: 'reservera i CCO',
      tone: 'attention',
    });
  }
  if (!hasOffer) {
    return createWorkflowBlocker({
      key: 'insert_studio',
      label: 'Saknar Svarstudio',
      score: 20,
      action: 'insert_studio',
      nextActionLabel: 'infoga i Svarstudio',
      tone: 'attention',
    });
  }
  if (caseBlocker && caseBlocker.action) {
    return caseBlocker;
  }
  return createWorkflowBlocker({
    key: normalizeText(safeSummary.recommendedAction),
    label: normalizeText(safeSummary.stateLabel) || 'Bokningsläge',
    score: 10,
    action: normalizeText(safeSummary.recommendedAction),
    nextActionLabel: normalizeText(safeSummary.recommendedAction),
    tone: safeSummary.hasReservations ? 'stable' : 'attention',
  });
}

function getAuthToken(req) {
  const authHeader = normalizeText(req.get('authorization'));
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return normalizeText(req.get('x-auth-token'));
}

async function resolveActor(req, { authStore, config }) {
  const token = getAuthToken(req);
  if (token) {
    const context = await authStore.getSessionContextByToken(token);
    if (!context) {
      const error = new Error('Sessionen är ogiltig eller har gått ut.');
      error.statusCode = 401;
      throw error;
    }
    await authStore.touchSession(context.session.id);
    return {
      tenantId: context.membership.tenantId,
      userId: context.user.id,
      role: context.membership.role,
    };
  }

  if (isLocalPreviewAllowed(req, config)) {
    return {
      tenantId: config.defaultTenantId,
      userId: 'preview-local',
      role: 'OWNER',
    };
  }

  const error = new Error('Inloggning krävs.');
  error.statusCode = 401;
  throw error;
}

function buildContext(req, actor) {
  return {
    tenantId: actor.tenantId,
    workspaceId:
      normalizeText(req.query.workspaceId) || normalizeText(req.body?.workspaceId) || WORKSPACE_ID,
    conversationId:
      normalizeText(req.query.conversationId) || normalizeText(req.body?.conversationId),
    customerEmail:
      normalizeText(req.query.customerEmail) ||
      normalizeText(req.body?.customerEmail) ||
      normalizeText(req.query.customerId) ||
      normalizeText(req.body?.customerId),
    customerName: normalizeText(req.query.customerName) || normalizeText(req.body?.customerName),
    actor,
  };
}

function requireBookingContext(context) {
  if (context.conversationId && context.customerEmail) return;
  const error = new Error('Välj en aktiv tråd med kund innan bokningsmotorn används.');
  error.statusCode = 400;
  throw error;
}

function requireStaffRole(context) {
  const role = normalizeText(context?.actor?.role).toUpperCase();
  if (STAFF_ROLES.has(role)) return;
  const error = new Error('Otillräcklig behörighet.');
  error.statusCode = 403;
  throw error;
}

function requireBookingWrite(context) {
  if (roleHasPermission(context?.actor?.role, 'bookings.write')) return;
  const error = new Error('Behörigheten bookings.write krävs.');
  error.statusCode = 403;
  error.metadata = { requiredPermission: 'bookings.write' };
  throw error;
}

function requireBookingCatalogRead(context) {
  requireStaffRole(context);
  if (roleHasPermission(context?.actor?.role, 'bookings.read')) return;
  const error = new Error('Behörigheten bookings.read krävs.');
  error.statusCode = 403;
  error.metadata = { requiredPermission: 'bookings.read' };
  throw error;
}

function createAuditActor(req, context) {
  return {
    role: context.actor.role,
    userId: context.actor.userId,
    ip: normalizeText(req.headers['x-forwarded-for'] || req.socket?.remoteAddress)
      .split(',')[0]
      .trim(),
  };
}

function appendStrictAudit(auditLog, event) {
  if (!auditLog || typeof auditLog.appendStrict !== 'function') {
    const error = new Error('Append-only CCO-audit är inte tillgänglig.');
    error.statusCode = 503;
    error.metadata = { code: 'audit_unavailable' };
    throw error;
  }
  return auditLog.appendStrict(event);
}

// B-3 (P0-002): audit för ett explicit conflict-override-beslut. Kallas bara
// när en faktisk resurs/tid-konflikt överskrids — aldrig för vanliga bokningar.
function makeConflictOverrideAudit(auditLog, req, context) {
  return (info) =>
    appendStrictAudit(auditLog, {
      action: 'bookings.conflict_override',
      actor: createAuditActor(req, context),
      target: { kind: 'resource', id: info.resourceId, tenantId: context.tenantId },
      result: 'ok',
      detail: {
        slotId: info.slotId,
        startsAt: info.startsAt,
        override: true,
      },
    });
}

function stockholmDateParts(value) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: CLINIC_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(parsed)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function patientEmail(patient = {}) {
  return normalizeText(
    patient.primaryEmail ||
      patient.email ||
      asArray(patient.emails)[0]?.value ||
      asArray(patient.emails)[0]
  );
}

function patientName(patient = {}) {
  return normalizeText(
    patient.displayName ||
      patient.name ||
      [patient.firstName, patient.lastName].filter(Boolean).join(' ')
  );
}

function createRequestFingerprint(input = {}) {
  const stable = {
    patientId: normalizeText(input.patientId),
    encounterId: normalizeText(input.encounterId),
    serviceId: normalizeText(input.serviceId),
    resourceId: normalizeText(input.resourceId),
    practitionerId: normalizeText(input.practitionerId),
    startsAt: normalizeText(input.startsAt),
    timeZone: normalizeText(input.timeZone),
    roomId: normalizeText(input.roomId),
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function createGate(key, label, passed, detail) {
  return { key, label, status: passed ? 'pass' : 'blocked', detail };
}

function toCaseInput(context, body = {}) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    customerEmail: context.customerEmail,
    customerName: context.customerName,
    ownerUserId: context.actor.userId,
    ownerName: normalizeText(body.ownerName),
    requestedTreatment: normalizeText(body.requestedTreatment),
    preferredWindow: normalizeText(body.preferredWindow),
    notes: normalizeText(body.notes),
    selectedSlots: body.selectedSlots || body.slots,
  };
}

function patientPayload(record) {
  return record
    ? {
        attention: record.patient360,
        modules: record.modules,
        identity: record.identity,
        timelineCount: Array.isArray(record.timeline) ? record.timeline.length : 0,
        updatedAt: record.updatedAt,
      }
    : null;
}

function summaryPayload(summary = {}, bookingCase = null) {
  const safe = asObject(summary);
  const blocker = buildBookingWorkflowBlocker(safe, bookingCase);
  const waitingCustomer =
    bookingCase && normalizeKey(bookingCase.status) === 'waiting_customer'
      ? buildWaitingCustomerContext(bookingCase)
      : null;
  const postConfirmation =
    bookingCase && normalizeKey(bookingCase.status) === 'confirmed_external'
      ? buildPostConfirmationContext(bookingCase)
      : null;
  const recommendationMeta = buildBookingCaseRecommendationMeta(
    bookingCase,
    blocker,
    waitingCustomer
  );
  return {
    reservations: asArray(safe.reservations),
    booking: safe.booking || null,
    state: normalizeText(safe.state),
    stateLabel: normalizeText(safe.stateLabel),
    stateReason: normalizeText(safe.stateReason),
    recommendedAction: blocker
      ? normalizeText(blocker.action)
      : normalizeText(safe.recommendedAction),
    reservationCount: Math.max(0, Number(safe.reservationCount) || 0),
    hasReservations: safe.hasReservations === true,
    hasConfirmedBooking: safe.hasConfirmedBooking === true,
    activeReservation: safe.activeReservation || null,
    primarySlot: safe.primarySlot || null,
    nextExpiryAt: normalizeText(safe.nextExpiryAt),
    expiresInMinutes:
      Number.isFinite(Number(safe.expiresInMinutes)) && Number(safe.expiresInMinutes) >= 0
        ? Number(safe.expiresInMinutes)
        : null,
    expiresSoon: safe.expiresSoon === true,
    postConfirmation,
    waitingCustomer,
    blocker,
    ...recommendationMeta,
    updatedAt: normalizeText(safe.updatedAt),
    resources: asArray(safe.resources),
    services: asArray(safe.services),
  };
}

function createCcoBookingEngineRouter({
  bookingEngineStore,
  bookingStore,
  historyStore = null,
  patientSystemStore = null,
  treatmentAgreementStore = null,
  templateVersionApprovalStore = null,
  patientMasterStore = null,
  journalStore = null,
  treatmentEncounterStore = null,
  aftercareStore = null,
  patientCareStateStore = null,
  commercialStore = null,
  authStore,
  config,
  graphSendConnector = null,
  auditLog = null,
  ccoMailboxTruthStore = null,
  conversationStateStore = null,
  ccoSettingsStore = null,
}) {
  const router = express.Router();

  const automationBridge =
    ccoMailboxTruthStore && patientMasterStore
      ? createAutomationConversationBridge({
          ccoMailboxTruthStore,
          patientMasterStore,
          defaultTenantId: config?.defaultTenantId || 'hair-tp-clinic',
        })
      : null;

  async function syncBookingPatient360(context, bookingCase, options = {}) {
    const latestEvent = Array.isArray(bookingCase?.events) ? bookingCase.events.at(-1) : null;
    return syncPatient360FromBookingCase({
      patientSystemStore,
      context,
      bookingCase,
      source: options.source || 'cco_booking_engine',
      includeTimelineEvent: options.includeTimelineEvent === true,
      event: options.event || latestEvent,
    });
  }

  async function notifyStaffBookingEvent(kind, booking, extra = {}) {
    const toEmail = normalizeText(config?.ccoCareReminderDigestEmail);
    const fromEmail = normalizeText(config?.ccoCareReminderFromEmail);
    try {
      if (kind === 'cancel') {
        return await notifyStaffBookingCancelled({
          graphSendConnector,
          booking,
          reason: extra.reason,
          toEmail,
          fromEmail,
        });
      }
      return await notifyStaffBookingConfirmed({
        graphSendConnector,
        booking,
        toEmail,
        fromEmail,
      });
    } catch (error) {
      console.warn(
        `[cco-booking-engine/${kind}] staff notify failed:`,
        error && error.message ? error.message : error
      );
      return { skipped: true, reason: 'notify_failed' };
    }
  }

  // ── OP-datum-koppling till det kommersiella ärendet ────────────────────────
  // När en behandlingsbokning bekräftas/ombokas sätts casets opDate till
  // bokningens operationsdatum (slot.startsAt → YYYY-MM-DD). Vid avbokning
  // rensas opDate (annars ligger fakturasignalen kvar på en inställd operation).
  // Icke-blockerande: får aldrig fälla en bokning, avbokning eller ombokning.

  async function resolveCommercialPatientId(context, reqBody, booking) {
    const fromBody = normalizeText(reqBody?.patientId);
    if (fromBody) return fromBody;
    const canonical = normalizeText(booking?.canonicalPatientId);
    if (canonical) return canonical;
    if (patientMasterStore?.findPatientByEmail && context.customerEmail) {
      const patient = await patientMasterStore.findPatientByEmail({
        tenantId: context.tenantId,
        email: context.customerEmail,
      });
      return normalizeText(patient?.id);
    }
    return '';
  }

  function opDateFromBooking(booking) {
    const startsAt = normalizeText(booking?.slot?.startsAt);
    return startsAt ? startsAt.slice(0, 10) : '';
  }

  async function linkCommercialOpDateFromBooking({
    context,
    patientId,
    opDate,
    eventType,
    eventLabel,
  }) {
    if (!patientId || !commercialStore) return null;
    if (typeof commercialStore.getPatientRegisterCase !== 'function') return null;
    if (typeof commercialStore.upsertCase !== 'function') return null;
    const commercialCase = await commercialStore.getPatientRegisterCase({
      tenantId: context.tenantId,
      patientId,
    });
    if (!commercialCase) return null;
    return commercialStore.upsertCase({
      ...commercialCase,
      opDate,
      events: [
        ...asArray(commercialCase.events),
        {
          type: eventType,
          label: eventLabel,
          detail: normalizeText(opDate),
          actorUserId: '',
          actorName: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  async function linkCommercialOpDateFromBookingSafe(
    context,
    reqBody,
    booking,
    { opDate, eventType, eventLabel, route }
  ) {
    try {
      const patientId = await resolveCommercialPatientId(context, reqBody, booking);
      if (!patientId) return null;
      return await linkCommercialOpDateFromBooking({
        context,
        patientId,
        opDate,
        eventType,
        eventLabel,
      });
    } catch (error) {
      console.warn(
        `[cco-booking-engine/${route}] commercial opDate link failed:`,
        error && error.message ? error.message : error
      );
      return null;
    }
  }

  // Bokningsbekräftelse till kunden — best-effort. Ett misslyckat utskick får
  // aldrig fälla bokningen: fångat + loggat, aldrig kastat vidare.
  async function dispatchCustomerBookingConfirmation(booking, context) {
    try {
      let automaticBookingConfirmation = true;
      if (ccoSettingsStore && typeof ccoSettingsStore.getTenantSettings === 'function') {
        const settings = await ccoSettingsStore.getTenantSettings({ tenantId: context.tenantId });
        automaticBookingConfirmation = settings?.toggles?.automaticBookingConfirmation !== false;
      }
      return await dispatchBookingConfirmationEmail({
        tenantId: context.tenantId,
        booking,
        graphSendConnector,
        patientCareStateStore,
        fromEmail: config?.bookingConfirmationFromEmail || config?.ccoCareReminderFromEmail,
        bookingEngineStore,
        automationBridge,
        automaticBookingConfirmation,
      });
    } catch (sendError) {
      console.warn(
        '[cco-booking-engine] booking confirmation email failed:',
        sendError?.message || sendError
      );
      return { skipped: true, reason: 'confirmation_send_failed' };
    }
  }

  async function enforceTreatmentBookingGate(context, body = {}) {
    return assertTreatmentBookingAllowed({
      treatmentAgreementStore,
      patientMasterStore,
      bookingStore,
      journalStore,
      tenantId: context.tenantId,
      customerEmail: context.customerEmail,
      patientId: normalizeText(body?.patientId),
      body,
    });
  }

  async function loadTreatmentBookingGate(context, bookingCase = null, body = {}) {
    const slots = asArray(bookingCase?.selectedSlots);
    const mergedBody = {
      ...body,
      selectedSlots: asArray(body.selectedSlots || body.slots).length
        ? body.selectedSlots || body.slots
        : slots,
      serviceId:
        normalizeText(body.serviceId) ||
        normalizeText(slots[0]?.serviceId) ||
        normalizeText(bookingCase?.requestedTreatment),
    };
    return checkTreatmentBookingGate({
      treatmentAgreementStore,
      templateVersionApprovalStore,
      patientMasterStore,
      bookingStore,
      journalStore,
      tenantId: context.tenantId,
      customerEmail: context.customerEmail,
      patientId: normalizeText(body?.patientId),
      body: mergedBody,
    });
  }

  function mergeAgreementBlocker(summary = {}, gate = null) {
    const agreementBlocker = buildTreatmentAgreementBookingBlocker(gate);
    if (!agreementBlocker) return summary;
    const existingBlocker = asObject(summary.blocker);
    const existingScore = Math.max(0, Number(existingBlocker.score) || 0);
    if (existingScore >= agreementBlocker.score) {
      return {
        ...summary,
        treatmentAgreementGate: agreementBlocker.treatmentAgreementGate,
      };
    }
    return {
      ...summary,
      blocker: agreementBlocker,
      recommendedAction: '',
      treatmentAgreementGate: agreementBlocker.treatmentAgreementGate,
    };
  }

  async function handle(req, res, run) {
    try {
      const actor = await resolveActor(req, { authStore, config });
      const context = buildContext(req, actor);
      return await run(context);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera CCO booking engine.' });
    }
  }

  async function buildCreateBookingPreflight(req, context) {
    requireBookingWrite(context);
    const body = asObject(req.body);
    const patientId = normalizeText(body.patientId);
    const requestedServiceId = normalizeText(body.serviceId);
    const resourceId = normalizeText(body.resourceId);
    const practitionerId = normalizeText(body.practitionerId);
    const startsAt = normalizeText(body.startsAt);
    const timeZone = normalizeText(body.timeZone);
    const roomId = normalizeText(body.roomId);
    const roomLabel = normalizeText(body.roomLabel);
    const idempotencyKey = normalizeText(req.get('x-idempotency-key'));
    const identityAmbiguous = body.identityAmbiguous === true || body.linkAllowed === false;
    const patient =
      patientId && patientMasterStore?.getPatient
        ? await patientMasterStore.getPatient({ tenantId: context.tenantId, patientId })
        : null;
    const [services, resources] = await Promise.all([
      bookingEngineStore.listServices(),
      bookingEngineStore.listResources(),
    ]);
    const runtimeCatalog =
      typeof bookingEngineStore.getRuntimeCatalog === 'function'
        ? await bookingEngineStore.getRuntimeCatalog()
        : null;
    const runtimeServices = asArray(runtimeCatalog?.services);
    const aliasResolvedServiceId =
      normalizeText(bookingEngineStore.resolveServiceId?.(requestedServiceId)) ||
      requestedServiceId;
    const serviceSelection = resolveInternalServiceSelection(services, aliasResolvedServiceId) ||
      resolveInternalVariantSelection(runtimeServices, requestedServiceId) ||
      resolveInternalVariantSelection(runtimeServices, aliasResolvedServiceId) ||
      resolveInternalServiceSelection(runtimeServices, aliasResolvedServiceId) || {
        requestedServiceId,
        serviceId: aliasResolvedServiceId,
        service: null,
        variant: null,
      };
    const serviceId = serviceSelection.serviceId;
    const service = serviceSelection.service;
    const serviceVariant = serviceSelection.variant;
    const resource = resources.find((item) => normalizeText(item.id) === resourceId) || null;
    const practitioner =
      resources.find((item) => normalizeText(item.id) === practitionerId) || null;
    const localTime = stockholmDateParts(startsAt);
    let selectedSlot = null;
    if (localTime && service && resource) {
      const availability = await bookingEngineStore.listAvailability({
        tenantId: context.tenantId,
        fromDate: localTime.date,
        toDate: localTime.date,
        resIds: resourceId,
        srvIds: serviceId,
      });
      selectedSlot =
        availability.find(
          (slot) =>
            normalizeText(slot.startsAt) === new Date(startsAt).toISOString() &&
            normalizeText(slot.serviceId) === serviceId &&
            normalizeText(slot.resourceId) === resourceId
        ) || null;
      if (selectedSlot && serviceVariant) {
        selectedSlot = {
          ...selectedSlot,
          serviceVariantId: serviceVariant.variantId,
          serviceLabel: serviceVariant.label,
          servicePrice: serviceVariant.price,
          clinicalParentServiceId: serviceVariant.clinicalParentServiceId,
        };
      }
      // Explicit valt behandlingsrum — flödar genom normalizeEngineSlot till
      // slot.roomId. Tomt roomId lämnar auto-tilldelningen åt motorn.
      if (selectedSlot && roomId) {
        selectedSlot = { ...selectedSlot, roomId, roomLabel: roomLabel || roomId };
      }
    }
    const email = patientEmail(patient);
    const conversationId =
      normalizeText(context.conversationId) ||
      `calendar-create:${patientId}:${crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`;
    const gates = [
      createGate(
        'canonical_patient',
        'Canonical patientId',
        Boolean(patient && patientId && !identityAmbiguous),
        identityAmbiguous
          ? 'Patientmatchningen är tvetydig.'
          : patient
            ? 'Canonical patient hittad.'
            : 'Canonical patient saknas.'
      ),
      createGate(
        'treatment',
        'Behandling',
        Boolean(service),
        service ? service.label : 'Behandling saknas i booking engine-katalogen.'
      ),
      createGate(
        'resource',
        'Resurs',
        Boolean(resource),
        resource ? resource.label : 'Resurs saknas i booking engine-katalogen.'
      ),
      createGate(
        'practitioner',
        'Vårdgivare',
        Boolean(practitioner && practitionerId === resourceId),
        practitioner && practitionerId === resourceId
          ? practitioner.label
          : 'Vårdgivaren måste vara samma verifierade booking engine-resurs.'
      ),
      createGate(
        'stockholm_time',
        'Europe/Stockholm-tid',
        timeZone === CLINIC_TIME_ZONE && Boolean(localTime),
        localTime ? `${localTime.date} ${localTime.time} · ${CLINIC_TIME_ZONE}` : 'Ogiltig tid.'
      ),
      createGate(
        'contact',
        'Canonical kontakt',
        Boolean(email),
        email ? 'Canonical patient har bokningsbar e-post.' : 'Patienten saknar canonical e-post.'
      ),
      createGate(
        'availability',
        'Konfliktkontroll',
        Boolean(selectedSlot),
        selectedSlot
          ? 'Tiden är fortfarande ledig.'
          : 'Tiden är inte ledig eller saknas i availability.'
      ),
      createGate(
        'write_permission',
        'Behörighet bookings.write',
        true,
        'Verifierad staff-session har bookings.write.'
      ),
      createGate(
        'idempotency',
        'Idempotency',
        /^[A-Za-z0-9._:-]{12,160}$/.test(idempotencyKey),
        idempotencyKey ? 'Idempotency-key är satt.' : 'Idempotency-key saknas.'
      ),
      createGate(
        'append_only_audit',
        'Append-only audit',
        Boolean(auditLog?.appendStrict),
        auditLog?.appendStrict
          ? 'Strict append-only audit är tillgänglig.'
          : 'Audit är inte tillgänglig.'
      ),
      createGate(
        'recovery',
        'Återställning',
        typeof bookingEngineStore.reserveAndConfirmIdempotent === 'function',
        'Reserve→confirm körs med kompenserande återställning.'
      ),
    ];
    const blockers = gates.filter((gate) => gate.status === 'blocked');
    const fingerprint = createRequestFingerprint(body);
    // Explicit valt rum får krocka (människan vet bäst) — men personalen ska
    // se en varning, inte välja i blindo.
    const roomWarnings = [];
    if (roomId && selectedSlot) {
      const taken = bookingEngineStore.isRoomTaken
        ? bookingEngineStore.isRoomTaken(roomId, selectedSlot.startsAt, selectedSlot.endsAt, {
            excludeConversationId: context.conversationId,
          })
        : false;
      if (taken) {
        roomWarnings.push(
          `Rum ${roomLabel || roomId} är upptaget vid vald tid — kontrollera innan du bekräftar.`
        );
      }
    }
    return {
      readOnly: true,
      actionAllowed: blockers.length === 0,
      confirmTextRequired: CREATE_CONFIRM_TEXT,
      warnings: roomWarnings,
      patient: patient ? { patientId, name: patientName(patient), email } : null,
      service: service
        ? {
            serviceId,
            requestedServiceId,
            label: serviceVariant?.label || service.label,
            parentServiceId: serviceId,
            variantId: serviceVariant?.variantId || null,
            meridiqApiId: serviceVariant?.meridiqApiId ?? null,
            price: serviceVariant?.price || null,
            priceLabel: serviceVariant?.price?.display || null,
            priceType: serviceVariant?.price?.priceType || null,
            clinicalParentServiceId: serviceVariant?.clinicalParentServiceId || serviceId,
          }
        : null,
      resource: resource ? { resourceId, label: resource.label } : null,
      practitioner: practitioner ? { practitionerId, label: practitioner.label } : null,
      time: localTime
        ? {
            startsAt: new Date(startsAt).toISOString(),
            local: `${localTime.date} ${localTime.time}`,
            timeZone: CLINIC_TIME_ZONE,
          }
        : null,
      selectedSlot,
      gates,
      blockers,
      idempotencyKey,
      requestFingerprint: fingerprint,
      operationContext:
        patient && email
          ? {
              tenantId: context.tenantId,
              workspaceId: WORKSPACE_ID,
              conversationId,
              customerEmail: email,
              customerName: patientName(patient),
            }
          : null,
    };
  }

  router.post('/cco-booking-engine/create/preflight', async (req, res) =>
    handle(req, res, async (context) => {
      const preflight = await buildCreateBookingPreflight(req, context);
      return res
        .status(preflight.actionAllowed ? 200 : 409)
        .json({ provider: 'cco_engine', preflight });
    })
  );

  router.post('/cco-booking-engine/create/confirm', async (req, res) =>
    handle(req, res, async (context) => {
      const preflight = await buildCreateBookingPreflight(req, context);
      const existing = bookingEngineStore.findBookingByIdempotency?.({
        tenantId: context.tenantId,
        idempotencyKey: preflight.idempotencyKey,
      });
      if (existing) {
        if (existing.requestFingerprint !== preflight.requestFingerprint) {
          const error = new Error('Idempotency-key har redan använts med annat bokningsunderlag.');
          error.statusCode = 409;
          error.metadata = { code: 'idempotency_payload_mismatch' };
          throw error;
        }
        const actor = createAuditActor(req, context);
        appendStrictAudit(auditLog, {
          action: 'bookings.create_replayed',
          actor,
          target: { kind: 'booking', id: existing.bookingId, tenantId: context.tenantId },
          result: 'ok',
          detail: { idempotencyKey: preflight.idempotencyKey },
        });
        return res.json({
          provider: 'cco_engine',
          ok: true,
          booking: existing,
          idempotency: { key: preflight.idempotencyKey, replayed: true },
          audit: { appendOnly: true },
          recovery: { compensated: false },
        });
      }
      if (!preflight.actionAllowed) {
        const error = new Error('Boknings-preflight är blockerad.');
        error.statusCode = 409;
        error.metadata = { code: 'preflight_blocked', preflight };
        throw error;
      }
      if (normalizeText(req.body?.confirmText) !== CREATE_CONFIRM_TEXT) {
        const error = new Error(`Explicit bekräftelse krävs: ${CREATE_CONFIRM_TEXT}`);
        error.statusCode = 400;
        error.metadata = { code: 'confirm_text_required', expected: CREATE_CONFIRM_TEXT };
        throw error;
      }
      await enforceTreatmentBookingGate(preflight.operationContext, {
        ...req.body,
        patientId: preflight.patient.patientId,
        selectedSlots: [preflight.selectedSlot],
        serviceId: preflight.service.serviceId,
      });
      const actor = createAuditActor(req, context);
      const auditTarget = {
        kind: 'booking',
        id: preflight.idempotencyKey,
        tenantId: context.tenantId,
      };
      appendStrictAudit(auditLog, {
        action: 'bookings.create_requested',
        actor,
        target: auditTarget,
        result: 'ok',
        detail: {
          patientId: preflight.patient.patientId,
          requestFingerprint: preflight.requestFingerprint,
        },
      });
      try {
        const input = {
          ...preflight.operationContext,
          patientId: preflight.patient.patientId,
          canonicalPatientId: preflight.patient.patientId,
          encounterId: normalizeText(req.body?.encounterId),
          practitionerId: preflight.practitioner.practitionerId,
          practitionerLabel: preflight.practitioner.label,
          selectedSlots: [preflight.selectedSlot],
          slot: preflight.selectedSlot,
          idempotencyKey: preflight.idempotencyKey,
          requestFingerprint: preflight.requestFingerprint,
          conversationKey: preflight.operationContext?.conversationId || null,
          ownerUserId: context.actor.userId,
          override: req.body?.override === true,
          onOverride: makeConflictOverrideAudit(auditLog, req, context),
        };
        const result = await bookingEngineStore.reserveAndConfirmIdempotent(input, {
          onCommitted: async (booking) =>
            appendStrictAudit(auditLog, {
              action: 'bookings.create_committed',
              actor,
              target: { kind: 'booking', id: booking.bookingId, tenantId: context.tenantId },
              result: 'ok',
              detail: {
                patientId: preflight.patient.patientId,
                idempotencyKey: preflight.idempotencyKey,
                requestFingerprint: preflight.requestFingerprint,
              },
            }),
        });
        if (result.replayed)
          appendStrictAudit(auditLog, {
            action: 'bookings.create_replayed',
            actor,
            target: { kind: 'booking', id: result.booking.bookingId, tenantId: context.tenantId },
            result: 'ok',
            detail: { idempotencyKey: preflight.idempotencyKey },
          });
        if (!result.replayed) {
          await dispatchCustomerBookingConfirmation(result.booking, context);
        }
        if (result.booking?.conversationKey) {
          await recordBookingConversationEvent({
            conversationStateStore,
            tenantId: context.tenantId,
            conversationKey: result.booking.conversationKey,
            bookingId: result.booking.bookingId,
            kind: 'created',
            actorUserId: context.actor?.userId,
          });
        }
        return res.json({
          provider: 'cco_engine',
          ok: true,
          booking: result.booking,
          idempotency: { key: preflight.idempotencyKey, replayed: result.replayed },
          audit: { appendOnly: true },
          recovery: { compensated: false },
        });
      } catch (error) {
        const compensated = error?.metadata?.compensated === true;
        appendStrictAudit(auditLog, {
          action: compensated ? 'bookings.create_compensated' : 'bookings.create_failed',
          actor,
          target: auditTarget,
          result: 'error',
          detail: {
            idempotencyKey: preflight.idempotencyKey,
            code: error?.metadata?.code || '',
            compensated,
          },
        });
        throw error;
      }
    })
  );

  router.get('/cco-booking-engine/legacy-catalog', async (req, res) =>
    handle(req, res, async (context) => {
      requireStaffRole(context);
      const bundle = loadLegacyCatalogBundle();
      const includeDetails = normalizeText(req.query.details) === '1';
      return res.json({
        ok: true,
        provider: 'legacy_migration_catalogs',
        exportedAt: bundle.exportedAt,
        counts: bundle.counts,
        catalogs: includeDetails ? bundle.catalogs : undefined,
        policyNote:
          'Staff read-only. Publik webb-bokning förblir av tills explicit go-live (ARCANA_PUBLIC_WEB_BOOKING_ENABLED).',
      });
    })
  );

  router.get('/cco-booking-engine/runtime-catalog', async (req, res) =>
    handle(req, res, async (context) => {
      requireStaffRole(context);
      const readout = await bookingEngineStore.getRuntimeCatalog();
      return res.json({
        ok: true,
        provider: 'cco_engine_runtime_catalog',
        ...readout,
      });
    })
  );

  // P6.8.8 — Meridiq-samtycken (39 st) staff-readout. Per-tjänst-bindning
  // (P6.8.9) sker separat när service-bindings-catalog.json mappar
  // consent → service. Här returnerar vi katalogen grupperad per brand.
  router.get('/cco-booking-engine/consent-catalog', async (req, res) =>
    handle(req, res, async (context) => {
      requireStaffRole(context);
      const activeOnly = normalizeText(req.query?.activeOnly) !== '0';
      const readout = buildMeridiqConsentReadout({ activeOnly });
      return res.json({
        ok: true,
        provider: 'meridiq_consent_catalog',
        policyNote:
          'Staff read-only. Per-tjänst-bindning (P6.8.9) levereras separat när service-bindings-catalog.json mappar consent → service.',
        ...readout,
      });
    })
  );

  router.get('/cco-booking-engine/catalog', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingCatalogRead(context);
      const [resources, services] = await Promise.all([
        bookingEngineStore.listResources(),
        bookingEngineStore.listServices(),
      ]);
      const runtimeCatalog =
        typeof bookingEngineStore.getRuntimeCatalog === 'function'
          ? await bookingEngineStore.getRuntimeCatalog()
          : null;
      return res.json({
        provider: 'cco_engine',
        resources,
        services,
        serviceVariants: buildInternalServiceVariantCatalog(runtimeCatalog?.services || services),
      });
    })
  );

  router.get('/cco-booking-engine/availability', async (req, res) =>
    handle(req, res, async (context) => {
      const fromDate = normalizeText(req.query.fromDate);
      const toDate = normalizeText(req.query.toDate);
      const resIds = normalizeText(req.query.resIds);
      const srvIds = normalizeText(req.query.srvIds);
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'availability_range_missing' });
      }
      const slots = await bookingEngineStore.listAvailability({
        tenantId: context.tenantId,
        fromDate,
        toDate,
        resIds,
        srvIds,
        excludeConversationId: normalizeText(
          req.query.excludeConversationId || req.query.conversationId
        ),
      });
      return res.json({
        provider: 'cco_engine',
        slots,
      });
    })
  );

  /**
   * ORD-181 — tillgänglighetsregler som personalen kan förvalta.
   *
   * MÄTT I PRODUKTION 2026-09-03: 11 av 14 publikt bokningsbara tjänster hade
   * noll tider. Personalen kunde inte rätta det — reglerna stod redan märkta
   * `managedBy: 'staff'`, men det fanns varken store-metod eller API för att
   * skapa en. Etiketten sa "personalen förvaltar det här"; ingen kunde det.
   *
   * Det är hindret som gör CCO oanvändbart som Cliento-ersättare.
   *
   * Läsning kräver bookings.read, skrivning bookings.write — samma rättigheter
   * som resten av motorns operatörs-API, inga nya begrepp.
   */
  router.get('/cco-booking-engine/availability-rules', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingCatalogRead(context);
      const rules = bookingEngineStore.listAvailabilityRules({
        serviceId: normalizeText(req.query.serviceId),
        resourceId: normalizeText(req.query.resourceId),
        includeInactive: normalizeText(req.query.includeInactive) === 'true',
      });
      return res.json({ provider: 'cco_engine', count: rules.length, rules });
    })
  );

  router.post('/cco-booking-engine/availability-rules', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { rule, created } = await bookingEngineStore.upsertAvailabilityRule(
        {
          ruleId: normalizeText(body.ruleId),
          resourceId: normalizeText(body.resourceId),
          serviceId: normalizeText(body.serviceId),
          weekdays: body.weekdays,
          startTimes: body.startTimes,
          locationLabel: normalizeText(body.locationLabel),
          active: body.active !== false,
        },
        createAuditActor(req, context)
      );
      // appendStrictAudit, inte en valfri logg. Den KASTAR om audit saknas, och
      // det är avsikten: en schemaändring som ingen kan spåra ska inte gå
      // igenom. "Varför fanns det inga tider den veckan" måste gå att svara på.
      appendStrictAudit(auditLog, {
        action: created
          ? 'bookings.availability_rule_created'
          : 'bookings.availability_rule_updated',
        actor: createAuditActor(req, context),
        target: { kind: 'availability_rule', id: rule.ruleId, tenantId: context.tenantId },
        result: 'ok',
        detail: {
          serviceId: rule.serviceId,
          resourceId: rule.resourceId,
          weekdays: rule.weekdays,
          startTimes: rule.startTimes.length,
        },
      });
      return res.status(created ? 201 : 200).json({ provider: 'cco_engine', created, rule });
    })
  );

  router.delete('/cco-booking-engine/availability-rules/:ruleId', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      const { rule, changed } = await bookingEngineStore.deactivateAvailabilityRule(
        req.params.ruleId,
        createAuditActor(req, context)
      );
      if (changed) {
        appendStrictAudit(auditLog, {
          action: 'bookings.availability_rule_deactivated',
          actor: createAuditActor(req, context),
          target: { kind: 'availability_rule', id: rule.ruleId, tenantId: context.tenantId },
          result: 'ok',
          detail: { serviceId: rule.serviceId, resourceId: rule.resourceId },
        });
      }
      return res.json({ provider: 'cco_engine', changed, rule });
    })
  );

  router.get('/cco-booking-engine/case-summary', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const [summary, rawBookingCase] = await Promise.all([
        bookingEngineStore.getCaseSummary({ ...context, excludeTestData: true }),
        bookingStore.getCase(context),
      ]);
      const bookingCase = await enrichBookingCaseWithHistorySignals(rawBookingCase, historyStore);
      const gate = await loadTreatmentBookingGate(context, bookingCase, req.body || {});
      const payload = summaryPayload(summary, bookingCase);
      return res.json({
        provider: 'cco_engine',
        ...mergeAgreementBlocker(payload, gate),
      });
    })
  );

  router.post('/cco-booking-engine/reservations', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      requireBookingContext(context);
      await enforceTreatmentBookingGate(context, req.body || {});
      const reservations = await bookingEngineStore.reserveSlots({
        ...toCaseInput(context, req.body),
        override: req.body?.override === true,
        onOverride: makeConflictOverrideAudit(auditLog, req, context),
      });
      await bookingStore.setCandidateSlots({
        ...toCaseInput(context, req.body),
        selectedSlots: reservations.map((item) => item.slot),
      });
      const bookingCaseWithEvent = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_slots_reserved',
        label: 'Tider reserverade i CCO',
        detail: `CCO reserverade ${reservations.length} tid${reservations.length === 1 ? '' : 'er'} i den egna bokningsmotorn.`,
        metadata: {
          reservationIds: reservations.map((item) => item.reservationId),
          slotIds: reservations.map((item) => item.slot?.slotId).filter(Boolean),
        },
      });
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      const patientRecord = await syncBookingPatient360(context, bookingCaseWithEvent, {
        source: 'cco_booking_engine_reservations',
        includeTimelineEvent: true,
      });
      return res.json({
        provider: 'cco_engine',
        reservations,
        bookingCase: bookingCaseWithEvent,
        bookingEngine: summaryPayload(bookingEngine, bookingCaseWithEvent),
        patient360: patientPayload(patientRecord),
      });
    })
  );

  router.post('/cco-booking-engine/reservations/renew', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      requireBookingContext(context);
      const reservations = await bookingEngineStore.renewReservations({
        ...toCaseInput(context, req.body),
        extensionMinutes: req.body?.extensionMinutes,
      });
      const bookingCaseWithEvent = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_reservations_renewed',
        label: 'Reservation förnyad i CCO',
        detail:
          reservations.length === 1
            ? 'En reserverad tid förnyades i CCO:s bokningsmotor.'
            : `${reservations.length} reserverade tider förnyades i CCO:s bokningsmotor.`,
        metadata: {
          reservationIds: reservations.map((item) => item.reservationId),
          slotIds: reservations.map((item) => item.slot?.slotId).filter(Boolean),
          nextExpiryAt: normalizeText(reservations[0]?.expiresAt),
        },
      });
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      const patientRecord = await syncBookingPatient360(context, bookingCaseWithEvent, {
        source: 'cco_booking_engine_renew_reservations',
        includeTimelineEvent: true,
      });
      return res.json({
        provider: 'cco_engine',
        reservations,
        bookingCase: bookingCaseWithEvent,
        bookingEngine: summaryPayload(bookingEngine, bookingCaseWithEvent),
        patient360: patientPayload(patientRecord),
      });
    })
  );

  router.post('/cco-booking-engine/confirm', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      requireBookingContext(context);
      await enforceTreatmentBookingGate(context, req.body || {});
      const booking = await bookingEngineStore.confirmBooking({
        ...toCaseInput(context, req.body),
        slot: req.body?.slot || req.body?.selectedSlot,
        override: req.body?.override === true,
        onOverride: makeConflictOverrideAudit(auditLog, req, context),
      });
      let bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        selectedSlots: [booking.slot],
        status: 'confirmed_external',
        notes: normalizeText(req.body?.notes),
        statusSource: 'cco_engine',
      });
      bookingCase = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_booking_confirmed',
        label: 'Bokning bekräftad i CCO',
        detail: 'Tiden bekräftades i CCO:s egen bokningsmotor.',
        metadata: {
          bookingId: booking.bookingId,
          slotId: booking.slot?.slotId,
        },
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_booking_engine_confirm',
        includeTimelineEvent: true,
      });
      let journalSync = null;
      if (journalStore && treatmentEncounterStore) {
        let patientId = normalizeText(req.body?.patientId);
        if (!patientId && patientMasterStore && context.customerEmail) {
          const patient = await patientMasterStore.findPatientByEmail({
            tenantId: context.tenantId,
            email: context.customerEmail,
          });
          patientId = normalizeText(patient?.id);
        }
        if (patientId) {
          try {
            journalSync = await syncBookingConfirmedToJournal({
              treatmentEncounterStore,
              journalStore,
              tenantId: context.tenantId,
              patientId,
              conversationId: context.conversationId,
              booking,
              channel: 'cco_staff',
            });
          } catch (syncError) {
            console.warn(
              '[cco-booking-engine/confirm] journal sync failed:',
              syncError && syncError.message ? syncError.message : syncError
            );
          }
        }
      }
      const staffNotify = await notifyStaffBookingEvent('confirm', {
        ...booking,
        customerName: context.customerName,
        customerEmail: context.customerEmail,
      });

      const confirmationEmail = await dispatchCustomerBookingConfirmation(booking, context);

      await linkCommercialOpDateFromBookingSafe(context, req.body, booking, {
        opDate: opDateFromBooking(booking),
        eventType: 'op_date_set_from_booking',
        eventLabel: 'OP-datum satt från behandlingsbokning',
        route: 'confirm',
      });

      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        booking,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
        journalSync,
        staffNotify,
        confirmationEmail,
      });
    })
  );

  router.post('/cco-booking-engine/cancel', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      requireBookingContext(context);
      const cancelReason = normalizeText(req.body?.reason);
      const summaryBeforeCancel = await bookingEngineStore.getCaseSummary(context);
      const cancelledBooking = summaryBeforeCancel?.booking || null;
      const result = await bookingEngineStore.cancelBooking({
        ...context,
        reason: cancelReason,
      });
      // ORD-140 §4 + ORD-148: stäng bara uppföljningstiden själv (A); B och C
      // flaggar för människa. En avbokad behandling stänger INTE serien —
      // patienten kan boka om. Fall A väntar på länkningen vid bokning.
      // Fel här får aldrig fälla avbokningen.
      let followUpCancellation = { handled: false, reason: 'not_wired' };
      if (
        aftercareStore &&
        treatmentEncounterStore &&
        journalStore &&
        cancelledBooking?.bookingId
      ) {
        try {
          followUpCancellation = await resolveBookingCancellation({
            tenantId: context.tenantId,
            bookingId: cancelledBooking.bookingId,
            encounterStore: treatmentEncounterStore,
            journalStore,
            aftercareStore,
            reason: cancelReason,
            eventId: cancelledBooking.bookingId,
            actor: { role: 'operator' },
          });
        } catch (err) {
          followUpCancellation = { handled: false, error: err.message };
          // En trasig uppföljningsstängning får inte fälla avbokningen — men den
          // får inte heller bli tyst. Logga så felet syns där en operatör tittar.
          console.warn(
            '[cco-booking-engine/cancel] uppföljningsstängning misslyckades:',
            err && err.message ? err.message : err
          );
        }
      }
      let bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status: 'cancelled',
      });
      bookingCase = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_booking_cancelled',
        label: 'Bokning avbokad i CCO',
        detail: cancelReason || 'Bokningen avbokades i CCO:s egen bokningsmotor.',
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_booking_engine_cancel',
        includeTimelineEvent: true,
      });
      const cancelledBookingForMail = {
        ...(cancelledBooking || {}),
        ...(result?.booking || {}),
        customerName: context.customerName || cancelledBooking?.customerName,
        customerEmail: context.customerEmail || cancelledBooking?.customerEmail,
        tenantId: context.tenantId,
      };
      const staffNotify = await notifyStaffBookingEvent('cancel', cancelledBookingForMail, {
        reason: cancelReason,
      });
      let customerCancellationEmail = { skipped: true, reason: 'no_booking' };
      if (cancelledBooking && cancelledBookingForMail.customerEmail) {
        try {
          customerCancellationEmail = await dispatchBookingCancellationEmail({
            booking: cancelledBookingForMail,
            graphSendConnector,
            patientCareStateStore,
            fromEmail:
              normalizeText(config?.bookingReminderFromEmail) ||
              normalizeText(config?.ccoCareReminderFromEmail),
            locale: normalizeText(req.body?.locale).toLowerCase() === 'en' ? 'en' : 'sv',
            reason: cancelReason,
            tenantId: context.tenantId,
            bookingEngineStore,
            automationBridge,
          });
        } catch (error) {
          console.warn(
            '[cco-booking-engine/cancel] customer cancellation email failed:',
            error && error.message ? error.message : error
          );
          customerCancellationEmail = { skipped: true, reason: 'send_failed' };
        }
      }
      await linkCommercialOpDateFromBookingSafe(
        context,
        req.body,
        cancelledBooking || result?.booking,
        {
          opDate: '',
          eventType: 'op_date_cleared_from_booking',
          eventLabel: 'OP-datum rensat efter avbokning',
          route: 'cancel',
        }
      );
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        result,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
        staffNotify,
        customerCancellationEmail,
        followUpCancellation,
      });
    })
  );

  router.post('/cco-booking-engine/rebook', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingWrite(context);
      requireBookingContext(context);
      await enforceTreatmentBookingGate(context, req.body || {});
      const booking = await bookingEngineStore.rebookBooking({
        ...toCaseInput(context, req.body),
        selectedSlots:
          req.body?.selectedSlots || req.body?.slots || [req.body?.slot].filter(Boolean),
        slot: req.body?.slot || asArray(req.body?.selectedSlots || req.body?.slots)[0],
        reason: normalizeText(req.body?.reason),
        override: req.body?.override === true,
        onOverride: makeConflictOverrideAudit(auditLog, req, context),
      });
      let bookingCase = await bookingStore.setCandidateSlots({
        ...toCaseInput(context, req.body),
        selectedSlots: [booking.slot],
      });
      bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status: 'confirmed_external',
        statusSource: 'cco_engine',
      });
      bookingCase = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_booking_rebooked',
        label: 'Bokning ombokad i CCO',
        detail: 'Tidigare bokning ersattes med en ny bekräftad tid i CCO:s bokningsmotor.',
        metadata: {
          bookingId: booking.bookingId,
          slotId: booking.slot?.slotId,
          previousBookingId: booking.previousBooking?.bookingId || '',
          previousSlotId: booking.previousSlot?.slotId || '',
          previousSlot: booking.previousSlot || null,
          nextSlot: booking.slot || null,
        },
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_booking_engine_rebook',
        includeTimelineEvent: true,
      });
      await linkCommercialOpDateFromBookingSafe(context, req.body, booking, {
        opDate: opDateFromBooking(booking),
        eventType: 'op_date_set_from_booking',
        eventLabel: 'OP-datum uppdaterat vid ombokning',
        route: 'rebook',
      });
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        booking,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
      });
    })
  );

  return router;
}

module.exports = {
  createCcoBookingEngineRouter,
};
