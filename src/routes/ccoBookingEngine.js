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
const { syncBookingConfirmedToJournal } = require('../ops/ccoJournalBookingBridge');
const { loadLegacyCatalogBundle } = require('../ops/legacyCatalogLoader');
const {
  notifyStaffBookingCancelled,
  notifyStaffBookingConfirmed,
} = require('../ops/ccoBookingStaffNotify');
const { dispatchBookingCancellationEmail } = require('../ops/ccoPatientCareOps');
const { buildMeridiqConsentReadout } = require('../ops/meridiqConsentCatalogRuntime');
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

function requireStaffRole(context) {
  const role = normalizeText(context?.actor?.role).toUpperCase();
  if (STAFF_ROLES.has(role)) return;
  const error = new Error('Otillräcklig behörighet.');
  error.statusCode = 403;
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
  treatmentAgreementStore = null,
  templateVersionApprovalStore = null,
  patientMasterStore = null,
  journalStore = null,
  treatmentEncounterStore = null,
  patientCareStateStore = null,
  authStore,
  config,
  graphSendConnector = null,
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

  async function enforceTreatmentBookingGate(context, body = {}) {
    return assertTreatmentBookingAllowed({
      treatmentAgreementStore,
      patientMasterStore,
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
      requireBookingContext(context);
      await enforceTreatmentBookingGate(context, req.body || {});
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
      await enforceTreatmentBookingGate(context, req.body || {});
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
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        booking,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
        journalSync,
        staffNotify,
      });
    })
  );

  router.post('/cco-booking-engine/cancel', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const cancelReason = normalizeText(req.body?.reason);
      const summaryBeforeCancel = await bookingEngineStore.getCaseSummary(context);
      const cancelledBooking = summaryBeforeCancel?.booking || null;
      const result = await bookingEngineStore.cancelBooking({
        ...context,
        reason: cancelReason,
      });
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
          });
        } catch (error) {
          console.warn(
            '[cco-booking-engine/cancel] customer cancellation email failed:',
            error && error.message ? error.message : error
          );
          customerCancellationEmail = { skipped: true, reason: 'send_failed' };
        }
      }
      const bookingEngine = await bookingEngineStore.getCaseSummary(context);
      return res.json({
        provider: 'cco_engine',
        result,
        bookingCase,
        bookingEngine: summaryPayload(bookingEngine, bookingCase),
        patient360: patientPayload(patientRecord),
        staffNotify,
        customerCancellationEmail,
      });
    })
  );

  router.post('/cco-booking-engine/rebook', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      await enforceTreatmentBookingGate(context, req.body || {});
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
