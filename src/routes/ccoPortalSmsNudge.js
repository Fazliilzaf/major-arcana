'use strict';

/**
 * ccoPortalSmsNudge (router) — skickar ett ENGÅNGS-SMS med portal-djuplänk till en
 * kund som inte öppnat portalen (följdsteg). Sista utväg: SMS kostar pengar, så
 * det är medvetet staff-/automation-triggat, hårt grindat (CCO_SMS_LIVE) och
 * idempotent. mail.send-behörighet.
 *
 * Telefonnummer resolveras lazy från patientMasterStore (app.locals) om det inte
 * skickas i body. Stores hämtas lazy från app.locals; saknas de → 503.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { sendPortalSmsNudge } = require('../ops/ccoPortalSmsNudge');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstPhone(patient = {}) {
  const candidates = [
    patient.phone,
    patient.mobile,
    patient.primaryPhone,
    Array.isArray(patient.phones) ? patient.phones[0] : null,
  ];
  for (const c of candidates) {
    const v = text(c);
    if (v) return v;
  }
  return '';
}

function createCcoPortalSmsNudgeRouter({ requireAuth } = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '8kb' });
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.post(
    '/cco/runtime/customer/:customerId/portal-sms-nudge',
    authMiddleware,
    attachRole,
    requirePermission('mail.send'),
    jsonParser,
    async (req, res) => {
      const locals = req.app?.locals || {};
      const accessStore = locals.ccoPortalAccessStore || null;
      const nudgeStore = locals.ccoPortalNudgeStore || null;
      const smsSender = locals.ccoSmsSender || null;
      if (!accessStore || !nudgeStore || !smsSender) {
        return res.status(503).json({ ok: false, error: 'portal_sms_unavailable' });
      }
      const customerId = text(req.params.customerId);
      if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
      const tenantId = text(req.auth?.tenantId) || 'hairtpclinic';

      let phone = text(req.body?.phone);
      const master = locals.ccoPatientMasterStore || null;
      if (!phone && master?.getPatient) {
        try {
          const patient = await master.getPatient({ tenantId, patientId: customerId });
          if (patient) phone = firstPhone(patient);
        } catch {
          /* uppslag valfritt */
        }
      }

      try {
        const result = await sendPortalSmsNudge(
          { tenantId, customerId, phone, patientName: text(req.body?.patientName) },
          { accessStore, smsSender, nudgeStore }
        );
        // 'skipped' (grind av / redan nudgad / inget nummer) är normala utfall.
        return res.status(result.status === 'sent' ? 201 : 200).json({ ok: true, ...result });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalSmsNudgeRouter };
