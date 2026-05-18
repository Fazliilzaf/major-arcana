/**
 * Public Booking Engine endpoints.
 *
 * Speglar publicClinic.js men hämtar från ccoBookingEngineStore istället
 * för Cliento. Detta är Fas B i web-to-arcana-bridge:
 * docs/strategy/web-to-arcana-bridge.md
 *
 * När hairtpclinic.com sätter ARCANA_PROVIDER=booking-engine byter den från
 * /api/public/cliento/* till dessa endpoints och Cliento är ute för webben.
 *
 * Säkerhet:
 *   - Ingen auth (brand-resolveras via host)
 *   - Rate-limit appliceras av server.js /api/public-rate-limitern
 *   - Endast LÄSANDE operationer i Fas B (catalog + availability).
 *     Fas C lägger till reservations som auto-skapar CCO-thread.
 */

const express = require('express');

const { resolveBrandForHost } = require('../brand/resolveBrand');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isoDateOnly(value) {
  const v = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function resolveBrandFromRequest(req, config) {
  const candidates = [];

  const sourceUrl = typeof req.query?.sourceUrl === 'string' ? req.query.sourceUrl.trim() : '';
  if (sourceUrl) {
    try {
      candidates.push(new URL(sourceUrl).hostname);
    } catch {
      // ignore invalid sourceUrl
    }
  }

  const requestedHost = typeof req.query?.host === 'string' ? req.query.host.trim() : '';
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

/**
 * Översätt ccoBookingEngineStore-resurser till samma shape som
 * webben förväntar sig (arcana-client.ts ArcanaResource).
 */
// ccoBookingEngineStore använder { label, durationMinutes, startsAt, endsAt }-shape.
// Vi översätter till webbens förväntade shape (title, start, end) så att
// arcana-client.ts inte behöver känna till skillnaden mellan providers.
function sanitizeResource(resource) {
  return {
    id: normalizeText(resource?.id || resource?.resourceId) || 'resource',
    title: normalizeText(resource?.label || resource?.title || resource?.name) || 'Resurs',
    role: normalizeText(resource?.role || resource?.specialty) || undefined,
  };
}

function sanitizeService(service) {
  const duration = Number(service?.durationMinutes ?? service?.duration ?? 60);
  const fromPrice = Number(service?.fromPriceSek ?? service?.price ?? 0);
  return {
    id: normalizeText(service?.id || service?.serviceId) || 'service',
    title: normalizeText(service?.label || service?.title || service?.name) || 'Service',
    description: normalizeText(service?.description) || undefined,
    durationMinutes: Number.isFinite(duration) ? Math.max(10, Math.min(1440, Math.round(duration))) : 60,
    fromPriceSek: Number.isFinite(fromPrice) ? Math.max(0, Math.round(fromPrice)) : 0,
  };
}

function sanitizeSlot(slot) {
  const start = normalizeText(slot?.startsAt || slot?.start || slot?.from);
  const end = normalizeText(slot?.endsAt || slot?.end || slot?.to);
  return {
    slotId: normalizeText(slot?.slotId || slot?.id) || `${slot?.resourceId || 'res'}-${start}`,
    start,
    end,
    serviceId: normalizeText(slot?.serviceId || slot?.srvId) || '',
    resourceId: normalizeText(slot?.resourceId || slot?.resId) || '',
  };
}

function createPublicBookingEngineRouter({ bookingEngineStore, config }) {
  const router = express.Router();

  // ── GET /api/public/booking-engine/catalog ────────────────────────
  router.get('/public/booking-engine/catalog', async (req, res) => {
    try {
      const brand = resolveBrandFromRequest(req, config);
      // Brand-resolution är förberedd för framtiden då booking-engine blir
      // multi-tenant. Idag delar alla tenants samma store; tenantId-flaggan
      // är fortfarande viktig så vi inte läcker data när det skalas upp.
      const [resourcesRaw, servicesRaw] = await Promise.all([
        bookingEngineStore.listResources({ tenantId: brand?.id || brand }),
        bookingEngineStore.listServices({ tenantId: brand?.id || brand }),
      ]);

      const resources = (Array.isArray(resourcesRaw) ? resourcesRaw : []).map(sanitizeResource);
      const services = (Array.isArray(servicesRaw) ? servicesRaw : []).map(sanitizeService);

      return res.json({
        provider: 'cco_engine',
        services,
        resources,
      });
    } catch (error) {
      console.error('[public-booking-engine/catalog]', error);
      return res.status(500).json({ ok: false, error: 'booking_engine_catalog_failed' });
    }
  });

  // ── GET /api/public/booking-engine/availability ───────────────────
  router.get('/public/booking-engine/availability', async (req, res) => {
    const fromDate = isoDateOnly(req.query.fromDate);
    const toDate = isoDateOnly(req.query.toDate);
    if (!fromDate || !toDate) {
      return res.status(400).json({ ok: false, error: 'availability_range_missing' });
    }

    try {
      const brand = resolveBrandFromRequest(req, config);
      const slots = await bookingEngineStore.listAvailability({
        tenantId: brand?.id || brand,
        fromDate,
        toDate,
        resIds: normalizeText(req.query.resIds) || undefined,
        srvIds: normalizeText(req.query.srvIds) || undefined,
      });
      return res.json({
        provider: 'cco_engine',
        slots: (Array.isArray(slots) ? slots : []).map(sanitizeSlot),
      });
    } catch (error) {
      console.error('[public-booking-engine/availability]', error);
      return res.status(500).json({ ok: false, error: 'booking_engine_availability_failed' });
    }
  });

  return router;
}

module.exports = {
  createPublicBookingEngineRouter,
};
