/**
 * Public web-events ingest (E3) — formulär, analyzer, chat-intent, exit-intent.
 * Alla events går via ExecutionGateway för audit innan persist.
 *
 * Se docs/strategy/web-to-arcana-bridge.md §4 (Pass 4).
 */

const express = require('express');
const crypto = require('node:crypto');

const { resolveBrandForHost } = require('../brand/resolveBrand');
const { assertPublicWebAbuseGuard } = require('../security/publicWebAbuseGuard');
const { ALLOWED_EVENT_TYPES } = require('../ops/webBridgeAuditStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
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

function sanitizeContact(contact = {}) {
  if (!contact || typeof contact !== 'object') return {};
  return {
    email: normalizeText(contact.email).toLowerCase().slice(0, 254) || null,
    phone: normalizeText(contact.phone).slice(0, 32) || null,
    name: normalizeText(contact.name || contact.firstName).slice(0, 120) || null,
  };
}

function createPublicWebEventsRouter({ executionGateway, webBridgeAuditStore, config }) {
  const router = express.Router();

  router.post('/public/web-events', async (req, res) => {
    try {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

      const abuse = await assertPublicWebAbuseGuard(req, body, {
        turnstileSecret: config.turnstileSecret,
      });
      if (!abuse.ok) {
        return res.status(abuse.status || 400).json({ ok: false, error: abuse.error || 'abuse_detected' });
      }

      const brand = resolveBrandFromRequest(req, config);
      const tenantId = normalizeText(brand?.id || brand);
      if (!tenantId) {
        return res.status(500).json({ ok: false, error: 'brand_resolution_failed' });
      }

      const eventType = normalizeKey(body.eventType || body.type);
      if (!ALLOWED_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({ ok: false, error: 'invalid_event_type' });
      }

      const contact = sanitizeContact(body.contact);
      const correlationId =
        normalizeText(body.correlationId) ||
        normalizeText(body.sessionId) ||
        crypto.randomUUID();
      const idempotencyKey =
        normalizeText(body.idempotencyKey) ||
        `${eventType}:${correlationId}:${normalizeText(body.submittedAt).slice(0, 19)}`;

      const payload = {
        eventType,
        host: normalizeText(body.host || req.query?.host),
        source: normalizeText(body.source) || 'hairtpclinic.com',
        submittedAt: normalizeText(body.submittedAt) || new Date().toISOString(),
        contact,
        page: normalizeText(body.page || body.path).slice(0, 240) || null,
        locale: normalizeText(body.locale) === 'en' ? 'en' : 'sv',
        metadata:
          body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
      };

      if (!executionGateway || typeof executionGateway.run !== 'function') {
        return res.status(503).json({ ok: false, error: 'execution_gateway_unavailable' });
      }

      const auditEntries = [];
      const gatewayResult = await executionGateway.run({
        context: {
          tenant_id: tenantId,
          channel: 'web',
          intent: 'web_lead',
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          payload,
        },
        handlers: {
          audit: async (entry) => {
            auditEntries.push(entry);
            if (webBridgeAuditStore && typeof webBridgeAuditStore.recordAudit === 'function') {
              await webBridgeAuditStore.recordAudit({
                ...entry,
                tenantId,
                correlationId,
                gatewayRunId: entry?.metadata?.runId || null,
              });
            }
          },
          inputRisk: async () => ({ decision: 'allow' }),
          agentRun: async ({ context, runId }) => ({
            summary: 'web_event_recorded',
            eventType: context?.payload?.eventType || eventType,
            runId,
          }),
          outputRisk: async () => ({ decision: 'allow' }),
          policyFloor: async () => ({ decision: 'allow' }),
          persist: async ({ context, runId, decision }) => {
            if (!webBridgeAuditStore || typeof webBridgeAuditStore.recordEvent !== 'function') {
              return { stored: false };
            }
            const stored = await webBridgeAuditStore.recordEvent({
              eventType,
              tenantId,
              brand: normalizeText(brand?.label || brand?.id || tenantId),
              channel: 'web',
              intent: 'web_lead',
              sourceHost: normalizeText(context?.payload?.host),
              correlationId,
              idempotencyKey,
              gatewayRunId: runId,
              decision,
              contactEmail: contact.email,
              metadata: {
                page: payload.page,
                locale: payload.locale,
                source: payload.source,
                submittedAt: payload.submittedAt,
                ...sanitizeMetadataFlat(payload.metadata),
                ...extractAttribution(payload.metadata),
              },
            });
            return { stored: true, eventId: stored.id };
          },
        },
      });

      return res.json({
        ok: true,
        eventType,
        runId: gatewayResult?.run_id || null,
        decision: gatewayResult?.decision || 'allow',
        correlationId,
        auditCount: auditEntries.length,
      });
    } catch (error) {
      console.error('[public-web-events]', error);
      return res.status(500).json({ ok: false, error: 'web_event_ingest_failed' });
    }
  });

  return router;
}

/**
 * Bevarar annons-attribution + match-hashar från webbens `matchbridge` som
 * PLATTA skalära nycklar, så de överlever metadata-flattningen (både här och i
 * webBridgeAuditStore) i stället för att slängas som nästlat objekt.
 *
 * Grunden för deal-nivå-CAC: hashad e-post/telefon (match_*) matchar senare
 * Cliento-bokningen mot rätt kampanj; attr_* skrivs till Pipedrive-affären.
 * Inga namn, inga behandlingsnamn — bara neutrala id + hashar.
 */
function extractAttribution(metadata) {
  const mb =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.matchbridge
      : null;
  if (!mb || typeof mb !== 'object' || Array.isArray(mb)) return {};

  const out = {};
  const put = (key, val) => {
    if (typeof val === 'string' && val.trim()) out[key] = val.trim().slice(0, 200);
    else if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
  };

  // Hashad PII för senare Cliento-match-join (samma sha256-recept som webben).
  put('match_email_sha256', mb.email_sha256);
  put('match_phone_sha256', mb.phone_sha256);

  const a = mb.attribution && typeof mb.attribution === 'object' ? mb.attribution : {};
  put('attr_utm_source', a.utm_source);
  put('attr_utm_medium', a.utm_medium);
  put('attr_utm_campaign', a.utm_campaign);
  put('attr_utm_content', a.utm_content);
  put('attr_utm_term', a.utm_term);
  put('attr_gclid', a.gclid);
  put('attr_gbraid', a.gbraid);
  put('attr_wbraid', a.wbraid);
  put('attr_fbclid', a.fbclid);
  put('attr_landing_page', a.landing_page);
  put('attr_first_touch', a.first_touch);

  // Härledd kanal för snabb CAC-gruppering.
  const src = typeof a.utm_source === 'string' ? a.utm_source : '';
  const channel =
    /google/i.test(src) || a.gclid || a.gbraid || a.wbraid
      ? 'google'
      : /facebook|instagram|meta|\bfb\b|\big\b/i.test(src) || a.fbclid
        ? 'meta'
        : src
          ? src.toLowerCase()
          : undefined;
  if (channel) out.attr_channel = channel;

  return out;
}

function sanitizeMetadataFlat(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = normalizeText(key).slice(0, 60);
    if (!normalizedKey) continue;
    if (typeof raw === 'string') out[normalizedKey] = raw.slice(0, 200);
    else if (typeof raw === 'number' || typeof raw === 'boolean') out[normalizedKey] = raw;
  }
  return out;
}

module.exports = {
  createPublicWebEventsRouter,
};
