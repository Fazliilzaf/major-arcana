'use strict';

/**
 * ccoPortalAccess (router) — staff-sidan av magisk-länk-utfärdningen (Fas 2,
 * steg 5). Myntar/roterar/återkallar patientens BESTÅENDE portal-token och
 * bygger den färdiga länken som staff kan leverera till kunden.
 *
 * Poängen (kostnad): patienten öppnar länken en gång och chattar sedan gratis i
 * portalen istället för via SMS. Själva LEVERANSEN sker i den kontrollerade
 * mailkedjan — staff infogar länken i sitt svar (Svarstudion) och godkänner som
 * vanligt. Den här routern SKICKAR alltså inget själv; den utfärdar bara token +
 * bygger URL:en. Ingen Graph/live-send rörs.
 *
 * - POST issue  : portal.write — ge (eller återanvänd) patientens aktiva token.
 * - POST rotate : portal.write — återkalla nuvarande + ge en ny (vid läck-misstanke).
 * - POST revoke : portal.write — stäng av länken utan att ge en ny.
 *
 * Storen hämtas från app.locals (ccoPortalAccessStore); saknas den → 503.
 */

const express = require('express');
const { attachRole, requirePermission } = require('../security/ccoRbac');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Bygg patient-länken. Fri kanal-chatten ligger på /portal-chat/:token. */
function buildPortalUrl(baseUrl, token) {
  const base = text(baseUrl).replace(/\/+$/, '');
  return `${base}/portal-chat/${encodeURIComponent(token)}`;
}

function createCcoPortalAccessRouter({ requireAuth, baseUrl } = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();
  // Env läses per-request (inte vid mount) så deploy-konfig alltid vinner.
  const resolveBaseUrl = () =>
    text(baseUrl) || text(process.env.PUBLIC_BASE_URL) || 'https://arcana.hairtpclinic.com';

  function store(req, res) {
    const s = req.app?.locals?.ccoPortalAccessStore || null;
    if (!s) {
      res.status(503).json({ ok: false, error: 'portal_access_unavailable' });
      return null;
    }
    return s;
  }

  function tenantOf(req) {
    return text(req.auth?.tenantId) || 'hairtpclinic';
  }

  async function handleIssueLike(req, res, method) {
    const s = store(req, res);
    if (!s) return;
    const customerId = text(req.params.customerId);
    if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
    const tenantId = tenantOf(req);
    try {
      const result = await s[method]({ tenantId, customerId });
      return res.status(201).json({
        ok: true,
        token: result.token,
        expiresAt: result.expiresAt,
        reused: Boolean(result.reused),
        url: buildPortalUrl(resolveBaseUrl(), result.token),
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }
  }

  // POST — utfärda (eller återanvänd) patientens magiska länk.
  router.post(
    '/cco/runtime/customer/:customerId/portal-access',
    authMiddleware,
    attachRole,
    requirePermission('portal.write'),
    (req, res) => handleIssueLike(req, res, 'issueToken')
  );

  // POST — rotera: återkalla nuvarande token och ge en ny.
  router.post(
    '/cco/runtime/customer/:customerId/portal-access/rotate',
    authMiddleware,
    attachRole,
    requirePermission('portal.write'),
    (req, res) => handleIssueLike(req, res, 'rotateToken')
  );

  // POST — återkalla länken (utan att ge en ny).
  router.post(
    '/cco/runtime/customer/:customerId/portal-access/revoke',
    authMiddleware,
    attachRole,
    requirePermission('portal.write'),
    async (req, res) => {
      const s = store(req, res);
      if (!s) return;
      const customerId = text(req.params.customerId);
      if (!customerId) return res.status(400).json({ ok: false, error: 'missing_customer_id' });
      try {
        const result = await s.revokeToken({ tenantId: tenantOf(req), customerId });
        return res.json({ ok: true, revoked: Boolean(result?.revoked) });
      } catch (error) {
        return res.status(400).json({ ok: false, error: error.message });
      }
    }
  );

  return router;
}

module.exports = { createCcoPortalAccessRouter, buildPortalUrl };
