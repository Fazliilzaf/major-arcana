'use strict';

/**
 * staffAgentEntitlements.js — router för agent-entitlements (WP-001).
 *
 * Additiv, bakåtkompatibel. Rör INTE befintlig /staff/me eller annan auth.
 *
 *   GET  /staff/agent-entitlements/me      → { identity, role, agents }  (autentiserad)
 *   GET  /staff/agent-entitlements          → lista alla (OWNER, staff.manage)
 *   POST /staff/agent-entitlements/grant    → grant (OWNER, staff.manage)
 *   POST /staff/agent-entitlements/revoke   → revoke (OWNER, staff.manage)
 *
 * grant/revoke tar userId+agent ur body; tenantId tas ALLTID ur aktörens
 * verifierade auth (aldrig ur body) → ingen tenant-crossover / IDOR.
 */

const express = require('express');
const { requirePermission } = require('../security/ccoRbac');
const { getAuthContext } = require('../security/requireAgentEntitlement');
const { buildContextToken, AGENT_IDS } = require('../security/staffAgentContext');

function createStaffAgentEntitlementsRouter({ requireAuth, store } = {}) {
  const router = express.Router();
  const auth = typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  function resolveStore(req, res) {
    const s = store || req.app?.locals?.staffAgentEntitlementStore || null;
    if (!s) {
      res.status(503).json({ error: 'entitlement_store_unavailable' });
      return null;
    }
    return s;
  }

  // Additiv identitet + aktiva agenter (ersätter INTE befintlig /staff/me).
  router.get('/staff/agent-entitlements/me', auth, (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const ctx = getAuthContext(req);
    res.json({
      identity: { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role },
      agents: s.listActive(ctx.userId, ctx.tenantId),
    });
  });

  router.get('/staff/agent-entitlements', auth, requirePermission('staff.manage'), (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    // Tenant-isolation: lista ENDAST aktörens verifierade tenant (aldrig body/query).
    const actor = getAuthContext(req);
    res.json({ entitlements: s.listForTenant(actor.tenantId) });
  });

  router.post('/staff/agent-entitlements/grant', auth, requirePermission('staff.manage'), async (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const actor = getAuthContext(req);
    try {
      const entitlement = await s.grant({
        userId: req.body?.userId,
        tenantId: actor.tenantId,
        agent: req.body?.agent,
        actor,
      });
      res.json({ ok: true, entitlement });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error?.message || 'bad_request' });
    }
  });

  router.post('/staff/agent-entitlements/revoke', auth, requirePermission('staff.manage'), async (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const actor = getAuthContext(req);
    try {
      const result = await s.revoke({
        userId: req.body?.userId,
        tenantId: actor.tenantId,
        agent: req.body?.agent,
        actor,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error?.message || 'bad_request' });
    }
  });

  // WP-003 — bridge: utfärdar serververifierat context-token för en beviljad agent.
  router.post('/staff/agent-context', auth, (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const ctx = getAuthContext(req);
    const requestedAgent = String(req.body?.agent_id || '').trim().toUpperCase();
    if (!AGENT_IDS.includes(requestedAgent)) {
      return res.status(400).json({ error: 'unknown_agent', detail: 'agent_id måste vara CEO|CCO|CFO|CMO|CAO|COO.' });
    }
    // Fail-closed: disabled membership nekas (defense-in-depth, requireAuth är primär).
    const membershipStatus = String(req.auth?.membershipStatus || req.auth?.status || '').toLowerCase();
    if (['disabled', 'revoked', 'inactive', 'suspended'].includes(membershipStatus)) {
      return res.status(401).json({ error: 'Kontot är inaktivt.' });
    }
    // Entitlement-check (WP-001). userId/tenantId tas UR auth — aldrig ur body.
    if (!s.hasActive(ctx.userId, ctx.tenantId, requestedAgent)) {
      return res.status(403).json({ error: 'forbidden', detail: `Saknar entitlement för agent "${requestedAgent}".` });
    }
    const token = buildContextToken({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      staffRole: ctx.role,
      agentId: requestedAgent,
      portalId: req.body?.portal_id,
      pageContext: req.body?.page_context,
      selectedEntityId: req.body?.selected_entity_id,
      sessionId: req.body?.session_id,
    });
    if (!token) {
      return res.status(500).json({ error: 'context_unavailable' });
    }
    res.json({ ok: true, context: token });
  });

  return router;
}

module.exports = { createStaffAgentEntitlementsRouter };
