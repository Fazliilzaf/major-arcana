'use strict';

/**
 * ccoPortalSelfTest (router) — kör portal-loopens självtest (mint → notis →
 * domänkoll) och rapporterar grönt/rött per steg. settings.read (owner/operator)
 * för den säkra kontrollen (dry-run, inget mejl). Skarpt testmejl (live=true)
 * kräver owner — annars tvingas dry-run.
 *
 * Stores hämtas lazy från app.locals; saknas de → dry-run/skipped-steg (aldrig kast).
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { runPortalLoopSelfTest } = require('../ops/ccoPortalSelfTest');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPortalSelfTestRouter({ requireAuth } = {}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '8kb' });
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.post(
    '/cco/runtime/portal-selftest',
    authMiddleware,
    attachRole,
    requirePermission('settings.read'),
    jsonParser,
    async (req, res) => {
      const locals = req.app?.locals || {};
      const accessStore = locals.ccoPortalAccessStore || null;
      const sendStore = locals.ccoSendActionStore || null;
      const b = req.body || {};
      // Skarpt utskick är owner-only; övriga får den säkra dry-run-kontrollen.
      const isOwner = text(req.cco?.role) === 'owner';
      try {
        const result = await runPortalLoopSelfTest(
          {
            tenantId: text(req.auth?.tenantId) || 'hairtpclinic',
            email: text(b.email),
            name: text(b.name),
            live: b.live === true && isOwner,
          },
          { accessStore, sendStore }
        );
        return res.json({ ok: true, ...result });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalSelfTestRouter };
