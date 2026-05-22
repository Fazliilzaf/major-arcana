const express = require('express');

const {
  buildBookingCaseBlockerReadout,
  buildBookingCaseRecommendationMeta,
  buildPostConfirmationContext,
  buildWaitingCustomerBlocker,
  buildWaitingCustomerContext,
  enrichBookingCaseWithHistorySignals,
} = require('../ops/ccoBookingStore');
const { syncPatient360FromBookingCase } = require('../ops/ccoPatient360Bridge');

const WORKSPACE_ID = 'major-arcana-preview';

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

function isLocalPreviewRequest(req) {
  const host = normalizeText(req.hostname || req.get('host'))
    .split(':')[0]
    .toLowerCase();
  const ip = normalizeText(req.ip || req.socket?.remoteAddress || '').toLowerCase();
  return (
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
  );
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

  if (isLocalPreviewRequest(req)) {
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
  authStore,
  config,
}) {
  const router = express.Router();

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

  router.get('/cco-booking-engine/catalog', async (req, res) =>
    handle(req, res, async () => {
      const [resources, services] = await Promise.all([
        bookingEngineStore.listResources(),
        bookingEngineStore.listServices(),
      ]);
      return res.json({
        provider: 'cco_engine',
        resources,
        services,
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

  router.get('/cco-booking-engine/case-summary', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const [summary, rawBookingCase] = await Promise.all([
        bookingEngineStore.getCaseSummary(context),
        bookingStore.getCase(context),
      ]);
      const bookingCase = await enrichBookingCaseWithHistorySignals(rawBookingCase, historyStore);
      return res.json({
        provider: 'cco_engine',
        ...summaryPayload(summary, bookingCase),
      });
    })
  );

  router.post('/cco-booking-engine/reservations', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const reservations = await bookingEngineStore.reserveSlots({
        ...toCaseInput(context, req.body),
      });
      const bookingCase = await bookingStore.setCandidateSlots({
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
      requireBookingContext(context);
      const booking = await bookingEngineStore.confirmBooking({
        ...toCaseInput(context, req.body),
        slot: req.body?.slot || req.body?.selectedSlot,
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

  router.post('/cco-booking-engine/cancel', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const result = await bookingEngineStore.cancelBooking({
        ...context,
        reason: normalizeText(req.body?.reason),
      });
      let bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status: 'cancelled',
      });
      bookingCase = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: 'engine_booking_cancelled',
        label: 'Bokning avbokad i CCO',
        detail:
          normalizeText(req.body?.reason) || 'Bokningen avbokades i CCO:s egen bokningsmotor.',
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_booking_engine_cancel',
        includeTimelineEvent: true,
      });
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        result,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
      });
    })
  );

  router.post('/cco-booking-engine/rebook', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const booking = await bookingEngineStore.rebookBooking({
        ...toCaseInput(context, req.body),
        selectedSlots:
          req.body?.selectedSlots || req.body?.slots || [req.body?.slot].filter(Boolean),
        slot: req.body?.slot || asArray(req.body?.selectedSlots || req.body?.slots)[0],
        reason: normalizeText(req.body?.reason),
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
