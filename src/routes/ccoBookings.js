/**
 * @deprecated LEGACY routes — använd ccoBookingEngine.js istället.
 *
 * Hanterar äldre bokningsärenden (cases). Nya bokningar ska gå via
 * /api/v1/cco-booking-engine/* endpoints.
 *
 * Behålls för bakåtkompatibilitet med befintliga CCO-trådar som redan
 * har booking-cases skapade via detta API.
 */
const express = require('express');

const { getClientoApiConfigForBrand, getClientoConfigForBrand } = require('../brand/runtimeConfig');
const { resolveBrandForHost } = require('../brand/resolveBrand');
const {
  createClientoApi,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
} = require('../infra/clientoApi');
const { isClientoIntegrationEnabled } = require('../infra/clientoIntegration');
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
const { buildCalendarSignalsIndex } = require('../ops/bookingCalendarSignals');
const { buildMissingFormsReport } = require('../ops/ccoPatientCareOps');
const { normalizeBookingReminderLeadTimeConfig } = require('../ops/bookingReminderLeadTime');
const {
  collectBookingReadouts,
  buildCanonicalBookingIntegrityReport,
  buildUnlinkedClientoBookingReview,
  loadClientoLinkSidecarLedgerEvents,
} = require('../ops/ccoKunderBookingEnrichment');
const {
  buildClientoHistoricalShadowReadmodel,
} = require('../ops/clientoHistoricalShadowReadmodel');

const WORKSPACE_ID = 'major-arcana-preview';
const STAFF_ROLES = new Set(['OWNER', 'STAFF']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function isWebLeadBookingCase(bookingCase = {}) {
  if (normalizeKey(bookingCase.workspaceId) === 'web-public') return true;
  const conversationId = normalizeText(bookingCase.conversationId);
  if (conversationId.startsWith('web-')) return true;
  const events = Array.isArray(bookingCase.events) ? bookingCase.events : [];
  return events.some((event) => normalizeKey(event?.type) === 'web_public_reservation');
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
    // R4-passthrough: exponera reservation-expiry till frontend så
    // kalendern kan visa pulsande warning på tentativa nära expiresAt.
    nextExpiryAt: bookingEngine?.nextExpiryAt || null,
    expiresInMinutes: bookingEngine?.expiresInMinutes ?? null,
    expiresSoon: bookingEngine?.expiresSoon === true,
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

function parsePositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function clampHistoryLimit(value) {
  const parsed = parsePositiveInt(value, 50);
  return Math.min(Math.max(parsed || 50, 1), 100);
}

const STOCKHOLM_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Stockholm',
});

function formatStockholmTime(value) {
  const ms = Date.parse(normalizeText(value));
  if (!Number.isFinite(ms)) return '';
  return STOCKHOLM_TIME_FORMATTER.format(new Date(ms));
}

function stockholmIsoDate(value) {
  const ms = Date.parse(normalizeText(value));
  if (!Number.isFinite(ms)) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).formatToParts(new Date(ms));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year && byType.month && byType.day
    ? `${byType.year}-${byType.month}-${byType.day}`
    : '';
}

function buildPatientMetaById(patients = []) {
  const out = new Map();
  for (const patient of asArray(patients)) {
    const id = normalizeText(patient?.id);
    if (!id) continue;
    out.set(id, {
      name:
        normalizeText(patient?.displayName) ||
        normalizeText(patient?.name) ||
        normalizeText(patient?.fullName) ||
        normalizeText(patient?.identity?.name) ||
        '',
      email:
        normalizeText(patient?.primaryEmail) ||
        normalizeText(patient?.email) ||
        normalizeText(asArray(patient?.emails)[0]) ||
        '',
    });
  }
  return out;
}

function buildHistorySearchHaystack(row = {}) {
  return [
    row.bookingId,
    row.patientId,
    row.patientName,
    row.patientEmail,
    row.title,
    row.serviceDisplayName,
    row.serviceName,
    row.staffName,
    row.resourceLabel,
    row.status,
    row.source,
    row.notes,
    row.bookingNotes,
    row.customerMessage,
    row.internalNotes,
    row.treatmentNotes,
    asArray(row.sourceRecords)
      .map((record) => [record?.tenantId, record?.serviceLabel, record?.resourceLabel].join(' '))
      .join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function toHistorySearchRow(visit = {}, patientMetaById = new Map()) {
  const patientId = normalizeText(visit.patientId);
  const meta = patientMetaById.get(patientId) || {};
  const startsAt = normalizeText(visit.startsAt || visit.startAt);
  const endsAt = normalizeText(visit.endsAt || visit.endAt);
  const source = normalizeText(visit.source);
  const row = {
    kind: source === 'cliento_historical_shadow' ? 'approved_historical_shadow' : 'canonical_visit',
    readOnly: true,
    zeroWrites: true,
    linkAllowed: Boolean(patientId),
    patientId: patientId || null,
    encounterId: normalizeText(visit.encounterId) || null,
    canonicalEncounterId: normalizeText(visit.canonicalEncounterId || visit.encounterId) || null,
    bookingId: normalizeText(visit.bookingId || visit.id) || null,
    linkId: normalizeText(visit.linkId) || null,
    ledgerEventId: normalizeText(visit.ledgerEventId) || null,
    source,
    status: normalizeText(visit.status) || null,
    startsAt,
    endsAt: endsAt || null,
    stockholmDate: stockholmIsoDate(startsAt),
    stockholmTime: formatStockholmTime(startsAt),
    stockholmEndTime: formatStockholmTime(endsAt),
    timeZone: 'Europe/Stockholm',
    title: normalizeText(visit.title || visit.serviceDisplayName || visit.serviceName) || 'Bokning',
    serviceDisplayName:
      normalizeText(visit.serviceDisplayName || visit.serviceName || visit.title) || null,
    staffName:
      normalizeText(visit.staffName || visit.practitioner || visit.resourceLabel || visit.staff) ||
      null,
    patientName: normalizeText(visit.patientName) || meta.name || null,
    patientEmail: meta.email || null,
    notes: normalizeText(visit.notes) || null,
    bookingNotes: normalizeText(visit.bookingNotes) || null,
    customerMessage: normalizeText(visit.customerMessage) || null,
    internalNotes: normalizeText(visit.internalNotes) || null,
    treatmentNotes: normalizeText(visit.treatmentNotes) || null,
    shadowReadmodel: visit.shadowReadmodel === true,
    shadowReadOnly: visit.shadowReadOnly === true,
    historicalReason: normalizeText(visit.historicalReason) || null,
    provenance: visit.provenance || null,
    sourceRecords: asArray(visit.sourceRecords),
    shadowNoteSegments: asArray(visit.shadowNoteSegments),
  };
  row.searchText = buildHistorySearchHaystack(row);
  return row;
}

function sourceKeyFromRecord(record = {}) {
  const tenantId = normalizeText(record?.tenantId);
  const bookingId = normalizeText(record?.bookingId);
  return tenantId && bookingId ? `${tenantId}::${bookingId}` : '';
}

function buildSkippedLinkStateBySource(ledgerEvents = []) {
  const bySource = new Map();
  const byLink = new Map();
  for (const event of asArray(ledgerEvents)) {
    const linkId = normalizeText(event?.linkId);
    if (linkId) byLink.set(linkId, event);
  }
  for (const event of byLink.values()) {
    const state = normalizeText(event?.state);
    if (state === 'approved') continue;
    for (const ref of asArray(event?.sourceRefs)) {
      const key = `${normalizeText(ref?.tenantId)}::${normalizeText(ref?.bookingId)}`;
      if (key !== '::') bySource.set(key, state || 'unlinked');
    }
  }
  return bySource;
}

function toSeparateHistoricalRow(event = {}, skippedLinkStateBySource = new Map()) {
  const display = asObject(event.display);
  const sourceRecords = asArray(event.sourceRecords);
  const startsAt = normalizeText(display.startsAt);
  const states = Array.from(
    new Set(
      sourceRecords
        .map((record) => skippedLinkStateBySource.get(sourceKeyFromRecord(record)))
        .filter(Boolean)
    )
  );
  const reasonCode = states.length
    ? `ledger_${states.sort().join('_')}_separate`
    : normalizeText(event.reasonCode) || 'unlinked_or_unapproved';
  const row = {
    kind: 'separate_unlinked_historical',
    readOnly: true,
    zeroWrites: true,
    linkAllowed: false,
    patientId: null,
    encounterId: null,
    canonicalEncounterId: null,
    bookingId: normalizeText(event.bookingRef) || null,
    source: 'cliento_historical_shadow',
    status: normalizeText(display.status) || null,
    startsAt,
    endsAt: normalizeText(display.endsAt) || null,
    stockholmDate: stockholmIsoDate(startsAt),
    stockholmTime: formatStockholmTime(startsAt),
    stockholmEndTime: formatStockholmTime(display.endsAt),
    timeZone: 'Europe/Stockholm',
    title: normalizeText(display.serviceLabel) || 'Historisk Cliento-bokning',
    serviceDisplayName: normalizeText(display.serviceLabel) || null,
    staffName: normalizeText(sourceRecords[0]?.resourceLabel) || null,
    reasonCode,
    historicalReason: normalizeText(event.historicalReason) || reasonCode,
    sourceRecords,
    provenance: event.provenance || null,
  };
  row.searchText = buildHistorySearchHaystack(row);
  return row;
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
  clientoBookingStore = null,
  treatmentEncounterStore = null,
  historyStore = null,
  patientSystemStore = null,
  treatmentAgreementStore = null,
  patientMasterStore = null,
  patientCareStateStore = null,
  journalStore = null,
  settingsStore = null,
  readCache = null,
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
      const sourceFilter = normalizeKey(req.query.source);
      const sourceScopedCases =
        sourceFilter === 'web'
          ? cases.filter((bookingCase) => isWebLeadBookingCase(bookingCase))
          : cases;
      const sortMode = normalizeKey(req.query.sort) === 'blocked' ? 'blocked' : 'recent';
      const sortedCases = sourceScopedCases
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
        bookingStore,
        journalStore,
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

  router.get('/cco-bookings/calendar-bundle', async (req, res) =>
    handle(req, res, async (context) => {
      const fromDate = normalizeText(req.query.fromDate || req.query.from);
      const toDate = normalizeText(req.query.toDate || req.query.to);
      const resIds = normalizeCsvParam(req.query.resIds);
      const srvIds = normalizeCsvParam(req.query.srvIds);
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'availability_range_missing' });
      }
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
        fromDate > toDate
      ) {
        return res.status(400).json({ error: 'availability_range_invalid' });
      }

      const cacheKey = readCache
        ? readCache.buildKey(
            'calendar-bundle',
            context.tenantId,
            JSON.stringify({ fromDate, toDate, resIds, srvIds })
          )
        : '';

      const build = async () => {
        let slots = [];
        let blocks = [];
        if (bookingEngineStore && normalizeKey(req.query.provider) !== 'external') {
          [slots, blocks] = await Promise.all([
            bookingEngineStore.listAvailability({
              tenantId: context.tenantId,
              fromDate,
              toDate,
              resIds: resIds || '',
              srvIds: srvIds || '',
              excludeConversationId: normalizeText(req.query.conversationId),
            }),
            bookingEngineStore.listCalendarBlocks({
              fromDate,
              toDate,
              resIds: resIds || '',
            }),
          ]);
        }

        const cases =
          typeof bookingStore.listCasesInRange === 'function'
            ? await bookingStore.listCasesInRange({
                tenantId: context.tenantId,
                fromDate,
                toDate,
                limit: 200,
              })
            : await bookingStore.listCases({
                tenantId: context.tenantId,
                sort: 'recent',
                limit: 200,
              });

        let visits = [];
        if (patientMasterStore && clientoBookingStore) {
          try {
            const population = await patientMasterStore.listPatients({
              tenantId: context.tenantId,
              limit: 20000,
              offset: 0,
            });
            const patients = asArray(population?.patients);
            const engineBookings = bookingEngineStore?.listBookingsForEnrichment
              ? asArray(bookingEngineStore.listBookingsForEnrichment(context.tenantId)).filter(
                  (booking) => {
                    const date = normalizeText(booking?.slot?.startsAt || booking?.startsAt).slice(
                      0,
                      10
                    );
                    return date && date >= fromDate && date <= toDate;
                  }
                )
              : [];
            const clientoBookings = clientoBookingStore.listBookingsInRange
              ? asArray(
                  clientoBookingStore.listBookingsInRange({
                    tenantId: context.tenantId,
                    fromDate,
                    toDate,
                  })
                )
              : clientoBookingStore.listAllBookings
                ? asArray(
                    clientoBookingStore.listAllBookings({ tenantId: context.tenantId })
                  ).filter((booking) => {
                    const date = normalizeText(booking?.startsAt).slice(0, 10);
                    return date && date >= fromDate && date <= toDate;
                  })
                : [];
            const historicalShadowLedgerEvents = await loadClientoLinkSidecarLedgerEvents(
              config || {}
            );
            const historicalShadowClientoBookings = historicalShadowLedgerEvents.length
              ? clientoBookingStore.listBookingsInRange
                ? asArray(
                    clientoBookingStore.listBookingsInRange({
                      tenantId: '',
                      fromDate,
                      toDate,
                    })
                  )
                : clientoBookingStore.listAllBookings
                  ? asArray(clientoBookingStore.listAllBookings({ tenantId: '', limit: 0 })).filter(
                      (booking) => {
                        const date = normalizeText(booking?.startsAt).slice(0, 10);
                        return date && date >= fromDate && date <= toDate;
                      }
                    )
                  : clientoBookings
              : clientoBookings;
            const encounters = treatmentEncounterStore?.listEncountersForEnrichment
              ? asArray(
                  treatmentEncounterStore.listEncountersForEnrichment(context.tenantId)
                ).filter((encounter) => {
                  const date = normalizeText(encounter?.startsAt).slice(0, 10);
                  return date && date >= fromDate && date <= toDate;
                })
              : [];
            const byPatient = collectBookingReadouts({
              patients,
              engineBookings,
              bookingCases: cases,
              clientoBookings,
              historicalShadowClientoBookings,
              historicalShadowLedgerEvents,
              encounters,
            });
            visits = [...byPatient.values()]
              .flatMap((bucket) => [
                ...asArray(bucket.upcomingBookings),
                ...asArray(bucket.historyBookings),
              ])
              .filter((visit) => {
                const date = normalizeText(visit.startsAt).slice(0, 10);
                return date && date >= fromDate && date <= toDate;
              });
          } catch (error) {
            console.warn('[cco-bookings] canonical calendar visits unavailable', error?.message);
          }
        }

        let leadTimeConfig = normalizeBookingReminderLeadTimeConfig({});
        if (settingsStore && typeof settingsStore.getTenantSettings === 'function') {
          const settings = await settingsStore.getTenantSettings({ tenantId: context.tenantId });
          leadTimeConfig = normalizeBookingReminderLeadTimeConfig(
            settings?.bookingReminderLeadTime
          );
        }

        const servicesById = new Map();
        if (bookingEngineStore && typeof bookingEngineStore.listServices === 'function') {
          const services = await bookingEngineStore.listServices();
          asArray(services).forEach((service) => {
            const id = normalizeText(service?.id);
            if (id) servicesById.set(id, service);
          });
        }

        const missingByEmail = new Map();
        if (journalStore && patientMasterStore) {
          const report = await buildMissingFormsReport({
            patientMasterStore,
            journalStore,
            treatmentAgreementStore,
            tenantId: context.tenantId,
          });
          asArray(report?.rows).forEach((row) => {
            const email = normalizeKey(row?.primaryEmail);
            if (!email) return;
            missingByEmail.set(email, {
              patientId: row.patientId || '',
              missing: asArray(row.missing),
            });
          });
        }

        const reminderLog =
          patientCareStateStore && typeof patientCareStateStore.listReminderLog === 'function'
            ? await patientCareStateStore.listReminderLog({ tenantId: context.tenantId })
            : [];

        const signals = buildCalendarSignalsIndex({
          bookingCases: cases,
          servicesById,
          missingByEmail,
          reminderLog,
          leadTimeConfig,
          fromDate,
          toDate,
        });

        return {
          ok: true,
          provider: 'cco_calendar_bundle',
          fromDate,
          toDate,
          slots,
          blocks,
          cases,
          visits,
          leadTime: signals.leadTime,
          byCaseId: signals.byCaseId,
        };
      };

      if (readCache && cacheKey) {
        const { value, cacheHit } = await readCache.wrap(cacheKey, 45_000, build);
        return res.json({ ...value, cacheHit });
      }
      const payload = await build();
      return res.json({ ...payload, cacheHit: false });
    })
  );

  router.get('/cco-bookings/history-search', async (req, res) =>
    handle(req, res, async (context) => {
      res.set('Cache-Control', 'no-store');
      if (!patientMasterStore || !clientoBookingStore) {
        return res.json({
          ok: false,
          provider: 'cco_booking_history_search',
          readOnly: true,
          zeroWrites: true,
          unavailable: true,
          reason: 'canonical_booking_sources_unavailable',
          rows: [],
          pagination: { limit: clampHistoryLimit(req.query.limit), offset: 0, total: 0 },
        });
      }

      const fromDate = normalizeText(req.query.fromDate || req.query.from);
      const toDate = normalizeText(req.query.toDate || req.query.to);
      if (
        (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) ||
        (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) ||
        (fromDate && toDate && fromDate > toDate)
      ) {
        return res.status(400).json({ error: 'history_range_invalid' });
      }

      const limit = clampHistoryLimit(req.query.limit);
      const offset = parsePositiveInt(req.query.offset, 0);
      const q = normalizeText(req.query.q || req.query.query).toLowerCase();
      const patientFilter = normalizeText(req.query.patientId);
      const statusFilter = normalizeKey(req.query.status);
      const includeSeparate = normalizeKey(req.query.includeSeparate) !== 'false';
      const sort = normalizeKey(req.query.sort) === 'asc' ? 'asc' : 'desc';

      const patients = [];
      for (let patientOffset = 0; patientOffset < 200000; patientOffset += 20000) {
        const page = await patientMasterStore.listPatients({
          tenantId: context.tenantId,
          limit: 20000,
          offset: patientOffset,
        });
        const pagePatients = asArray(page?.patients);
        patients.push(...pagePatients);
        if (pagePatients.length < 20000) break;
      }
      const patientMetaById = buildPatientMetaById(patients);

      const inRange = (value) => {
        const date = stockholmIsoDate(value);
        if (!date) return false;
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        return true;
      };

      const filterRange = (rows) =>
        fromDate || toDate ? asArray(rows).filter((row) => inRange(row?.startsAt)) : asArray(rows);

      const [bookingCases, historicalShadowLedgerEvents] = await Promise.all([
        typeof bookingStore?.listCasesInRange === 'function' && fromDate && toDate
          ? bookingStore.listCasesInRange({
              tenantId: context.tenantId,
              fromDate,
              toDate,
              limit: 20000,
            })
          : typeof bookingStore?.listCases === 'function'
            ? bookingStore.listCases({
                tenantId: context.tenantId,
                sort: 'recent',
                limit: 20000,
              })
            : [],
        loadClientoLinkSidecarLedgerEvents(config || {}),
      ]);

      const engineBookings = bookingEngineStore?.listBookingsForEnrichment
        ? filterRange(bookingEngineStore.listBookingsForEnrichment(context.tenantId))
        : [];
      const clientoBookings =
        fromDate && toDate && clientoBookingStore.listBookingsInRange
          ? asArray(
              clientoBookingStore.listBookingsInRange({
                tenantId: context.tenantId,
                fromDate,
                toDate,
              })
            )
          : clientoBookingStore.listAllBookings
            ? filterRange(clientoBookingStore.listAllBookings({ tenantId: context.tenantId }))
            : [];
      const historicalShadowClientoBookings =
        historicalShadowLedgerEvents.length && clientoBookingStore.listAllBookings
          ? filterRange(clientoBookingStore.listAllBookings({ tenantId: '', limit: 0 }))
          : clientoBookings;
      const encounters = treatmentEncounterStore?.listEncountersForEnrichment
        ? filterRange(treatmentEncounterStore.listEncountersForEnrichment(context.tenantId))
        : [];

      const byPatient = collectBookingReadouts({
        patients,
        engineBookings,
        bookingCases: filterRange(bookingCases),
        clientoBookings,
        historicalShadowClientoBookings,
        historicalShadowLedgerEvents,
        encounters,
      });

      const linkedRows = [...byPatient.values()]
        .flatMap((bucket) => [
          ...asArray(bucket.upcomingBookings),
          ...asArray(bucket.historyBookings),
        ])
        .map((visit) => toHistorySearchRow(visit, patientMetaById));

      let separateRows = [];
      if (includeSeparate && historicalShadowLedgerEvents.length) {
        const skippedStateBySource = buildSkippedLinkStateBySource(historicalShadowLedgerEvents);
        const shadowModel = buildClientoHistoricalShadowReadmodel({
          bookings: historicalShadowClientoBookings,
          ledgerEvents: historicalShadowLedgerEvents,
          includeUnmerged: true,
        });
        separateRows = asArray(shadowModel.events)
          .filter((event) => event?.eventType === 'cliento_historical_booking_unmerged')
          .map((event) => toSeparateHistoricalRow(event, skippedStateBySource));
      }

      const allRows = [...linkedRows, ...separateRows]
        .filter((row) => {
          if (patientFilter && row.patientId !== patientFilter) return false;
          if (statusFilter && normalizeKey(row.status) !== statusFilter) return false;
          if (fromDate || toDate) {
            if (!row.stockholmDate) return false;
            if (fromDate && row.stockholmDate < fromDate) return false;
            if (toDate && row.stockholmDate > toDate) return false;
          }
          if (q && !row.searchText.includes(q)) return false;
          return true;
        })
        .sort((left, right) => {
          const l = Date.parse(left.startsAt) || 0;
          const r = Date.parse(right.startsAt) || 0;
          const delta = sort === 'asc' ? l - r : r - l;
          if (delta) return delta;
          return String(left.bookingId || '').localeCompare(String(right.bookingId || ''));
        });

      const rows = allRows.slice(offset, offset + limit).map((row) => {
        const { searchText, ...safeRow } = row;
        return safeRow;
      });
      const total = allRows.length;
      const linkedMatched = allRows.filter(
        (row) => row.kind !== 'separate_unlinked_historical'
      ).length;
      const separateMatched = total - linkedMatched;

      return res.json({
        ok: true,
        provider: 'cco_booking_history_search',
        tenantId: context.tenantId,
        readOnly: true,
        zeroWrites: true,
        activeProjectionUsed: false,
        bookingMergeWritten: false,
        patientEncounterWrite: false,
        timeZone: 'Europe/Stockholm',
        filters: {
          q,
          fromDate: fromDate || null,
          toDate: toDate || null,
          patientId: patientFilter || null,
          status: statusFilter || null,
          includeSeparate,
        },
        counts: {
          linkedAvailable: linkedRows.length,
          separateAvailable: separateRows.length,
          linkedMatched,
          separateMatched,
          approvedShadowMatched: allRows.filter((row) => row.kind === 'approved_historical_shadow')
            .length,
        },
        pagination: {
          limit,
          offset,
          total,
          returned: rows.length,
          hasMore: offset + rows.length < total,
          nextOffset: offset + rows.length < total ? offset + rows.length : null,
        },
        rows,
      });
    })
  );

  router.get('/cco-bookings/cliento-unlinked-review', async (req, res) =>
    handle(req, res, async (context) => {
      res.set('Cache-Control', 'no-store');
      if (!patientMasterStore || !clientoBookingStore) {
        return res.json({
          tenantId: context.tenantId,
          generatedAt: new Date().toISOString(),
          zeroWrites: true,
          total: 0,
          byReason: {},
          rows: [],
        });
      }
      const population = await patientMasterStore.listPatients({
        tenantId: context.tenantId,
        limit: 20000,
        offset: 0,
      });
      const clientoBookings = clientoBookingStore.listAllBookings
        ? clientoBookingStore.listAllBookings({ tenantId: context.tenantId })
        : [];
      const report = buildUnlinkedClientoBookingReview({
        patients: asArray(population?.patients),
        clientoBookings: asArray(clientoBookings),
      });
      return res.json({
        tenantId: context.tenantId,
        generatedAt: new Date().toISOString(),
        ...report,
      });
    })
  );

  router.get('/cco-bookings/canonical-integrity', async (req, res) =>
    handle(req, res, async (context) => {
      res.set('Cache-Control', 'no-store');
      if (!patientMasterStore || !clientoBookingStore) {
        return res.json({
          tenantId: context.tenantId,
          generatedAt: new Date().toISOString(),
          zeroWrites: true,
          readOnly: true,
          ok: false,
          unavailable: true,
          reason: 'canonical_booking_sources_unavailable',
        });
      }

      const population = await patientMasterStore.listPatients({
        tenantId: context.tenantId,
        limit: 20000,
        offset: 0,
      });
      const patients = asArray(population?.patients);
      const engineBookings = bookingEngineStore?.listBookingsForEnrichment
        ? asArray(bookingEngineStore.listBookingsForEnrichment(context.tenantId))
        : [];
      const bookingCases =
        typeof bookingStore.listCases === 'function'
          ? asArray(
              await bookingStore.listCases({
                tenantId: context.tenantId,
                sort: 'recent',
                limit: 20000,
              })
            )
          : [];
      const clientoBookings = clientoBookingStore.listAllBookings
        ? asArray(clientoBookingStore.listAllBookings({ tenantId: context.tenantId }))
        : [];
      const historicalShadowLedgerEvents = await loadClientoLinkSidecarLedgerEvents(config || {});
      const historicalShadowClientoBookings =
        historicalShadowLedgerEvents.length && clientoBookingStore.listAllBookings
          ? asArray(clientoBookingStore.listAllBookings({ tenantId: '', limit: 0 }))
          : clientoBookings;
      const encounters = treatmentEncounterStore?.listEncountersForEnrichment
        ? asArray(treatmentEncounterStore.listEncountersForEnrichment(context.tenantId))
        : [];
      const byPatient = collectBookingReadouts({
        patients,
        engineBookings,
        bookingCases,
        clientoBookings,
        historicalShadowClientoBookings,
        historicalShadowLedgerEvents,
        encounters,
      });
      const report = buildCanonicalBookingIntegrityReport({ patients, byPatient, encounters });
      return res.json({
        tenantId: context.tenantId,
        generatedAt: new Date().toISOString(),
        ...report,
      });
    })
  );

  router.get('/cco-bookings/calendar-signals', async (req, res) =>
    handle(req, res, async (context) => {
      const fromDate = normalizeText(req.query.fromDate);
      const toDate = normalizeText(req.query.toDate);
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'availability_range_missing' });
      }

      let leadTimeConfig = normalizeBookingReminderLeadTimeConfig({});
      if (settingsStore && typeof settingsStore.getTenantSettings === 'function') {
        const settings = await settingsStore.getTenantSettings({ tenantId: context.tenantId });
        leadTimeConfig = normalizeBookingReminderLeadTimeConfig(settings?.bookingReminderLeadTime);
      }

      const servicesById = new Map();
      if (bookingEngineStore && typeof bookingEngineStore.listServices === 'function') {
        const services = await bookingEngineStore.listServices();
        asArray(services).forEach((service) => {
          const id = normalizeText(service?.id);
          if (id) servicesById.set(id, service);
        });
      }

      const missingByEmail = new Map();
      if (journalStore && patientMasterStore) {
        const report = await buildMissingFormsReport({
          patientMasterStore,
          journalStore,
          treatmentAgreementStore,
          tenantId: context.tenantId,
        });
        asArray(report?.rows).forEach((row) => {
          const email = normalizeKey(row?.primaryEmail);
          if (!email) return;
          missingByEmail.set(email, {
            patientId: row.patientId || '',
            missing: asArray(row.missing),
          });
        });
      }

      const rawCases = await bookingStore.listCases({
        tenantId: context.tenantId,
        sort: 'recent',
        limit: 200,
      });
      const reminderLog =
        patientCareStateStore && typeof patientCareStateStore.listReminderLog === 'function'
          ? await patientCareStateStore.listReminderLog({ tenantId: context.tenantId })
          : [];

      const signals = buildCalendarSignalsIndex({
        bookingCases: rawCases,
        servicesById,
        missingByEmail,
        reminderLog,
        leadTimeConfig,
        fromDate,
        toDate,
      });

      return res.json({
        ok: true,
        provider: 'cco_calendar_signals',
        fromDate,
        toDate,
        leadTime: signals.leadTime,
        byCaseId: signals.byCaseId,
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
        const [slots, blocks] = await Promise.all([
          bookingEngineStore.listAvailability({
            tenantId: context.tenantId,
            fromDate,
            toDate,
            resIds: resIds || '',
            srvIds: srvIds || '',
            excludeConversationId: normalizeText(req.query.conversationId),
          }),
          bookingEngineStore.listCalendarBlocks({
            fromDate,
            toDate,
            resIds: resIds || '',
          }),
        ]);
        return res.json({
          raw: null,
          provider: 'cco_engine',
          slots,
          blocks,
          bookingUrl: null,
        });
      }
      if (!isClientoIntegrationEnabled()) {
        return res.status(503).json({ error: 'cliento_booking_disabled' });
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

  router.get('/cco-bookings/calendar-blocks', async (req, res) =>
    handle(req, res, async (context) => {
      const fromDate = normalizeText(req.query.fromDate);
      const toDate = normalizeText(req.query.toDate);
      const resIds = normalizeCsvParam(req.query.resIds);
      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'availability_range_missing' });
      }
      if (!bookingEngineStore) {
        return res.json({ provider: 'external', blocks: [] });
      }
      const blocks = await bookingEngineStore.listCalendarBlocks({
        fromDate,
        toDate,
        resIds: resIds || '',
      });
      return res.json({ provider: 'cco_engine', blocks });
    })
  );

  router.post('/cco-bookings/calendar-blocks', async (req, res) =>
    handle(req, res, async (context) => {
      requireStaffRole(context);
      if (!bookingEngineStore) {
        return res.status(503).json({ error: 'booking_engine_disabled' });
      }
      const block = await bookingEngineStore.upsertCalendarBlock(req.body || {});
      return res.json({ provider: 'cco_engine', block });
    })
  );

  router.post('/cco-bookings/calendar/rebook', async (req, res) =>
    handle(req, res, async (context) => {
      requireStaffRole(context);
      if (!bookingEngineStore) {
        return res.status(503).json({ error: 'booking_engine_disabled' });
      }
      const bookingCaseId = normalizeText(req.body?.bookingCaseId);
      const slot = asObject(req.body?.slot);
      if (!bookingCaseId || !normalizeText(slot.startsAt)) {
        return res.status(400).json({ error: 'calendar_rebook_missing_fields' });
      }
      const bookingCase = bookingStore.findCaseByRef({
        tenantId: context.tenantId,
        caseRef: bookingCaseId,
      });
      if (!bookingCase) {
        return res.status(404).json({ error: 'booking_case_not_found' });
      }
      const caseContext = {
        ...context,
        workspaceId: normalizeText(bookingCase.workspaceId) || context.workspaceId,
        conversationId: normalizeText(bookingCase.conversationId),
        customerEmail: normalizeText(bookingCase.customerEmail),
        customerName: normalizeText(bookingCase.customerName),
      };
      requireBookingContext(caseContext);
      await assertTreatmentBookingAllowed({
        treatmentAgreementStore,
        patientMasterStore,
        bookingStore,
        journalStore,
        tenantId: caseContext.tenantId,
        customerEmail: caseContext.customerEmail,
        body: { ...req.body, selectedSlots: [slot], slot },
      });
      const booking = await bookingEngineStore.rebookBooking({
        ...toCaseInput(caseContext, req.body),
        selectedSlots: [slot],
        slot,
        reason: normalizeText(req.body?.reason) || 'Ombokad från kalendern',
      });
      let nextCase = await bookingStore.setCandidateSlots({
        ...toCaseInput(caseContext, req.body),
        selectedSlots: [booking.slot],
      });
      nextCase = await bookingStore.updateStatus({
        ...toCaseInput(caseContext, req.body),
        status: 'confirmed_external',
        statusSource: 'cco_engine',
      });
      nextCase = await bookingStore.addEvent({
        ...toCaseInput(caseContext, req.body),
        type: 'engine_booking_rebooked',
        label: 'Bokning ombokad i CCO',
        detail: 'Tid flyttades via kalendern.',
        metadata: {
          bookingId: booking.bookingId,
          slotId: booking.slot?.slotId,
          previousBookingId: booking.previousBooking?.bookingId || '',
          previousSlotId: booking.previousSlot?.slotId || '',
          previousSlot: booking.previousSlot || null,
          nextSlot: booking.slot || null,
          source: 'calendar_drag',
        },
      });
      const patientRecord = await syncBookingPatient360(caseContext, nextCase, {
        source: 'cco_bookings_calendar_rebook',
        includeTimelineEvent: true,
      });
      const bookingEngine = await bookingEngineStore.getCaseSummary(caseContext);
      return res.json({
        provider: 'cco_engine',
        booking,
        bookingCase: nextCase,
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
          services: services.map((item) => ({
            id: item.id,
            label: item.label,
            meetingMode: item.meetingMode || '',
          })),
        });
      }
      if (!isClientoIntegrationEnabled()) {
        return res.status(503).json({ error: 'cliento_booking_disabled' });
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
