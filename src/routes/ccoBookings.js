const express = require('express');

const { getClientoApiConfigForBrand, getClientoConfigForBrand } = require('../brand/runtimeConfig');
const { resolveBrandForHost } = require('../brand/resolveBrand');
const {
  createClientoApi,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
} = require('../infra/clientoApi');
const { BOOKING_STATUSES } = require('../ops/ccoBookingStore');

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

function createCcoBookingsRouter({ bookingStore, authStore, config }) {
  const router = express.Router();

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
      return res.json({
        bookingCase,
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
      const cases = await bookingStore.listCases({
        tenantId: context.tenantId,
        customerEmail: normalizeText(req.query.customerEmail),
        status: status && status !== 'all' ? status : '',
        sort: normalizeKey(req.query.sort) === 'blocked' ? 'blocked' : 'recent',
        limit: req.query.limit,
      });
      return res.json({
        cases,
        statuses: BOOKING_STATUSES,
      });
    })
  );

  router.put('/cco-bookings/case', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.upsertCase(toCaseInput(context, req.body));
      return res.json({ bookingCase });
    })
  );

  router.post('/cco-bookings/candidates', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.setCandidateSlots({
        ...toCaseInput(context, req.body),
        selectedSlots: req.body?.selectedSlots || req.body?.slots,
      });
      return res.json({ bookingCase });
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
      return res.json({ bookingCase });
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
      return res.json({ bookingCase });
    })
  );

  router.post('/cco-bookings/offer-draft', async (req, res) =>
    handle(req, res, async (context) => {
      requireBookingContext(context);
      const bookingCase = await bookingStore.updateStatus({
        ...toCaseInput(context, req.body),
        status: 'offered',
      });
      return res.json({
        bookingCase,
        draft: buildOfferDraft({ bookingCase }),
      });
    })
  );

  router.get('/cco-bookings/slots', async (req, res) =>
    handle(req, res, async () => {
      const fromDate = normalizeText(req.query.fromDate);
      const toDate = normalizeText(req.query.toDate);
      const resIds = normalizeCsvParam(req.query.resIds);
      const srvIds = normalizeCsvParam(req.query.srvIds);
      if (!fromDate || !toDate || !resIds || !srvIds) {
        return res.status(400).json({ error: 'cliento_slots_params_missing' });
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
