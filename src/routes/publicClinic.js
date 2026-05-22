const express = require('express');

const { resolveBrandForHost } = require('../brand/resolveBrand');
const {
  getClientoConfigForBrand,
  getClientoApiConfigForBrand,
} = require('../brand/runtimeConfig');
const {
  createClientoApi,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
} = require('../infra/clientoApi');
const {
  buildDefaultPublicSiteProfile,
  normalizePublicSiteProfile,
} = require('../tenant/publicSiteProfile');

function normalizeClinicId(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeAliasMap(input) {
  const defaults = {
    'hair-to-clinic': 'hair-tp-clinic',
    hairtpclinic: 'hair-tp-clinic',
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }

  for (const [fromRaw, toRaw] of Object.entries(input)) {
    const from = normalizeClinicId(fromRaw);
    const to = normalizeClinicId(typeof toRaw === 'string' ? toRaw : '');
    if (!from || !to) continue;
    defaults[from] = to;
  }

  return defaults;
}

function sanitizeService(service) {
  return {
    id: typeof service.id === 'string' && service.id.trim() ? service.id.trim() : 'service',
    title: typeof service.title === 'string' && service.title.trim() ? service.title.trim() : 'Service',
    description:
      typeof service.description === 'string'
        ? service.description.trim()
        : '',
    durationMinutes:
      typeof service.durationMinutes === 'number' && Number.isFinite(service.durationMinutes)
        ? Math.max(10, Math.min(1440, Math.round(service.durationMinutes)))
        : 60,
    fromPriceSek:
      typeof service.fromPriceSek === 'number' && Number.isFinite(service.fromPriceSek)
        ? Math.max(0, Math.round(service.fromPriceSek))
        : 0,
  };
}

function resolveBrandFromRequest(req, config) {
  const candidates = [];

  const sourceUrl = typeof req.query?.sourceUrl === 'string' ? req.query.sourceUrl.trim() : '';
  if (sourceUrl) {
    try {
      candidates.push(new URL(sourceUrl).hostname);
    } catch {
      // ignore invalid sourceUrl hints
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function handleClientoRequest(req, res, config, run) {
  try {
    const brand = resolveBrandFromRequest(req, config);
    const clientoApiConfig = getClientoApiConfigForBrand(brand, config);

    if (!clientoApiConfig.partnerId) {
      return res.status(503).json({
        ok: false,
        error: 'cliento_partner_id_missing',
      });
    }

    const clientoApi = createClientoApi(clientoApiConfig);
    const payload = await run(clientoApi);
    return res.json(payload);
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        ok: false,
        error: 'cliento_request_failed',
        details: error.details ?? null,
      });
    }

    console.error(error);
    return res.status(500).json({
      ok: false,
      error: 'cliento_request_failed',
    });
  }
}

function createPublicClinicRouter({ tenantConfigStore, config }) {
  const router = express.Router();
  const aliasMap = normalizeAliasMap(config.publicClinicIdAliases);

  router.get('/public/cliento/settings', async (req, res) =>
    handleClientoRequest(req, res, config, (clientoApi) => clientoApi.getSettings())
  );

  router.get('/public/cliento/ref-data', async (req, res) =>
    handleClientoRequest(req, res, config, (clientoApi) => clientoApi.getRefData())
  );

  router.get('/public/cliento/slots', async (req, res) => {
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
    const resIds = normalizeCsvParam(req.query.resIds);
    const srvIds = normalizeCsvParam(req.query.srvIds);

    if (!fromDate || !toDate || !resIds || !srvIds) {
      return res.status(400).json({
        ok: false,
        error: 'cliento_slots_params_missing',
      });
    }

    return handleClientoRequest(req, res, config, async (clientoApi) => {
      const payload = await clientoApi.getSlots({
        fromDate,
        toDate,
        resIds,
        srvIds,
      });
      return {
        raw: payload,
        slots: normalizeClientoSlotsPayload(payload),
      };
    });
  });

  router.get('/public/cliento/reviews', async (req, res) =>
    handleClientoRequest(req, res, config, (clientoApi) =>
      clientoApi.getReviews({
        offset: parsePositiveInt(req.query.offset, 0),
        limit: parsePositiveInt(req.query.limit, 10),
        stars: normalizeCsvParam(req.query.stars),
      })
    )
  );

  router.get('/public/clinics/:clinicId', async (req, res) => {
    try {
      const requestedClinicId = normalizeClinicId(req.params.clinicId);
      if (!requestedClinicId) {
        return res.status(400).json({ error: 'clinicId saknas.' });
      }

      const tenantId = aliasMap[requestedClinicId] || requestedClinicId;
      const tenantConfig = await tenantConfigStore.findTenantConfig(tenantId);
      if (!tenantConfig) {
        return res.status(404).json({ error: `Klinik hittades inte: ${tenantId}` });
      }

      const brand = resolveBrandForHost(tenantConfig.brandProfile || tenantId, {
        defaultBrand: config.brand,
        brandByHost: config.brandByHost,
      });
      const cliento = getClientoConfigForBrand(brand, config);

      const fallbackProfile = buildDefaultPublicSiteProfile({
        tenantId,
        defaultBrand: brand,
      });
      const publicSite = normalizePublicSiteProfile(tenantConfig.publicSite, {
        fallback: fallbackProfile,
        strict: false,
      });

      const bookingUrl = publicSite.contactBookingUrl || cliento.bookingUrl || '';

      return res.json({
        id: tenantId,
        tenantId,
        name: publicSite.clinicName,
        city: publicSite.city,
        tagline: publicSite.tagline,
        hero: {
          title: publicSite.heroTitle,
          subtitle: publicSite.heroSubtitle,
          primaryCtaLabel: publicSite.primaryCtaLabel,
          primaryCtaUrl: publicSite.primaryCtaUrl || bookingUrl,
          secondaryCtaLabel: publicSite.secondaryCtaLabel,
          secondaryCtaUrl: publicSite.secondaryCtaUrl,
        },
        services: Array.isArray(publicSite.services)
          ? publicSite.services.map((service) => sanitizeService(service))
          : [],
        trust: {
          rating: publicSite.trustRating,
          reviewCount: publicSite.trustReviewCount,
          surgeons: publicSite.trustSurgeons,
        },
        contact: {
          phone: publicSite.contactPhone,
          email: publicSite.contactEmail,
          address: publicSite.contactAddress,
          bookingUrl,
        },
        theme: {
          accent: publicSite.themeAccent,
          accentSoft: publicSite.themeAccentSoft,
          canvasFrom: publicSite.themeCanvasFrom,
          canvasTo: publicSite.themeCanvasTo,
        },
        updatedAt: tenantConfig.updatedAt || new Date().toISOString(),
      });
    } catch (error) {
      if (error && error.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hamta publik klinikdata.' });
    }
  });

  return router;
}

module.exports = {
  createPublicClinicRouter,
};
