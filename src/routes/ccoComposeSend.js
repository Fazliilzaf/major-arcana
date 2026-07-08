'use strict';

/**
 * ccoComposeSend (router) — skickar ett godkänt kompose-utkast via vald kanal.
 * Owner-only (mail.live_send). Grindas av CCO_COMPOSE_SEND_LIVE i servicen.
 *
 * draftStore + patientMasterStore + sendStore hämtas lazy från app.locals.
 * graphSendAdapter injiceras (finns bara när ARCANA_GRAPH_SEND_ENABLED=true).
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { deliverComposeDraft } = require('../ops/ccoComposeSend');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoComposeSendRouter({ requireAuth, graphSendAdapter = null } = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.post(
    '/cco/runtime/compose-new-mail/:draftId/send',
    authMiddleware,
    attachRole,
    requirePermission('mail.live_send'),
    async (req, res) => {
      const locals = req.app?.locals || {};
      const draftStore = locals.ccoCommDraftStore || null;
      if (!draftStore)
        return res.status(503).json({ ok: false, error: 'compose_send_unavailable' });
      const draftId = text(req.params.draftId);
      if (!draftId) return res.status(400).json({ ok: false, error: 'missing_draft_id' });
      try {
        const result = await deliverComposeDraft(
          {
            draftId,
            tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
            actor: { userId: text(req.auth?.userId) || text(req.cco?.role) || 'owner' },
          },
          {
            draftStore,
            patientMasterStore: locals.ccoPatientMasterStore || null,
            sendStore: locals.ccoSendActionStore || null,
            graphSendAdapter: graphSendAdapter || locals.ccoGraphSendAdapter || null,
          }
        );
        // 'skipped' (grind av / kanal ej på) är normala utfall, inte fel.
        const code = result.status === 'sent' ? 200 : result.status === 'failed' ? 502 : 200;
        return res.status(code).json({ ok: result.status !== 'failed', ...result });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoComposeSendRouter };
