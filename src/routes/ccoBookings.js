const express = require('express');

const { getClientoApiConfigForBrand, getClientoConfigForBrand } = require('../brand/runtimeConfig');
const { resolveBrandForHost } = require('../brand/resolveBrand');
const {
  createClientoApi,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
} = require('../infra/clientoApi');
const {
  BOOKING_STATUSES,
  buildWaitingCustomerBlocker,
  buildWaitingCustomerContext,
  buildPostConfirmationContext,
  buildBookingCaseRecommendationMeta,
  enrichBookingCaseWithHistorySignals,
} = require('../ops/ccoBookingStore');
const { syncPatient360FromBookingCase } = require('../ops/ccoPatient360Bridge');
const { assertTreatmentBookingAllowed } = require('../ops/ccoTreatmentBookingGate');

const WORKSPACE_ID = 'major-arcana-preview';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function buildBookingCaseWorkflowBlocker(bookingCase = {}, bookingEngine = null) {
  const safeCase = bookingCase && typeof bookingCase === 'object' ? bookingCase : {};
  const safeEngine = bookingEngine && typeof bookingEngine === 'object' ? bookingEngine : {};
  const postConfirmationContext = buildPostConfirmationContext(safeCase);
  const status = normalizeKey(safeCase.status);
  const slotCount = asArray(safeCase.selectedSlots).length;
  const hasOffer =
    status === 'offered' ||
    status === 'waiting_customer' ||
    Boolean(normalizeText(safeCase.offeredAt)) ||
    hasBookingEvent(safeCase, ['offer_draft_inserted']);

  if (status === 'cancelled' || status === 'closed') {
    return createWorkflowBlocker({
      label: 'Redo',
      tone: 'closed',
      nextActionLabel: status === 'closed' ? 'stängd' : 'avbruten',
    });
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
  if (isBookingOfferStaleAfterRebook(safeCase)) {
    return createWorkflowBlocker({
      key: 'insert_studio',
      label: 'Erbjudandet är gammalt',
      score: 23,
      action: 'insert_studio',
      nextActionLabel: 'uppdatera Svarstudio',
      tone: 'attention',
    });
  }
  if (!slotCount) {
    return createWorkflowBlocker({
      key: 'candidate_slots',
      label: 'Saknar tider',
      score: 30,
      action: 'candidate_slots',
      nextActionLabel: 'välj kandidat-tider',
      tone: 'attention',
    });
  }
  if (status === 'waiting_customer' && hasOffer) {
    return buildWaitingCustomerBlocker(safeCase);
  }
  if (safeEngine.hasConfirmedBooking === true) {
    if (status === 'confirmed_external' || normalizeText(safeCase.confirmedExternalAt)) {
      return createWorkflowBlocker({
        key: 'customer_state',
        label: 'Redo att stänga',
        score: 10,
        action: 'set_status:closed',
        nextActionLabel: 'stäng ärendet',
        tone: 'ready',
      });
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
  if (safeEngine.hasReservations === true && safeEngine.expiresSoon === true) {
    return createWorkflowBlocker({
      key: 'reservation_expiring',
      label: 'Reservation utgår snart',
      score: 26,
      action: 'renew_reservation',
      nextActionLabel: 'förnya håll',
      tone: 'attention',
    });
  }
  if (safeEngine.hasReservations === false && safeEngine.state === 'idle') {
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
  if (status === 'confirmed_external' || normalizeText(safeCase.confirmedExternalAt)) {
    return createWorkflowBlocker({
      key: 'customer_state',
      label: 'Redo att stänga',
      score: 10,
      action: 'set_status:closed',
      nextActionLabel: 'stäng ärendet',
      tone: 'ready',
    });
  }
  return createWorkflowBlocker({
    key: 'customer_state',
    label: 'Saknar kundläge',
    score: 10,
    action: 'waiting_customer',
    nextActionLabel: 'markera kundläge',
    tone: 'stable',
  });
}

async function enrichBookingCaseWithEngine(bookingCase, bookingEngineStore) {
  if (!bookingEngineStore || !bookingCase || typeof bookingCase !== 'object') return bookingCase;
  const bookingEngine = await bookingEngineStore.getCaseSummary({
    tenantId: bookingCase.tenantId,
    workspaceId: bookingCase.workspaceId,
    conversationId: bookingCase.conversationId,
    customerEmail: bookingCase.customerEmail,
  });
  const blocker = buildBookingCaseWorkflowBlocker(bookingCase, bookingEngine);
  const waitingCustomer =
    normalizeKey(bookingCase?.status) === 'waiting_customer'
      ? buildWaitingCustomerContext(bookingCase)
      : null;
  const postConfirmation =
    normalizeKey(bookingCase?.status) === 'confirmed_external'
      ? buildPostConfirmationContext(bookingCase)
      : null;
  const recommendationMeta = buildBookingCaseRecommendationMeta(
    bookingCase,
    blocker,
    waitingCustomer
  );
  return {
    ...bookingCase,
    blocker,
    recommendedAction: normalizeText(blocker.action),
    ...recommendationMeta,
    bookingEngineState: normalizeText(bookingEngine?.state),
    postConfirmation,
    waitingCustomer,
  };
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
      authMode: 'session',
    };
  }

  if (isLocalPreviewRequest(req)) {
    return {
      tenantId: config.defaultTenantId,
      userId: 'preview-local',
      role: 'OWNER',
      authMode: 'preview_local',
    };
  }

  const error = new Error('Inloggning krävs.');
  error.statusCode = 401;
  throw error;
}

function resolveBrandFromRequest(req, config) {
  const candidates = [];
  const sourceUrl = normalizeText(req.query?.sourceUrl || req.body?.sourceUrl);
  if (sourceUrl) {
    try {
      candidates.push(new URL(sourceUrl).hostname);
    } catch {
      // ignore invalid sourceUrl hints
    }
  }
  const requestedHost = normalizeText(req.query?.host || req.body?.host);
  if (requestedHost) candidates.push(requestedHost);
  if (req.get('host')) candidates.push(req.get('host'));
  if (req.hostname) candidates.push(req.hostname);

  for (const candidate of candidates) {
    const resolved = resolveBrandForHost(candidate, {
      defaultBrand: config.brand,
      brandByHost: config.brandByHost,
    });
    if (resolved) return resolved;
  }
  return config.brand;
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
  const error = new Error('Välj en aktiv tråd med kund innan bokningsytan används.');
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
    source: normalizeText(body.source) || 'operator',
    ownerUserId: context.actor.userId,
    ownerName: normalizeText(body.ownerName),
    requestedTreatment: normalizeText(body.requestedTreatment),
    preferredWindow: normalizeText(body.preferredWindow),
    notes: normalizeText(body.notes),
    status: normalizeText(body.status),
    selectedSlots: body.selectedSlots,
  };
}

function formatOfferSlotTime(slot = {}) {
  const startsAt = normalizeText(slot.startsAt);
  const endsAt = normalizeText(slot.endsAt);
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!startsAt || Number.isNaN(startMs)) return 'Tid saknas';

  const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Stockholm',
  });
  const timeFormatter = new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  });
  const start = new Date(startMs);
  const dateLabel = dateFormatter.format(start).replace('.', '');
  const startLabel = timeFormatter.format(start);
  if (!Number.isNaN(endMs)) {
    const endLabel = timeFormatter.format(new Date(endMs));
    return `${dateLabel} kl. ${startLabel}-${endLabel}`;
  }
  return `${dateLabel} kl. ${startLabel}`;
}

function buildOfferDraft({ bookingCase }) {
  const slots = Array.isArray(bookingCase?.selectedSlots) ? bookingCase.selectedSlots : [];
  const lines = slots.map((slot, index) => {
    const label = slot.resourceLabel ? ` hos ${slot.resourceLabel}` : '';
    const service = slot.serviceLabel ? ` (${slot.serviceLabel})` : '';
    return `${index + 1}. ${formatOfferSlotTime(slot)}${label}${service}`;
  });
  const slotCopy = lines.length
    ? lines.join('\n')
    : 'Jag kan ta fram konkreta tider åt dig direkt.';
  return `Hej,\n\nJag hjälper dig gärna med bokningen. Här är tiderna jag kan erbjuda just nu:\n\n${slotCopy}\n\nSvara gärna med vilken tid som passar bäst, så hjälper vi dig vidare.`;
}

function createCcoBookingsRouter({
  bookingStore,
  bookingEngineStore = null,
  historyStore = null,
  patientSystemStore = null,
  treatmentAgreementStore = null,
  patientMasterStore = null,
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
      source: options.source || 'cco_bookings',
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
      return res.status(500).json({ error: 'Kunde inte hantera bokningsytan.' });
    }
  }

  router.get('/cco-bookings/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.ensureCase({
        ...toCaseInput(context),
        status: 'needs_triage',
      });
      const bookingEngine = bookingEngineStore
        ? await bookingEngineStore.getCaseSummary(context)
        : null;
      const bookingCaseWithHistory = await enrichBookingCaseWithHistorySignals(
        bookingCase,
        historyStore
      );
      const enrichedBookingCase = bookingEngineStore
        ? await enrichBookingCaseWithEngine(bookingCaseWithHistory, bookingEngineStore)
        : bookingCaseWithHistory;
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_case_read',
      });
      return res.json({
        bookingCase: enrichedBookingCase,
        bookingEngine,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
        statuses: BOOKING_STATUSES,
      });
    })
  );

  router.get('/cco-bookings/cases', async (req, res) =>
    handle(req, res, async (context) => {
      const status = normalizeKey(req.query.status);
      if (status && status !== 'all' && !BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Okänd bokningsstatus.' });
      }
      const requestedLimit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
      const rawCases = await bookingStore.listCases({
        tenantId: context.tenantId,
        customerEmail: normalizeText(req.query.customerEmail),
        status: status && status !== 'all' ? status : '',
        sort: 'recent',
        limit: bookingEngineStore ? Math.max(requestedLimit, 50) : requestedLimit,
      });
      const historyAwareCases = await Promise.all(
        rawCases.map((bookingCase) =>
          enrichBookingCaseWithHistorySignals(bookingCase, historyStore)
        )
      );
      const cases = bookingEngineStore
        ? await Promise.all(
            historyAwareCases.map((bookingCase) =>
              enrichBookingCaseWithEngine(bookingCase, bookingEngineStore)
            )
          )
        : historyAwareCases;
      const sortMode = normalizeKey(req.query.sort) === 'blocked' ? 'blocked' : 'recent';
      const sortedCases = cases
        .slice()
        .sort((left, right) => {
          if (sortMode === 'blocked') {
            const scoreDelta =
              Number(right?.blocker?.score || 0) - Number(left?.blocker?.score || 0);
            if (scoreDelta) return scoreDelta;
            const recommendationDelta =
              ({
                act_now_overdue: 60,
                reengage_now: 50,
                act_now: 40,
                set_customer_state: 30,
                monitor: 20,
                ready_to_close: 10,
              }[normalizeKey(right?.recommendedActionState)] || 0) -
              ({
                act_now_overdue: 60,
                reengage_now: 50,
                act_now: 40,
                set_customer_state: 30,
                monitor: 20,
                ready_to_close: 10,
              }[normalizeKey(left?.recommendedActionState)] || 0);
            if (recommendationDelta) return recommendationDelta;
          }
          return (
            Date.parse(normalizeText(right?.updatedAt)) - Date.parse(normalizeText(left?.updatedAt))
          );
        })
        .slice(0, requestedLimit);
      return res.json({
        cases: sortedCases,
        statuses: BOOKING_STATUSES,
      });
    })
  );

  router.put('/cco-bookings/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.upsertCase(toCaseInput(context, req.body));
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_case_upsert',
        includeTimelineEvent: true,
      });
      return res.json({
        bookingCase,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
      });
    })
  );

  router.post('/cco-bookings/candidates', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      await assertTreatmentBookingAllowed({
        treatmentAgreementStore,
        patientMasterStore,
        tenantId: context.tenantId,
        customerEmail: context.customerEmail,
        patientId: normalizeText(req.body?.patientId),
        body: req.body || {},
      });
      const reservedSlots = bookingEngineStore
        ? await bookingEngineStore.reserveSlots({
            ...toCaseInput(context, req.body),
            selectedSlots: req.body?.selectedSlots || req.body?.slots,
          })
        : null;
      const bookingCase = await bookingStore.setCandidateSlots({
        ...toCaseInput(context, req.body),
        selectedSlots: reservedSlots
          ? reservedSlots.map((item) => item.slot)
          : req.body?.selectedSlots || req.body?.slots,
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_candidates',
        includeTimelineEvent: true,
      });
      return res.json({
        bookingCase,
        bookingEngine:
          bookingEngineStore && reservedSlots
            ? {
                reservations: reservedSlots,
                booking: null,
              }
            : null,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
      });
    })
  );

  router.post('/cco-bookings/status', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const status = normalizeKey(req.body?.status);
      if (!BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'Okänd bokningsstatus.' });
      }
      const bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status,
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_status',
        includeTimelineEvent: true,
      });
      return res.json({
        bookingCase,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
      });
    })
  );

  router.post('/cco-bookings/event', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const label = normalizeText(req.body?.label);
      const detail = normalizeText(req.body?.detail);
      if (!label && !detail) {
        return res.status(400).json({ error: 'Bokningshändelsen saknar text.' });
      }
      const bookingCase = await bookingStore.addEvent({
        ...toCaseInput(context, req.body),
        type: normalizeText(req.body?.type) || 'operator_note',
        label,
        detail,
        metadata: asObject(req.body?.metadata),
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_event',
        includeTimelineEvent: true,
      });
      return res.json({
        bookingCase,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
      });
    })
  );

  router.post('/cco-bookings/offer-draft', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status: 'offered',
      });
      const patientRecord = await syncBookingPatient360(context, bookingCase, {
        source: 'cco_bookings_offer_draft',
        includeTimelineEvent: true,
      });
      return res.json({
        bookingCase,
        patient360: patientRecord
          ? {
              attention: patientRecord.patient360,
              modules: patientRecord.modules,
              identity: patientRecord.identity,
              timelineCount: Array.isArray(patientRecord.timeline)
                ? patientRecord.timeline.length
                : 0,
              updatedAt: patientRecord.updatedAt,
            }
          : null,
        draft: buildOfferDraft({ bookingCase }),
      });
    })
  );

  router.get('/cco-bookings/slots', async (req, res) =>
    handle(req, res, async (context) => {
      const fromDate = normalizeText(req.query.fromDate);
      const toDate = normalizeText(req.query.toDate);
      const resIds = normalizeCsvParam(req.query.resIds);
      const srvIds = normalizeCsvParam(req.query.srvIds);
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'availability_range_missing' });
      }
      if (bookingEngineStore && normalizeKey(req.query.provider) !== 'external') {
        const slots = await bookingEngineStore.listAvailability({
          tenantId: context.tenantId,
          fromDate,
          toDate,
          resIds: resIds || '',
          srvIds: srvIds || '',
          excludeConversationId: normalizeText(req.query.conversationId),
        });
        return res.json({
          raw: null,
          provider: 'cco_engine',
          slots,
          bookingUrl: null,
        });
      }
      const brand = resolveBrandFromRequest(req, config);
      const clientoApiConfig = getClientoApiConfigForBrand(brand, config);
      const cliento = getClientoConfigForBrand(brand, config);
      if (!clientoApiConfig.partnerId) {
        return res.status(503).json({ error: 'cliento_partner_id_missing' });
      }
      const api = createClientoApi(clientoApiConfig);
      const payload = await api.getSlots({ fromDate, toDate, resIds, srvIds });
      return res.json({
        raw: payload,
        slots: normalizeClientoSlotsPayload(payload),
        bookingUrl: cliento.bookingUrl || null,
      });
    })
  );

  router.get('/cco-bookings/ref-data', async (req, res) =>
    handle(req, res, async () => {
      if (bookingEngineStore && normalizeKey(req.query.provider) !== 'external') {
        const [resources, services] = await Promise.all([
          bookingEngineStore.listResources(),
          bookingEngineStore.listServices(),
        ]);
        return res.json({
          raw: null,
          provider: 'cco_engine',
          resources: resources.map((item) => ({ id: item.id, label: item.label })),
          services: services.map((item) => ({ id: item.id, label: item.label })),
        });
      }
      const brand = resolveBrandFromRequest(req, config);
      const clientoApiConfig = getClientoApiConfigForBrand(brand, config);
      if (!clientoApiConfig.partnerId) {
        return res.status(503).json({ error: 'cliento_partner_id_missing' });
      }
      const api = createClientoApi(clientoApiConfig);
      const payload = await api.getRefData();
      return res.json({
        raw: payload,
        ...normalizeClientoRefDataPayload(payload),
      });
    })
  );

  return router;
}

module.exports = {
  buildOfferDraft,
  createCcoBookingsRouter,
};
