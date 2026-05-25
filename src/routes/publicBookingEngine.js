/**
 * Public Booking Engine endpoints.
 *
 * Speglar publicClinic.js men hämtar från ccoBookingEngineStore istället
 * för Cliento. Detta är Fas B i web-to-arcana-bridge:
 * docs/strategy/web-to-arcana-bridge.md
 *
 * När ARCANA_PUBLIC_WEB_BOOKING_ENABLED=true (efter CCO sign-off) använder
 * hairtpclinic.com endast dessa endpoints — aldrig Cliento (/public/cliento/*).
 *
 * Säkerhet:
 *   - Ingen auth (brand-resolveras via host)
 *   - Rate-limit appliceras av server.js /api/public-rate-limitern
 *   - Endast LÄSANDE operationer i Fas B (catalog + availability).
 *     Fas C lägger till reservations som auto-skapar CCO-thread.
 */

const express = require('express');
const crypto = require('node:crypto');

const { resolveBrandForHost } = require('../brand/resolveBrand');
const { createTransactionalMailer } = require('../infra/transactionalMailer');
const {
  buildBookingReservationEmail,
  buildOperatorNotificationEmail,
} = require('../templates/bookingReservationEmail');
const { assertPublicWebAbuseGuard } = require('../security/publicWebAbuseGuard');
const {
  isPublicWebBookingEnabled,
  publicWebBookingDisabledBody,
} = require('../infra/publicWebBooking');
const { syncWebReservationToJournal } = require('../ops/ccoJournalBookingBridge');
const {
  resolveBookingVipToken,
  isResourceAllowedForVipToken,
  isServiceAllowedForVipToken,
} = require('../ops/bookingVipAccess');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
  const pricing = service?.pricing && typeof service.pricing === 'object' ? service.pricing : {};
  const fromPrice = Number(
    service?.fromPriceSek ?? pricing.basePriceSek ?? service?.price ?? 0
  );
  return {
    id: normalizeText(service?.id || service?.serviceId) || 'service',
    title: normalizeText(service?.label || service?.title || service?.name) || 'Service',
    description: normalizeText(service?.description) || undefined,
    durationMinutes: Number.isFinite(duration)
      ? Math.max(10, Math.min(1440, Math.round(duration)))
      : 60,
    fromPriceSek: Number.isFinite(fromPrice) ? Math.max(0, Math.round(fromPrice)) : 0,
    pricing: {
      basePriceSek: Number(pricing.basePriceSek ?? fromPrice) || 0,
      eveningPriceSek: Number(pricing.eveningPriceSek ?? fromPrice) || 0,
      weekendPriceSek: Number(pricing.weekendPriceSek ?? fromPrice) || 0,
      currency: normalizeText(pricing.currency) || 'SEK',
    },
    minNoticeMinutes: Number(service?.minNoticeMinutes) || undefined,
    maxBookingDaysAhead: Number(service?.maxBookingDaysAhead) || undefined,
    cancellationPolicyHours: Number(service?.cancellationPolicyHours) || undefined,
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
    priceTier: normalizeText(slot?.priceTier) || 'base',
    priceSek: Number.isFinite(Number(slot?.priceSek)) ? Math.max(0, Math.round(Number(slot.priceSek))) : undefined,
    currency: normalizeText(slot?.currency) || undefined,
  };
}

// ── E-post + telefon validering (mjuk) ─────────────────────────────
function isValidEmail(value) {
  const v = normalizeText(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}
function isValidPhone(value) {
  const v = normalizeText(value).replace(/[\s()+\-]/g, '');
  return /^\d{6,15}$/.test(v);
}

// ── conversationId-syntes ───────────────────────────────────────────
// Webb-leads har ingen CCO-thread från början. Vi genererar ett deterministiskt
// conversationId per (email + slotId) så att refresh av booking-formuläret inte
// skapar dubletter. CCO-operatören filtrerar dessa via workspaceId-prefix.
function synthConversationId(email, slotId) {
  const seed = `${normalizeText(email).toLowerCase()}::${normalizeText(slotId)}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
  return `web-${hash}`;
}

function synthVipConversationId(tokenId, email, slotId) {
  const seed = `vip::${normalizeText(tokenId)}::${normalizeText(email).toLowerCase()}::${normalizeText(slotId)}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
  return `vip-${hash}`;
}

function createPublicBookingEngineRouter({
  bookingEngineStore,
  bookingStore,
  patientMasterStore = null,
  journalStore = null,
  treatmentEncounterStore = null,
  config,
  graphSendConnector = null,
}) {
  const router = express.Router();
  const { sendEmail } = createTransactionalMailer({ graphSendConnector });

  function rejectIfPublicWebBookingDisabled(res) {
    if (isPublicWebBookingEnabled()) return false;
    res.status(503).json(publicWebBookingDisabledBody());
    return true;
  }

  async function executeBookingReservation(req, res, options = {}) {
    const {
      provider = 'cco_engine',
      vipTokenRecord = null,
      workspaceId = 'web-public',
      ownerUserId = 'web-public',
      ownerName = 'Webb-bokning',
      conversationIdFn = synthConversationId,
      reservationEventType = 'web_public_reservation',
      reservationEventLabel = 'Webb-bokning skapad',
      reservationDetailPrefix = 'Webb-bokning från',
      journalChannel = 'web_public',
      requireAbuseGuard = true,
      validatePublicResource = true,
    } = options;

    try {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

      if (requireAbuseGuard) {
        const abuse = await assertPublicWebAbuseGuard(req, body, {
          turnstileSecret: config.turnstileSecret,
        });
        if (!abuse.ok) {
          return res.status(abuse.status || 400).json({ ok: false, error: abuse.error || 'abuse_detected' });
        }
      }

      const consent = typeof body.consent === 'object' && body.consent !== null ? body.consent : {};
      if (consent.gdpr !== true) {
        return res.status(400).json({ ok: false, error: 'gdpr_consent_required' });
      }

      const contact = typeof body.contact === 'object' && body.contact !== null ? body.contact : {};
      const name = normalizeText(contact.name);
      const email = normalizeText(contact.email).toLowerCase();
      const phone = normalizeText(contact.phone);
      if (!name || name.length < 2 || name.length > 80) {
        return res.status(400).json({ ok: false, error: 'invalid_name' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ ok: false, error: 'invalid_email' });
      }
      if (!isValidPhone(phone)) {
        return res.status(400).json({ ok: false, error: 'invalid_phone' });
      }

      const slot = typeof body.slot === 'object' && body.slot !== null ? body.slot : null;
      const slotId = normalizeText(slot?.slotId);
      const slotStart = normalizeText(slot?.startsAt || slot?.start);
      const slotResourceId = normalizeText(slot?.resourceId);
      const slotServiceId = normalizeText(slot?.serviceId);
      if (!slotId || !slotStart || !slotResourceId || !slotServiceId) {
        return res.status(400).json({ ok: false, error: 'invalid_slot' });
      }

      if (vipTokenRecord) {
        if (!isServiceAllowedForVipToken(slotServiceId, vipTokenRecord)) {
          return res.status(403).json({ ok: false, error: 'vip_service_not_allowed' });
        }
        if (!isResourceAllowedForVipToken(slotResourceId, vipTokenRecord)) {
          return res.status(403).json({ ok: false, error: 'vip_resource_not_allowed' });
        }
      }

      const brand = resolveBrandFromRequest(req, config);
      if (validatePublicResource && !vipTokenRecord) {
        const publicResources = bookingEngineStore.listPublicResources
          ? await bookingEngineStore.listPublicResources({ tenantId: brand?.id || brand })
          : [];
        const publicResourceIds = new Set(
          (Array.isArray(publicResources) ? publicResources : []).map((item) =>
            normalizeText(item?.id)
          )
        );
        if (publicResourceIds.size && !publicResourceIds.has(slotResourceId)) {
          return res.status(400).json({ ok: false, error: 'resource_not_public' });
        }
      }

      const tenantId = normalizeText(brand?.id || brand);
      if (!tenantId) {
        return res.status(500).json({ ok: false, error: 'brand_resolution_failed' });
      }

      const conversationSeedArgs =
        vipTokenRecord && typeof conversationIdFn === 'function' && conversationIdFn.length >= 3
          ? [vipTokenRecord.tokenId, email, slotId]
          : [email, slotId];
      const conversationId = conversationIdFn(...conversationSeedArgs);
      const reservations = await bookingEngineStore.reserveSlots({
        tenantId,
        workspaceId,
        conversationId,
        customerEmail: email,
        customerName: name,
        ownerUserId,
        ownerName,
        selectedSlots: [
          {
            slotId,
            startsAt: slotStart,
            endsAt: normalizeText(slot.endsAt || slot.end),
            resourceId: slotResourceId,
            serviceId: slotServiceId,
          },
        ],
      });

      let bookingCase = null;
      if (bookingStore && typeof bookingStore.setCandidateSlots === 'function') {
        bookingCase = await bookingStore.setCandidateSlots({
          tenantId,
          workspaceId,
          conversationId,
          customerEmail: email,
          customerName: name,
          ownerUserId,
          requestedTreatment: slotServiceId,
          notes: `${reservationDetailPrefix} ${phone}. Patient samtyckte GDPR ${new Date().toISOString()}.`,
          selectedSlots: reservations.map((r) => r.slot),
        });

        if (typeof bookingStore.addEvent === 'function') {
          const leadContextRaw =
            body.leadContext && typeof body.leadContext === 'object' ? body.leadContext : {};
          const leadContext = {
            source: normalizeText(leadContextRaw.source) || (vipTokenRecord ? 'vip-booking' : 'hairtpclinic.com'),
            submittedAt: normalizeText(leadContextRaw.submittedAt) || new Date().toISOString(),
            service: normalizeText(leadContextRaw.service) || null,
            healthYes: Array.isArray(leadContextRaw.healthYes)
              ? leadContextRaw.healthYes
                  .slice(0, 20)
                  .map((v) => normalizeText(v))
                  .filter(Boolean)
              : [],
            healthNotes: normalizeText(leadContextRaw.healthNotes).slice(0, 1000),
            timeWindow: normalizeText(leadContextRaw.timeWindow) || null,
            country: normalizeText(leadContextRaw.country) || 'SE',
            city: normalizeText(leadContextRaw.city) || '',
            languagePref: normalizeText(leadContextRaw.languagePref) || 'sv',
            photos: normalizeText(leadContextRaw.photos) || 'none',
            marketingConsent: leadContextRaw.marketingConsent === true,
            surgeryDate:
              normalizeText(leadContextRaw.surgeryDate || leadContextRaw.operatedAt).slice(0, 32) ||
              null,
            operatedAt:
              normalizeText(leadContextRaw.operatedAt || leadContextRaw.surgeryDate).slice(0, 32) ||
              null,
            vipTokenId: vipTokenRecord ? normalizeText(vipTokenRecord.tokenId) : null,
          };
          bookingCase = await bookingStore.addEvent({
            tenantId,
            workspaceId,
            conversationId,
            customerEmail: email,
            type: reservationEventType,
            label: reservationEventLabel,
            detail: `Patient ${name} (${phone}) reserverade ${slotStart} via ${vipTokenRecord ? 'VIP-länk' : 'hairtpclinic.com'}.`,
            metadata: {
              slotId,
              source: vipTokenRecord ? 'vip_booking_engine' : 'public_booking_engine',
              gdprConsentAt: new Date().toISOString(),
              marketingConsent: consent.marketing === true,
              leadContext,
              vipTokenId: vipTokenRecord ? normalizeText(vipTokenRecord.tokenId) : null,
            },
          });
        }
      }

      const primary = reservations[0] || null;
      const locale = normalizeText(body.locale) === 'en' ? 'en' : 'sv';
      const resolvedResource =
        primary?.slot?.resourceLabel || primary?.slot?.resourceId || slotResourceId;
      const resolvedService =
        primary?.slot?.serviceLabel || primary?.slot?.serviceId || slotServiceId;
      const resolvedServiceId = primary?.slot?.serviceId || slotServiceId || resolvedService;
      const resolvedLocation = primary?.slot?.locationLabel || body?.slot?.locationLabel || '';
      const emailContent = buildBookingReservationEmail({
        patientName: name,
        slotStart: primary?.slot?.startsAt || slotStart,
        resourceLabel: resolvedResource,
        serviceLabel: resolvedService,
        serviceId: resolvedServiceId,
        locationLabel: resolvedLocation,
        caseId: conversationId,
        expiresAt: primary?.expiresAt,
        locale,
      });
      const emailResult = await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        idempotencyKey: `booking-${conversationId}-${primary?.reservationId || slotId}`,
      });
      if (bookingStore && typeof bookingStore.addEvent === 'function') {
        await bookingStore.addEvent({
          tenantId,
          workspaceId,
          conversationId,
          customerEmail: email,
          type: emailResult.ok
            ? 'reservation_confirmation_sent'
            : 'reservation_confirmation_failed',
          label: emailResult.ok
            ? `Bekräftelse skickad (${emailResult.mode})`
            : 'Bekräftelse-mail failade',
          detail: emailResult.ok
            ? `${emailResult.provider || 'mail'} ${emailResult.mode}-mode${emailResult.messageId ? `, id ${emailResult.messageId}` : ''}`
            : `${emailResult.provider || 'mail'}-fel: ${emailResult.error || 'unknown'}. Operatör ringer manuellt.`,
          metadata: {
            provider: emailResult.provider || 'none',
            mode: emailResult.mode,
            skipped: emailResult.skipped || null,
            messageId: emailResult.messageId || null,
            error: emailResult.error || null,
            sendMode: emailResult.sendMode || null,
          },
        });
      }
      console.log(
        `[public-reservation] ${vipTokenRecord ? 'vip' : 'web'} booking by ${email} for slot ${slotId} email:${emailResult.mode}`
      );

      const operatorTo = (process.env.OPERATOR_NOTIFY_TO || 'contact@hairtpclinic.com').trim();
      if (operatorTo) {
        try {
          const opContent = buildOperatorNotificationEmail({
            patientName: name,
            patientEmail: email,
            patientPhone: phone,
            slotStart: primary?.slot?.startsAt || slotStart,
            resourceLabel: resolvedResource,
            serviceLabel: resolvedService,
            serviceId: resolvedServiceId,
            locationLabel: resolvedLocation,
            caseId: conversationId,
            leadContext:
              body.leadContext && typeof body.leadContext === 'object' ? body.leadContext : {},
          });
          const opResult = await sendEmail({
            to: operatorTo,
            subject: opContent.subject,
            html: opContent.html,
            text: opContent.text,
            idempotencyKey: `op-notify-${conversationId}-${primary?.reservationId || slotId}`,
          });
          console.log(
            `[public-reservation] operator notify to ${operatorTo} email:${opResult.mode}`
          );
        } catch (opErr) {
          console.warn(
            `[public-reservation] operator notify failed: ${opErr && opErr.message ? opErr.message : opErr}`
          );
        }
      }

      if (journalStore && treatmentEncounterStore && patientMasterStore && primary) {
        try {
          await syncWebReservationToJournal({
            patientMasterStore,
            treatmentEncounterStore,
            journalStore,
            tenantId,
            reservation: primary,
            contact: { name, email, phone },
            conversationId,
            channel: journalChannel,
          });
        } catch (syncError) {
          console.warn(
            '[public-reservation] journal sync failed:',
            syncError && syncError.message ? syncError.message : syncError
          );
        }
      }

      return res.json({
        ok: true,
        provider,
        vip: vipTokenRecord
          ? { label: vipTokenRecord.label, tokenId: vipTokenRecord.tokenId }
          : undefined,
        reservation: primary
          ? {
              reservationId: primary.reservationId,
              expiresAt: primary.expiresAt,
              slot: sanitizeSlot(primary.slot),
            }
          : null,
        caseId: conversationId,
        operatorWillContact: true,
        operatorEtaMinutes: 60,
        emailConfirmation: {
          ok: emailResult.ok === true,
          mode: emailResult.mode || 'mock',
          provider: emailResult.provider || 'none',
          skipped: emailResult.skipped || null,
          messageId: emailResult.messageId || null,
          error: emailResult.error || null,
        },
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode === 409) {
        return res.status(409).json({
          ok: false,
          error: 'slot_unavailable',
          message: error.message || 'Tiden är inte längre ledig.',
        });
      }
      console.error(`[public-booking-engine/reservations${vipTokenRecord ? '/vip' : ''}]`, error);
      return res.status(500).json({ ok: false, error: 'reservation_failed' });
    }
  }

  async function loadCatalogForTenant(brand) {
    const tenantId = brand?.id || brand;
    const [resourcesRaw, servicesRaw] = await Promise.all([
      bookingEngineStore.listPublicResources
        ? bookingEngineStore.listPublicResources({ tenantId })
        : bookingEngineStore.listResources({ tenantId }),
      bookingEngineStore.listPublicServices
        ? bookingEngineStore.listPublicServices({ tenantId })
        : bookingEngineStore.listServices({ tenantId }),
    ]);
    return {
      resources: (Array.isArray(resourcesRaw) ? resourcesRaw : []).map(sanitizeResource),
      services: (Array.isArray(servicesRaw) ? servicesRaw : []).map(sanitizeService),
    };
  }

  // ── VIP token routes (works when public web booking is disabled) ──
  router.get('/public/booking-engine/vip/:token/catalog', async (req, res) => {
    const tokenRecord = resolveBookingVipToken(req.params.token);
    if (!tokenRecord) {
      return res.status(404).json({ ok: false, error: 'vip_token_invalid' });
    }
    try {
      const brand = resolveBrandFromRequest(req, config);
      const catalog = await loadCatalogForTenant(brand);
      return res.json({
        provider: 'cco_engine_vip',
        vip: { label: tokenRecord.label, tokenId: tokenRecord.tokenId },
        services: catalog.services.filter((item) =>
          isServiceAllowedForVipToken(item.id, tokenRecord)
        ),
        resources: catalog.resources.filter((item) =>
          isResourceAllowedForVipToken(item.id, tokenRecord)
        ),
      });
    } catch (error) {
      console.error('[public-booking-engine/vip/catalog]', error);
      return res.status(500).json({ ok: false, error: 'vip_catalog_failed' });
    }
  });

  router.get('/public/booking-engine/vip/:token/availability', async (req, res) => {
    const tokenRecord = resolveBookingVipToken(req.params.token);
    if (!tokenRecord) {
      return res.status(404).json({ ok: false, error: 'vip_token_invalid' });
    }
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
        publicOnly: false,
      });
      const filtered = asArray(slots).filter((slot) => {
        const serviceId = normalizeText(slot?.serviceId || slot?.service?.id);
        const resourceId = normalizeText(slot?.resourceId || slot?.resource?.id);
        return (
          isServiceAllowedForVipToken(serviceId, tokenRecord) &&
          (!resourceId || isResourceAllowedForVipToken(resourceId, tokenRecord))
        );
      });
      return res.json({ provider: 'cco_engine_vip', slots: filtered.map(sanitizeSlot) });
    } catch (error) {
      console.error('[public-booking-engine/vip/availability]', error);
      return res.status(500).json({ ok: false, error: 'vip_availability_failed' });
    }
  });

  // ── GET /api/public/booking-engine/catalog ────────────────────────
  router.get('/public/booking-engine/catalog', async (req, res) => {
    if (rejectIfPublicWebBookingDisabled(res)) return;
    try {
      const brand = resolveBrandFromRequest(req, config);
      const catalog = await loadCatalogForTenant(brand);
      return res.json({
        provider: 'cco_engine',
        services: catalog.services,
        resources: catalog.resources,
      });
    } catch (error) {
      console.error('[public-booking-engine/catalog]', error);
      return res.status(500).json({ ok: false, error: 'booking_engine_catalog_failed' });
    }
  });

  // ── GET /api/public/booking-engine/availability ───────────────────
  router.get('/public/booking-engine/availability', async (req, res) => {
    if (rejectIfPublicWebBookingDisabled(res)) return;
    const fromDate = isoDateOnly(req.query.fromDate);
    const toDate = isoDateOnly(req.query.toDate);
    if (!fromDate || !toDate) {
      return res.status(400).json({ ok: false, error: 'availability_range_missing' });
    }

    try {
      const brand = resolveBrandFromRequest(req, config);
      const slots = bookingEngineStore.listPublicAvailability
        ? await bookingEngineStore.listPublicAvailability({
            tenantId: brand?.id || brand,
            fromDate,
            toDate,
            resIds: normalizeText(req.query.resIds) || undefined,
            srvIds: normalizeText(req.query.srvIds) || undefined,
          })
        : await bookingEngineStore.listAvailability({
            tenantId: brand?.id || brand,
            fromDate,
            toDate,
            resIds: normalizeText(req.query.resIds) || undefined,
            srvIds: normalizeText(req.query.srvIds) || undefined,
            publicOnly: true,
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

  // ── POST /api/public/booking-engine/reservations ───────────────────
  // Fas C: webb-besökaren reserverar en slot direkt. Auto-skapar CCO-thread
  // (synthetic conversationId) så operatören ser ärendet som needs_triage.
  // Se docs/strategy/web-to-arcana-bridge.md sektion 3.3 för fullt kontrakt.
  router.post('/public/booking-engine/reservations', async (req, res) => {
    if (rejectIfPublicWebBookingDisabled(res)) return;
    return executeBookingReservation(req, res);
  });

  // ── POST /api/public/booking-engine/vip/:token/reservations ────────
  // VIP-bokning fungerar även när publik webb-bokning är avstängd.
  router.post('/public/booking-engine/vip/:token/reservations', async (req, res) => {
    const tokenRecord = resolveBookingVipToken(req.params.token);
    if (!tokenRecord) {
      return res.status(404).json({ ok: false, error: 'vip_token_invalid' });
    }
    return executeBookingReservation(req, res, {
      provider: 'cco_engine_vip',
      vipTokenRecord: tokenRecord,
      workspaceId: 'vip-booking',
      ownerUserId: 'vip-booking',
      ownerName: 'VIP-bokning',
      conversationIdFn: synthVipConversationId,
      reservationEventType: 'vip_reservation',
      reservationEventLabel: 'VIP-bokning skapad',
      reservationDetailPrefix: 'VIP-bokning från',
      journalChannel: 'vip_booking',
      requireAbuseGuard: false,
      validatePublicResource: false,
    });
  });

  return router;
}

module.exports = {
  createPublicBookingEngineRouter,
};
