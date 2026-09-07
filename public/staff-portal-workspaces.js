/**
 * staff-portal-workspaces.js — "Mina arbetsytor" i Staffportalen (WP-002).
 *
 * Renderar ENDAST de business-agentarbetsytor som backend (entitlement-API)
 * uttryckligen grantat till den autentiserade användaren. Ingen hårdkodad
 * roll→agent-mappning här — agentåtkomsten kommer från entitlement-källan.
 *
 * - CM är INTE en portal (CFO intake) → finns aldrig i AGENT_WORKSPACES.
 * - CEO har ingen auth-bridge ännu → href=null, visas som "Kommer snart"
 *   (vi länkar ALDRIG till ett osäkert separat loginflöde).
 * - Navigation är UX, inte security — direkt URL-access kräver requireAgentEntitlement.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ArcanaStaffWorkspaces = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';

  // Agent → workspace (v1). href=null => "Kommer snart" (disabled, ingen osäker länk).
  var AGENT_WORKSPACES = {
    CCO: { label: 'CCO — kommunikation & patientflöden', href: '/major-arcana-preview/' },
    CFO: { label: 'CFO — ekonomi', href: '/finance.html' },
    CMO: { label: 'CMO — marknad', href: '/admin.html' },
    CAO: { label: 'CAO — administration', href: '/admin.html' },
    COO: { label: 'COO — drift', href: '/admin.html' },
    CEO: { label: 'CEO — ledning', href: null },
  };

  var ORDER = ['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * Pure: agents (array av godkända agent-ID) -> HTML-sträng. Testbar.
   * Okända agent-ID (och CM) renderas aldrig.
   */
  function renderWorkspacesHtml(agents) {
    var list = Array.isArray(agents) ? agents : [];
    var known = list.filter(function (a) {
      return Object.prototype.hasOwnProperty.call(AGENT_WORKSPACES, a);
    });
    if (!known.length) {
      return '<div class="workspaces-empty">Du har ännu inga tilldelade AI-arbetsytor.</div>';
    }
    return ORDER
      .filter(function (a) { return known.indexOf(a) !== -1; })
      .map(function (a) {
        var ws = AGENT_WORKSPACES[a];
        if (!ws.href) {
          return (
            '<div class="workspace-card workspace-card--soon" data-agent="' + esc(a) + '">' +
            '<span class="workspace-label">' + esc(ws.label) + '</span>' +
            '<span class="workspace-soon">Kommer snart</span></div>'
          );
        }
        return (
          '<a class="workspace-card" data-agent="' + esc(a) + '" href="' + esc(ws.href) + '">' +
          '<span class="workspace-label">' + esc(ws.label) + '</span></a>'
        );
      })
      .join('');
  }

  function readToken() {
    try {
      if (root && root.localStorage) return root.localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) { /* ignore */ }
    return '';
  }

  function loadWorkspaces(container) {
    if (!container) return;
    var token = readToken();
    var headers = {};
    if (token) headers['x-auth-token'] = token;
    fetch('/api/v1/staff/agent-entitlements/me', { headers: headers })
      .then(function (r) {
        if (!r.ok) { container.innerHTML = renderWorkspacesHtml([]); return null; }
        return r.json();
      })
      .then(function (body) {
        container.innerHTML = renderWorkspacesHtml(body && body.agents);
      })
      .catch(function () {
        container.innerHTML = renderWorkspacesHtml([]);
      });
  }

  return { AGENT_WORKSPACES, renderWorkspacesHtml, loadWorkspaces, readToken };
});
