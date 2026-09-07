/**
 * staff-agent-chat.js — gemensam, portal-neutral Staff Agent Chat (WP-004).
 *
 * EN komponent för alla verksamhetsagenter (CCO/CFO/CMO/CAO/COO/CEO) — inte sex
 * chatmotorer. Bootstrappar serververifierad context (WP-003) och streamar från
 * Master Agent /staff/agent-chat (no-action-shell).
 *
 * Frontend skapar ALDRIG userId/tenantId/role/entitlement — de kommer från
 * backend. No secrets renderas.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.ArcanaStaffAgentChat = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  var MASTER_AGENT_CHAT_URL = '/staff/agent-chat';
  var MASTER_AGENT_CONTEXT_URL = '/api/v1/staff/agent-context';

  var AGENT_LABELS = {
    CEO: 'CEO — ledning',
    CCO: 'CCO — kommunikation & patientflöden',
    CFO: 'CFO — ekonomi',
    CMO: 'CMO — marknad',
    CAO: 'CAO — administration',
    COO: 'COO — drift',
  };
  var AGENT_IDS = Object.keys(AGENT_LABELS);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function readToken() {
    try { if (root && root.localStorage) return root.localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* ignore */ }
    return '';
  }

  function labelFor(agentId) {
    return AGENT_LABELS[agentId] || String(agentId || '');
  }

  // Testbar entitlement-gating: chatt visas endast om agentId finns bland
  // aktiva entitlements (backend är security; detta är UX-visibilitet).
  function shouldShowChat(agents, agentId) {
    var list = Array.isArray(agents) ? agents : [];
    return list.indexOf(agentId) !== -1 && Object.prototype.hasOwnProperty.call(AGENT_LABELS, agentId);
  }

  function renderMessagesHtml(messages) {
    var list = Array.isArray(messages) ? messages : [];
    if (!list.length) {
      return '<div class="chat-empty">Starta ett samtal med ' + esc(labelFor(list.agentId || '')) + '.</div>';
    }
    return list.map(function (m) {
      var role = m.role === 'assistant' ? 'assistant' : 'user';
      return '<div class="chat-msg chat-msg--' + role + '">' + esc(m.content) + '</div>';
    }).join('');
  }

  function renderShellHtml(state) {
    var s = state || {};
    var label = esc(labelFor(s.agentId));
    var header = '<div class="chat-header">' + label + (s.loading ? ' · <span class="chat-loading">skriver…</span>' : '') + '</div>';
    var list = renderMessagesHtml(s.messages || []);
    var error = s.error ? '<div class="chat-error">' + esc(s.error) + '</div>' : '';
    var footer = '<div class="chat-input"><input class="chat-input-field" type="text" placeholder="Skriv…" />' +
      '<button class="chat-send" type="button">Skicka</button>' +
      '<button class="chat-new" type="button">Ny konversation</button></div>';
    return '<section class="staff-agent-chat" data-agent="' + esc(s.agentId) + '">' + header + list + error + footer + '</section>';
  }

  function createChat(options) {    var o = options || {};
    var agentId = String(o.agentId || '');
    var portalId = String(o.portalId || agentId);
    var container = o.container;
    var pageContext = o.pageContext;
    var messages = [];
    var conversationId = null;

    function setHtml(html) { if (container) container.innerHTML = html; }

    function render(extra) {
      setHtml(renderShellHtml({
        agentId: agentId,
        loading: extra && extra.loading,
        error: extra && extra.error,
        messages: messages,
      }));
    }

    function bootstrapContext() {
      var token = readToken();
      var headers = { 'content-type': 'application/json' };
      if (token) headers['x-auth-token'] = token;
      return fetch(MASTER_AGENT_CONTEXT_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ agent_id: agentId, portal_id: portalId, page_context: pageContext }),
      }).then(function (r) {
        if (!r.ok) throw new Error('Ingen åtkomst till agenten (' + r.status + ').');
        return r.json();
      });
    }

    function streamReply(contextToken, message) {
      return fetch(MASTER_AGENT_CHAT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-staff-agent-context': contextToken },
        body: JSON.stringify({ context: contextToken, message: message }),
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error('Chatt misslyckades (' + res.status + ').');
        return res.body.getReader();
      });
    }

    function send(message) {
      var text = String(message || '').trim();
      if (!text) return;
      messages.push({ role: 'user', content: text });
      render({ loading: true });
      var acc = '';
      return bootstrapContext().then(function (body) {
        return fetch(MASTER_AGENT_CHAT_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-staff-agent-context': body.context },
          body: JSON.stringify({ context: body.context, message: text }),
        });
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error('Chatt misslyckades (' + res.status + ').');
        return res.body.getReader();
      }).then(function (reader) {
        var decoder = new TextDecoder();
        var buffer = '';
        var done = false;
        function pump() {
          if (done) return Promise.resolve();
          return reader.read().then(function (r) {
            if (r.done) { finalize(); return; }
            buffer += decoder.decode(r.value, { stream: true });
            // Parsa kompletta "data: ..." rader.
            var lines = buffer.split('\n');
            buffer = lines.pop(); // ofullständig sista rad
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line.indexOf('data:') !== 0) continue;
              var data = line.slice(5).trim();
              if (data === '[DONE]') { done = true; finalize(); return; }
              try {
                var evt = JSON.parse(data);
                if (evt && typeof evt.delta === 'string') { acc += evt.delta; }
              } catch (e) { /* malformed event: fail-safe, ignorera */ }
            }
            return pump();
          });
        }
        function finalize() {
          if (acc) { messages.push({ role: 'assistant', content: acc }); }
          render();
        }
        return pump();
      }).catch(function (e) {
        render({ error: e && e.message ? e.message : 'Något gick fel.' });
      });
    }

    return { agentId: agentId, render: render, send: send, AGENT_LABELS: AGENT_LABELS, getMessages: function () { return messages; } };
  }

  // Delad embed: entitlement-gated mount av chatten i valfri portal.
  // Används av CFO/CCO/CMO/CAO/COO med samma komponent + olika config/context.
  function embedStaffAgentChat(opts) {
    var o = opts || {};
    var agentId = String(o.agentId || '');
    var portalId = String(o.portalId || agentId);
    var pageContext = o.pageContext;
    var hostId = o.hostId || ('agent-chat-' + agentId.toLowerCase());
    var t = readToken();
    var headers = {};
    if (t) headers['x-auth-token'] = t;
    return fetch(MASTER_AGENT_CONTEXT_URL.split('/staff/agent-context')[0] + '/staff/agent-entitlements/me', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var agents = (body && body.agents) || [];
        if (!shouldShowChat(agents, agentId)) return null; // ingen entitlement → dold
        var host = document.getElementById(hostId);
        if (!host) {
          host = document.createElement('aside');
          host.id = hostId;
          host.className = 'staff-agent-chat-host';
          document.body.appendChild(host);
        }
        var chat = createChat({ agentId: agentId, portalId: portalId, pageContext: pageContext, container: host });
        chat.render();
        host.addEventListener('click', function (ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest('.chat-send') : null;
          if (!btn) return;
          var input = host.querySelector('.chat-input-field');
          if (input && input.value) { chat.send(input.value); input.value = ''; }
        });
        host.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            var input = host.querySelector('.chat-input-field');
            if (input && input.value) { chat.send(input.value); input.value = ''; }
          }
        });
        return chat;
      });
  }

  return {
    AGENT_LABELS: AGENT_LABELS,
    AGENT_IDS: AGENT_IDS,
    labelFor: labelFor,
    shouldShowChat: shouldShowChat,
    renderMessagesHtml: renderMessagesHtml,
    renderShellHtml: renderShellHtml,
    createChat: createChat,
    embedStaffAgentChat: embedStaffAgentChat,
  };
});
