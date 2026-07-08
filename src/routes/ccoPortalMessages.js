'use strict';

/**
 * ccoPortalMessages (router) — staff-sidan av den fria portal-kanalen (Fas 2,
 * steg 4). Låter Svarstudion LÄSA patientens portal-meddelanden och SKICKA ett
 * klinik-svar (outbound) som dyker upp i patientens portal.
 *
 * - GET  list: mail.read (samma som konversationsläsning).
 * - POST reply: mail.send (samma som att skapa utkast). Skriver ett outbound-
 *   meddelande + markerar patientens inkommande som lästa. Detta är INTE mail-
 *   live-send och rör ingen Graph-sändkedja — det är ett internt portalmeddelande.
 *
 * Storen hämtas från app.locals (ccoPortalMessageStore); saknas den → 503.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPortalMessagesRouter({ requireAuth } = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '16kb' });
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  function store(req, res) {
    const s = req.app?.locals?.ccoPortalMessageStore || null;
    if (!s) {
      res.status(503).json({ ok: false, error: 'portal_messaging_unavailable' });
      return null;
    }
    return s;
  }

  // GET — lista kundens portal-meddelanden (staff-läsning).
  router.get(
    '/cco/runtime/customer/:customerId/portal-messages',
    authMiddleware,
    attachRole,
    requirePermission('mail.read'),
    (req, res) => {
      const s = store(req, res);
      if (!s) return;
      const customerId = text(req.params.customerId);
      if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
      try {
        const messages = s.listMessagesForCustomer({
          tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
          customerId,
        });
        return res.json({ ok: true, messages });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  // POST — klinik-svar (outbound) som dyker upp i patientens portal.
  router.post(
    '/cco/runtime/customer/:customerId/portal-message',
    authMiddleware,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const s = store(req, res);
      if (!s) return;
      const customerId = text(req.params.customerId);
      const body = text(req.body?.body);
      if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
      if (!body) return res.status(400).json({ ok: false, error: 'missing_body' });
      const tenantId = text(req.auth?.tenantId) || 'hairtpclinic';
      try {
        const message = await s.appendMessage({
          tenantId,
          customerId,
          direction: 'outbound',
          body,
          author: text(req.auth?.userId) || text(req.cco?.role) || 'klinik',
        });
        // Patientens inkommande räknas som besvarade när klinik svarar.
        if (typeof s.markInboundRead === 'function') {
          await s.markInboundRead({ tenantId, customerId });
        }
        return res.status(201).json({ ok: true, message });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalMessagesRouter };
