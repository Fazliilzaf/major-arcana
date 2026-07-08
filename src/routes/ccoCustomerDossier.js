'use strict';

/**
 * ccoCustomerDossier (router) — RBAC-grindad läs-endpoint som ger Svarstudion
 * "all info om kunden" samlat. Ren läsning bakom mail.read (samma behörighet som
 * övriga Svarstudio/konversations-endpoints). Aggregeringen sker i
 * src/ops/ccoCustomerDossier.js; storarna hämtas från app.locals vid anrop
 * (samma mönster som övriga CCO-runtime-rutter) så ingen ny server-wiring krävs.
 *
 * Journalinnehåll ingår ALDRIG i svaret (aggregeraren tar bara antal + datum).
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { buildCustomerDossier } = require('../ops/ccoCustomerDossier');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoCustomerDossierRouter({ requireAuth } = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.get(
    '/cco/runtime/customer/:customerId/dossier',
    authMiddleware,
    attachRole,
    requirePermission('mail.read'),
    async (req, res) => {
      try {
        const customerId = text(req.params.customerId);
        if (!customerId) {
          return res.status(400).json({ ok: false, error: 'missing_customer_id' });
        }
        const locals = req.app?.locals || {};
        // Storarna är valfria — aggregeraren tål saknade/trasiga källor.
        // ccoBookingStore exponeras uttryckligen för patientkort-aggregatorn
        // (server.js "19F.7 Fix A"). Tråd-/journey-store ligger inte på
        // app.locals ännu → dossiern degraderar dem tyst (följd-steg).
        const stores = {
          patientMasterStore: locals.ccoPatientMasterStore || null,
          journeyStore: locals.ccoCustomerJourneyStore || null,
          bookingStore: locals.ccoBookingStore || locals.clientoBookingStore || null,
          caseStore: locals.ccoBookingCaseStore || null,
          threadStore: locals.ccoConversationThreadStore || null,
          journalStore: locals.ccoJournalStore || null,
        };
        const dossier = await buildCustomerDossier(
          {
            tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
            customerId,
            patientId: text(req.query?.patientId) || customerId,
            email: text(req.query?.email),
            nowIso: new Date().toISOString(),
          },
          stores
        );
        return res.json({ ok: true, dossier });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoCustomerDossierRouter };
