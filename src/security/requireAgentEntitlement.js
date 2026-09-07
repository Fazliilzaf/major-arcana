'use strict';

/**
 * requireAgentEntitlement.js — server-side enforcement av agent-entitlement.
 *
 * WP-001. Frontend-hide är UX; detta är security. Middleware-fabriken verifierar
 * authenticated user + tenant + aktiv entitlement innan en agent får användas.
 *
 * Kräver att requireAuth (authMiddleware) redan har satt req.auth = { userId,
 * tenantId, role, ... } och att store (staffAgentEntitlementStore) är nåbar.
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function getAuthContext(req) {
  const src = req.auth || req.user || req.cco || {};
  return {
    userId: normalizeText(src.userId || src.id || src.email),
    tenantId: normalizeText(src.tenantId),
    role: src.role || null,
  };
}

function requireAgentEntitlement({ store, agent } = {}) {
  return function agentEntitlementGuard(req, res, next) {
    if (!store || typeof store.hasActive !== 'function') {
      return res.status(503).json({ error: 'entitlement_store_unavailable' });
    }
    const ctx = getAuthContext(req);
    // Disabled/inaktiv membership: fail-closed (defense-in-depth; requireAuth
    // är primär enforcement, detta är en andra spärr vid entitlement-gränsen).
    const membershipStatus = normalizeText(
      req.auth?.membershipStatus || req.auth?.status || req.user?.membershipStatus || ''
    ).toLowerCase();
    if (['disabled', 'revoked', 'inactive', 'suspended'].includes(membershipStatus)) {
      return res.status(401).json({ error: 'Kontot är inaktivt.' });
    }
    if (!ctx.userId || !ctx.tenantId) {
      return res.status(401).json({ error: 'Inloggning krävs.' });
    }
    if (store.hasActive(ctx.userId, ctx.tenantId, agent)) {
      req.cco = req.cco || {};
      req.cco.agentEntitlement = agent;
      return next();
    }
    return res.status(403).json({
      error: 'forbidden',
      detail: `Agent "${agent}" saknar entitlement för användaren.`,
      requiredAgent: agent,
    });
  };
}

module.exports = { requireAgentEntitlement, getAuthContext };
