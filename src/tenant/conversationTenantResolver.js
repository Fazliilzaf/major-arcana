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

/**
 * P1-003/004 — canonical tenant-scope för kunddossiern och kundkommunikations-
 * ytan. Ett client-styrt tenant-värde (query/body) är ALDRIG auktoritet: när det
 * finns måste det canonicalisera till SAMMA autentiserade tenant, annars kastas
 * en 403 (fail-closed) INNAN någon read/write. Saknas client-tenant används den
 * autentiserade tenanten. Vid match används den autentiserade canonical-tenanten
 * — aldrig clientvärdet.
 *
 * @param {object} req Express-request (läser req.auth.tenantId).
 * @param {{clientTenant?: string, fallbackTenantId?: string}} [opts]
 * @returns {string} autentiserad canonical tenant
 * @throws {Error} statusCode 403 på främmande/malformed client-tenant.
 */
function resolveTenantScope(req, { clientTenant = '', fallbackTenantId = '' } = {}) {
  const authenticated = resolveConversationTenant(req, fallbackTenantId);
  const provided = normalizeText(clientTenant);
  if (!provided) return authenticated;

  const providedCanonical = canonicalTenantId(provided);
  if (!providedCanonical || providedCanonical !== authenticated) {
    const error = new Error('tenant_scope_forbidden');
    error.statusCode = 403;
    error.expose = true;
    throw error;
  }
  // Match — fortsätt med den autentiserade tenanten, aldrig clientvärdet.
  return authenticated;
}

module.exports = {
  resolveConversationTenant,
  resolveTenantScope,
};
