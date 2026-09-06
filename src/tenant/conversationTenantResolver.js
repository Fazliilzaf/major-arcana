'use strict';

/**
 * P1-001/002 — EN KANONISK TENANT-KÄLLA för konversationsdomänen.
 *
 * `req.tenantId` sätts ALDRIG av auth (auth sätter `req.auth.tenantId`), så varje
 * `req.tenantId || defaultTenantId`-uttryck har i praktiken alltid fallit tillbaka
 * på defaultTenantId (historiskt 'cco'). All konversationsstate-keying — operational
 * state, Klar/Senare, tilldelning, AI-sammanfattning, sentiment, worklist, dashboard,
 * notes, reply/forward, staff-portal och audit — ska hämta SAMMA värde härifrån:
 * autentiserad membership-tenant, normaliserad canonical, med config-default som enda
 * (canonical) fallback när trusted auth-context saknas.
 *
 * 'cco' är inte en tenant och får inte användas som tenant-nyckel.
 */
const { canonicalTenantId } = require('./tenantIdCanonical');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolvera den canonical tenant som en konversationsrequest ska keyas under.
 *
 * @param {object} req Express-request (läser req.auth.tenantId).
 * @param {string} [fallbackTenantId=''] Canonical fallback (config.defaultTenantId).
 * @returns {string} Canonical tenant, eller '' om inget trusted värde finns.
 */
function resolveConversationTenant(req, fallbackTenantId = '') {
  const authenticated = canonicalTenantId(normalizeText(req?.auth?.tenantId));
  if (authenticated) return authenticated;
  return canonicalTenantId(normalizeText(fallbackTenantId)) || '';
}

module.exports = {
  resolveConversationTenant,
};
