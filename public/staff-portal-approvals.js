/**
 * staff-portal-approvals.js — Approval Center (WP-010, DEL B).
 *
 * Additiv Owner/ledning-yta: listar PENDING approvals (OWNER_APPROVAL /
 * RELEASE_APPROVAL) som aktören får besluta om. Varje kort visar vem/agent/
 * action/repo/filer/diffstat och ger [Godkänn]/[Avvisa]. Ingen blind "Approve all".
 *
 * UI är INTE auktoritativ — all verifiering sker server-side i staffApprovals.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.ArcanaStaffApprovals = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var APPROVALS_URL = '/api/v1/staff/approvals';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Pure: renderar ett approval-kort.
  function renderApprovalCardHtml(approval) {
    var a = approval || {};
    var files = (Array.isArray(a.changedFiles) ? a.changedFiles : []).map(esc).join(', ');
    return (
      '<div class="approval-card" data-approval-id="' + esc(a.id) + '">' +
      '<div class="approval-meta">' +
      '<span class="approval-agent">' + esc(a.agent) + '</span> · ' +
      '<span class="approval-class">' + esc(a.approvalClass) + '</span>' +
      '</div>' +
      '<div class="approval-action">' + esc(a.action) + '</div>' +
      '<div class="approval-repo">Repo: ' + esc(a.repoId) + ' @ ' + esc(a.baseSha ? a.baseSha.slice(0, 8) : '') + '</div>' +
      '<div class="approval-actor">Begärd av: ' + esc(a.actor) + '</div>' +
      '<div class="approval-files">Filer: ' + (files || '—') + '</div>' +
      (a.diffstat ? '<pre class="approval-diffstat">' + esc(a.diffstat) + '</pre>' : '') +
      '<div class="approval-actions">' +
      '<button class="approval-approve" type="button">Godkänn</button>' +
      '<button class="approval-reject" type="button">Avvisa</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderShellHtml(approvals) {
    var list = Array.isArray(approvals) ? approvals : [];
    if (!list.length) {
      return '<div class="approvals-empty">Inga väntande godkännanden.</div>';
    }
    return list.map(renderApprovalCardHtml).join('');
  }

  function mount({ container, apiFetch, getToken, onChange } = {}) {
    if (!container || typeof apiFetch !== 'function' || typeof getToken !== 'function') return;

    function status(message, isError) {
      var el = container.querySelector('.approval-status');
      if (!el) return;
      el.textContent = message || '';
      el.className = 'approval-status' + (isError ? ' is-error' : '');
    }

    async function authFetch(url, opts = {}) {
      var headers = Object.assign({}, opts.headers || {});
      var token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      if (opts.body) headers['Content-Type'] = 'application/json';
      return apiFetch(url, Object.assign({}, opts, { headers }));
    }

    async function load() {
      var res = await authFetch(APPROVALS_URL);
      if (!res || res.status !== 200) {
        status('Kunde inte hämta godkännanden.', true);
        return;
      }
      var body = await res.json().catch(function () { return {}; });
      container.querySelector('.approval-list').innerHTML = renderShellHtml(body.approvals || []);
      wire();
      if (onChange) onChange({ count: (body.approvals || []).length });
    }

    function wire() {
      container.querySelectorAll('.approval-card').forEach(function (card) {
        var id = card.getAttribute('data-approval-id');
        card.querySelector('.approval-approve').addEventListener('click', function () {
          decide(id, 'approve');
        });
        card.querySelector('.approval-reject').addEventListener('click', function () {
          decide(id, 'reject');
        });
      });
    }

    async function decide(id, kind) {
      status('Sparar…');
      var res = await authFetch(APPROVALS_URL + '/' + encodeURIComponent(id) + '/' + kind, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Avvisad i Approval Center.' }),
      });
      if (!res || (res.status !== 200 && res.status !== 201)) {
        var body = await res?.json().catch(function () { return {}; });
        status(body?.error || 'Kunde inte spara beslut.', true);
        return;
      }
      status(kind === 'approve' ? 'Godkänt och exekverat.' : 'Avvisat.');
      await load();
    }

    if (container.querySelector('.approval-list')) load();
  }

  return {
    renderApprovalCardHtml: renderApprovalCardHtml,
    renderShellHtml: renderShellHtml,
    mount: mount,
  };
});
