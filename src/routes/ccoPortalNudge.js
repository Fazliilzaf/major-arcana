'use strict';

/**
 * ccoPortalNudge (router) — förbereder en portal-länk-nudge för en kund (Fas 2,
 * följdsteg). Detta är den AUTOMATISERBARA ingången: staff kan trigga den, och
 * en ingestion-/cron-hook kan POST:a hit när en ny inbound dyker upp.
 *
 * Servicen myntar en magisk länk och skapar ett utkast som stannar på
 * 'needs_approval' — personal godkänner och skickar i den vanliga kedjan. Ingen
 * auto-live-send, ingen Graph. Idempotent (kunden nudgas bara en gång).
 *
 * Stores hämtas från app.locals; saknas access-/draft-/nudge-store → 503.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { preparePortalNudge } = require('../ops/ccoPortalNudge');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPortalNudgeRouter({ requireAuth, baseUrl } = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '16kb' });
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();
  const resolveBaseUrl = () =>
    text(baseUrl) || text(process.env.PUBLIC_BASE_URL) || 'https://arcana.hairtpclinic.com';

  router.post(
    '/cco/runtime/customer/:customerId/portal-nudge',
    authMiddleware,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const locals = req.app?.locals || {};
      const accessStore = locals.ccoPortalAccessStore || null;
      const draftStore = locals.ccoCommDraftStore || null;
      const nudgeStore = locals.ccoPortalNudgeStore || null;
      if (!accessStore || !draftStore || !nudgeStore) {
        return res.status(503).json({ ok: false, error: 'portal_nudge_unavailable' });
      }
      const customerId = text(req.params.customerId);
      if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
      try {
        const result = await preparePortalNudge(
          {
            tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
            customerId,
            customerName: text(req.body?.customerName),
            subject: text(req.body?.subject),
            channel: text(req.body?.channel),
            baseUrl: resolveBaseUrl(),
            actor: {
              userId: text(req.auth?.userId) || text(req.cco?.role) || 'staff',
            },
          },
          {
            accessStore,
            draftStore,
            nudgeStore,
            messageStore: locals.ccoPortalMessageStore || null,
          }
        );
        // 'skipped' är ett normalt utfall (idempotens/redan aktiv) — inte ett fel.
        return res.status(result.status === 'prepared' ? 201 : 200).json({ ok: true, ...result });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalNudgeRouter };
