'use strict';

/**
 * cmoToolRegistry.js — canonical CMO-tool-registry (WP-008).
 *
 * Endast CMO får riktiga tools i v1. Varje tool mappas till en action-nivå
 * (READ/DRAFT/PREVIEW) och en resursklass. Okänt tool → null (fail-closed).
 */

const CMO_TOOLS = Object.freeze({
  'cmo.repo.read': { action: 'website.read', level: 'READ', resourceClass: 'repo' },
  'cmo.content.read': { action: 'content.read', level: 'READ', resourceClass: 'content' },
  'cmo.content.draft': { action: 'content.draft', level: 'DRAFT', resourceClass: 'content' },
  'cmo.website.preview': { action: 'website.preview', level: 'PREVIEW', resourceClass: 'website' },
  // WP-010: första kontrollerade WRITE — promote isolerad draft → candidate state.
  'cmo.content.write_candidate': { action: 'cmo.content.write_candidate', level: 'WRITE', resourceClass: 'content' },
});

function normalizeTool(name) {
  return String(name || '').trim().toLowerCase();
}

function resolveTool(name) {
  return CMO_TOOLS[normalizeTool(name)] || null;
}

module.exports = { CMO_TOOLS, resolveTool, normalizeTool };
