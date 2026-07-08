'use strict';

/**
 * ccoComposeNewMail (router) — komponera ett nytt mail till en ny mottagare.
 * Skapar en enkel kontakt + ett needs_approval-utkast (personal godkänner och
 * skickar i vanliga kedjan). mail.send-behörighet. Skickar aldrig själv.
 *
 * Stores hämtas lazy från app.locals (ccoPatientMasterStore + ccoCommDraftStore);
 * saknas de → 503.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { composeNewMail } = require('../ops/ccoComposeNewMail');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoComposeNewMailRouter({ requireAuth } = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '64kb' });
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.post(
    '/cco/runtime/compose-new-mail',
    authMiddleware,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const locals = req.app?.locals || {};
      const patientMasterStore = locals.ccoPatientMasterStore || null;
      const draftStore = locals.ccoCommDraftStore || null;
      if (!patientMasterStore || !draftStore) {
        return res.status(503).json({ ok: false, error: 'compose_unavailable' });
      }
      const b = req.body || {};
      try {
        const result = await composeNewMail(
          {
            tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
            recipientName: text(b.recipientName),
            recipientEmail: text(b.recipientEmail),
            recipientPhone: text(b.recipientPhone),
            subject: text(b.subject),
            body: text(b.body),
            channel: text(b.channel),
            actor: { userId: text(req.auth?.userId) || text(req.cco?.role) || 'staff' },
          },
          { patientMasterStore, draftStore }
        );
        if (result.status !== 'prepared') {
          return res.status(400).json({ ok: false, ...result });
        }
        return res.status(201).json({ ok: true, ...result });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoComposeNewMailRouter };
