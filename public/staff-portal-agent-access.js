/**
 * staff-portal-agent-access.js — Owner Access Management (WP-006).
 *
 * Additivt Owner-UI för grant/revoke av agent-entitlements. Återanvänder
 * WP-001:s backend (/staff/agent-entitlements/{grant,revoke,me}). Ändrar ALDRIG
 * staff-rollen — agentaccess är ett separat lager ovanpå befintlig RBAC.
 *
 * CM visas aldrig som agentbehörighet (CFO intake).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.ArcanaStaffAgentAccess = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  var GRANT_URL = '/api/v1/staff/agent-entitlements/grant';
  var REVOKE_URL = '/api/v1/staff/agent-entitlements/revoke';

  var AGENT_CHOICES = ['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']; // CM utelämnad
  var AGENT_LABELS = {
    CEO: 'CEO — ledning',
    CCO: 'CCO — kommunikation & patientflöden',
    CFO: 'CFO — ekonomi',
    CMO: 'CMO — marknad',
    CAO: 'CAO — administration',
    COO: 'COO — drift',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeAgentChoice(v) {
    var u = String(v || '').trim().toUpperCase();
    return AGENT_CHOICES.indexOf(u) !== -1 ? u : '';
  }

  function readToken() {
    try { if (root && root.localStorage) return root.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignore */ }
    return '';
  }

  // Pure: renderar checkbox-lista för en staff-användare. activeAgents = aktiva.
  // staffUser = entitlement-nyckel (auth user UUID); displayName = synlig etikett
  // (e-post). data-user bär ALLTID nyckeln, inte visningsetiketten.
  function renderAgentAccessHtml(staffUser, activeAgents, displayName) {
    var active = Array.isArray(activeAgents) ? activeAgents : [];
    var display = displayName || staffUser;
    var boxes = AGENT_CHOICES.map(function (agent) {
      var checked = active.indexOf(agent) !== -1;
      return (
        '<label class="agent-access-row" data-agent="' + esc(agent) + '">' +
        '<input type="checkbox" class="agent-access-check" value="' + esc(agent) + '"' + (checked ? ' checked' : '') + ' /> ' +
        esc(AGENT_LABELS[agent]) + '</label>'
      );
    }).join('');
    return (
      '<div class="agent-access-panel" data-user="' + esc(staffUser) + '">' +
      '<div class="agent-access-user">' + esc(display) + '</div>' +
      boxes +
      '</div>'
    );
  }

  // Pure: diff mellan nuvarande och nästa → { grant:[], revoke:[] }.
  function buildDiff(currentAgents, nextAgents) {
    var cur = (Array.isArray(currentAgents) ? currentAgents : []).filter(function (a) { return AGENT_CHOICES.indexOf(a) !== -1; });
    var next = (Array.isArray(nextAgents) ? nextAgents : []).filter(function (a) { return AGENT_CHOICES.indexOf(a) !== -1; });
    return {
      grant: next.filter(function (a) { return cur.indexOf(a) === -1; }),
      revoke: cur.filter(function (a) { return next.indexOf(a) === -1; }),
    };
  }

  function authHeaders() {
    var t = readToken();
    var h = { 'content-type': 'application/json' };
    if (t) h['x-auth-token'] = t;
    return h;
  }

  function grant(userId, agent) {
    return fetch(GRANT_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ userId: userId, agent: agent }) });
  }

  function revoke(userId, agent) {
    return fetch(REVOKE_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ userId: userId, agent: agent }) });
  }

  return {
    AGENT_CHOICES: AGENT_CHOICES,
    AGENT_LABELS: AGENT_LABELS,
    normalizeAgentChoice: normalizeAgentChoice,
    renderAgentAccessHtml: renderAgentAccessHtml,
    buildDiff: buildDiff,
    grant: grant,
    revoke: revoke,
  };
});
