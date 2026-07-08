'use strict';

/**
 * ccoPortalMetrics (router) — adoptionsmätning för portal-kanalen (följdsteg).
 * GET returnerar volym/engagemang/nudge-konvertering (analytics.read_team).
 * Ren läsning; storarna hämtas lazy från app.locals.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');
const { buildPortalMetrics } = require('../ops/ccoPortalMetrics');
const { buildPortalReadiness } = require('../ops/ccoPortalReadiness');

function createCcoPortalMetricsRouter({ requireAuth } = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.get(
    '/cco/runtime/portal-metrics',
    authMiddleware,
    attachRole,
    requirePermission('analytics.read_team'),
    (req, res) => {
      const locals = req.app?.locals || {};
      try {
        const metrics = buildPortalMetrics({
          portalMessageStore: locals.ccoPortalMessageStore || null,
          portalNudgeStore: locals.ccoPortalNudgeStore || null,
          portalAccessStore: locals.ccoPortalAccessStore || null,
        });
        metrics.generatedAt = new Date().toISOString();
        return res.json({ ok: true, metrics });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  // Aktiveringsstatus (go-live-spegel): visar vilka utskicksgrindar som är skarpa.
  // settings.read (owner/operator). Bara på/av-flaggor — aldrig hemligheter.
  router.get(
    '/cco/runtime/portal-readiness',
    authMiddleware,
    attachRole,
    requirePermission('settings.read'),
    (_req, res) => {
      try {
        const readiness = buildPortalReadiness(process.env);
        return res.json({ ok: true, readiness, generatedAt: new Date().toISOString() });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalMetricsRouter };
