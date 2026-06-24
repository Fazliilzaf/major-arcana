/**
 * CCO Konversationer v2 — skal-renderare (P0b · "söm-beviset").
 *
 * window.ArcanaConversationsV2.render(ctx) målar det nya 4-zons-skalet
 * (lanes · inbox · tråd · kontext) in i #cco-conv-v2-root med RIKTIG data
 * från den befintliga arbetskö-staten. Ingen egen datakälla, inga mockar.
 *
 * Renderaren anropas BARA av render-switchen i app.js när flaggan är PÅ
 * (window.__ARCANA_CONVERSATIONS_V2_ENABLED__). Flagga AV ⇒ aldrig monterad,
 * legacy-vyn orörd.
 *
 * P0b-omfattning: lanes/inbox/tråd-header/kontext från live-trådar +
 * trådval och lane-filter via befintliga handlers. Skrivande actions
 * (Svarstudio/skicka/bokning) är medvetet inerta tills owner-GO (P2/P3).
 *
 * ctx = {
 *   lanes:      [{ id, label, icon, count, group }],
 *   activeLane: string,
 *   laneThreads:[rawThread],   // trådar i aktiv lane (det inboxen visar)
 *   allThreads: [rawThread],   // hela scoped-kön (för flik-räknare)
 *   selected:   rawThread|null,
 *   handlers:   { selectThread(id), setLane(id), action(name, thread) },
 * }
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var ROOT_ID = 'cco-conv-v2-root';
  var activeTab = 'alla'; // alla | olasta | bokning | vip
  var root = null;

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var AVATAR_BGS = [
    'linear-gradient(180deg,#d8c1f0,#b48ad6)',
    'linear-gradient(180deg,#c5d8a8,#92b86e)',
    'linear-gradient(180deg,#ffe3b8,#e8a04e)',
    'linear-gradient(180deg,#b8d4e8,#7aa8d4)',
    'linear-gradient(180deg,#f4d4f0,#d48ac8)',
    'linear-gradient(180deg,#c8e8e0,#88c8b8)',
    'linear-gradient(180deg,#f0c8c8,#d48484)',
    'linear-gradient(180deg,#f4e8c8,#d4b870)',
  ];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function threadName(thread) {
    return (
      text(thread.customerName) ||
      text(thread.from && thread.from.name) ||
      text(thread.from) ||
      text(thread.subject) ||
      'Okänd avsändare'
    );
  }

  function initials(thread) {
    var explicit = text(thread.customerInitials);
    if (explicit) return explicit.slice(0, 2).toUpperCase();
    var name = threadName(thread);
    var parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function avatarBg(thread) {
    var name = threadName(thread);
    var sum = 0;
    for (var i = 0; i < name.length; i += 1) sum = (sum + name.charCodeAt(i)) % 997;
    return AVATAR_BGS[sum % AVATAR_BGS.length];
  }

  function sourceKey(thread) {
    var hay = (
      text(thread.mailboxBadge) +
      ' ' +
      text(thread.mailboxId) +
      ' ' +
      text(thread.channel) +
      ' ' +
      text(thread.ownerKey) +
      ' ' +
      text(thread.ownerLabel)
    ).toLowerCase();
    if (hay.indexOf('fazli') >= 0) return 'fazli';
    if (hay.indexOf('egzona') >= 0) return 'egzona';
    if (hay.indexOf('contact') >= 0) return 'contact';
    if (hay.indexOf('info') >= 0) return 'info';
    return 'info';
  }

  function sourceLabel(thread) {
    return text(thread.mailboxBadge) || text(thread.mailboxId) || sourceKey(thread) + '@';
  }

  function parseTs(thread) {
    var raw = thread.ts || thread.lastMessageAt || thread.updatedAt || thread.receivedAt;
    if (!raw) return null;
    var date = raw instanceof Date ? raw : new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  }

  function whenLabel(thread) {
    var date = parseTs(thread);
    if (!date) return '';
    var now = new Date();
    var sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return (
        String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
      );
    }
    var yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (
      date.getFullYear() === yest.getFullYear() &&
      date.getMonth() === yest.getMonth() &&
      date.getDate() === yest.getDate()
    ) {
      return 'igår';
    }
    return date.getDate() + ' ' + MONTHS[date.getMonth()];
  }

  function isUnread(thread) {
    return thread.unread === true || thread.requiresAttention === true || thread.isUnread === true;
  }

  function isBooking(thread) {
    if (text(thread.workflowLane) === 'bookable' || text(thread.primaryLaneId) === 'bookable') {
      return true;
    }
    return /\bbok/i.test(text(thread.subject) + ' ' + text(thread.preview));
  }

  function isVip(thread) {
    return (
      thread.vip === true ||
      thread.isVip === true ||
      /\bvip\b/i.test(text(thread.riskLabel) + ' ' + text(thread.badge) + ' ' + text(thread.tier))
    );
  }

  function tagsFor(thread) {
    var tags = [];
    if (isUnread(thread)) tags.push({ kind: 'urgent', label: 'OLÄST' });
    if (isVip(thread)) tags.push({ kind: 'vip', label: 'VIP' });
    if (isBooking(thread)) tags.push({ kind: 'booking', label: 'Bokning' });
    return tags;
  }

  function ensureRoot() {
    if (root && doc.body.contains(root)) return root;
    root = doc.getElementById(ROOT_ID);
    if (root) return root;
    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="app-grid">' +
      '<aside class="lane-sidebar" data-v2-lanes role="navigation" aria-label="Köfält"></aside>' +
      '<aside class="inbox-shell"><div class="inbox-kicker">Inkorg</div>' +
      '<h2 class="inbox-h2" data-v2-inbox-h2></h2>' +
      '<div class="inbox-tabs" data-v2-tabs></div>' +
      '<div class="inbox-list" data-v2-inbox></div></aside>' +
      '<section class="thread-shell" data-v2-thread></section>' +
      '<aside class="ctx-shell" data-v2-ctx></aside>' +
      '</div>';
    var workspace = doc.querySelector('.preview-workspace');
    if (workspace && workspace.parentNode) {
      workspace.parentNode.insertBefore(root, workspace.nextSibling);
    } else {
      (doc.querySelector('.preview-canvas') || doc.body).appendChild(root);
    }
    return root;
  }

  function renderLanes(ctx) {
    var el = root.querySelector('[data-v2-lanes]');
    if (!el) return;
    var html = '';
    var lastGroup = null;
    ctx.lanes.forEach(function (lane) {
      if (lane.group && lane.group !== lastGroup) {
        html +=
          (lastGroup ? '<div class="lane-sep"></div>' : '') +
          '<div class="lane-kicker">' +
          esc(lane.group) +
          '</div>';
        lastGroup = lane.group;
      } else if (!lane.group && lastGroup !== '_top') {
        html += '<div class="lane-kicker">Köfält</div>';
        lastGroup = '_top';
      }
      var active = lane.id === ctx.activeLane ? ' active' : '';
      html +=
        '<div class="lane-row' +
        active +
        '" data-lane="' +
        esc(lane.id) +
        '" role="button" tabindex="0">' +
        '<span class="ico" aria-hidden="true">' +
        esc(lane.icon) +
        '</span>' +
        '<span class="lbl">' +
        esc(lane.label) +
        '</span>' +
        '<span class="ct">' +
        esc(lane.count) +
        '</span></div>';
    });
    el.innerHTML = html;
  }

  function visibleThreads(ctx) {
    var list = (ctx.laneThreads || []).slice();
    if (activeTab === 'olasta') return list.filter(isUnread);
    if (activeTab === 'bokning') return list.filter(isBooking);
    if (activeTab === 'vip') return list.filter(isVip);
    return list;
  }

  function renderTabs(ctx) {
    var el = root.querySelector('[data-v2-tabs]');
    var h2 = root.querySelector('[data-v2-inbox-h2]');
    if (!el) return;
    var all = ctx.allThreads || [];
    var counts = {
      alla: (ctx.laneThreads || []).length,
      olasta: all.filter(isUnread).length,
      bokning: all.filter(isBooking).length,
      vip: all.filter(isVip).length,
    };
    if (h2) {
      h2.textContent = counts.olasta + ' olästa · ' + all.length + ' totalt';
    }
    var tabs = [
      { id: 'alla', label: 'Alla', count: counts.alla },
      { id: 'olasta', label: 'Olästa', count: counts.olasta },
      { id: 'bokning', label: 'Bokning', count: counts.bokning },
      { id: 'vip', label: 'VIP', count: counts.vip },
    ];
    el.innerHTML = tabs
      .map(function (tab) {
        return (
          '<button class="inbox-tab' +
          (tab.id === activeTab ? ' active' : '') +
          '" data-tab="' +
          tab.id +
          '" type="button">' +
          esc(tab.label) +
          '<span class="count">' +
          tab.count +
          '</span></button>'
        );
      })
      .join('');
  }

  function renderInbox(ctx) {
    var el = root.querySelector('[data-v2-inbox]');
    if (!el) return;
    var list = visibleThreads(ctx);
    if (!list.length) {
      el.innerHTML = '<div class="inbox-empty">Inga konversationer i denna vy.</div>';
      return;
    }
    var selectedId = ctx.selected ? text(ctx.selected.id) : '';
    el.innerHTML = list
      .map(function (thread) {
        var id = text(thread.id);
        var active = id && id === selectedId ? ' active' : '';
        var unread = isUnread(thread) ? ' thread-unread' : '';
        var tags = tagsFor(thread);
        return (
          '<div class="thread' +
          active +
          unread +
          '" data-source="' +
          esc(sourceKey(thread)) +
          '" data-thread-id="' +
          esc(id) +
          '" role="button" tabindex="0">' +
          '<div class="thread-av" style="background:' +
          esc(avatarBg(thread)) +
          '">' +
          esc(initials(thread)) +
          '</div>' +
          '<div class="thread-body">' +
          '<div class="thread-from">' +
          esc(threadName(thread)) +
          ' <span class="when">' +
          esc(whenLabel(thread)) +
          '</span></div>' +
          '<div class="thread-subj">' +
          esc(text(thread.subject) || '(utan ämne)') +
          '</div>' +
          '<div class="thread-preview">' +
          esc(text(thread.preview)) +
          '</div>' +
          (tags.length
            ? '<div class="thread-tags">' +
              tags
                .map(function (tag) {
                  return (
                    '<span class="thread-tag thread-tag--' +
                    tag.kind +
                    '">' +
                    esc(tag.label) +
                    '</span>'
                  );
                })
                .join('') +
              '</div>'
            : '') +
          '</div></div>'
        );
      })
      .join('');
  }

  function renderThread(ctx) {
    var el = root.querySelector('[data-v2-thread]');
    if (!el) return;
    var thread = ctx.selected;
    if (!thread) {
      el.innerHTML =
        '<div class="thread-empty">Välj en konversation i inkorgen för att läsa tråden.</div>';
      return;
    }
    var pills = '';
    pills +=
      '<span class="status-pill status-pill--source"><span class="dot"></span>' +
      esc(sourceLabel(thread)) +
      '</span>';
    if (text(thread.subject)) {
      pills +=
        '<span class="status-pill status-pill--info"><span class="dot"></span>' +
        esc(text(thread.subject)) +
        '</span>';
    }
    if (isUnread(thread)) {
      pills +=
        '<span class="status-pill status-pill--warning"><span class="dot"></span>Kräver åtgärd</span>';
    }
    // P0b: trådhydrering (full meddelandeström) kommer i P1 — visa det vi
    // faktiskt har (senaste preview) som en ärlig representation, ingen mock.
    var preview = text(thread.preview);
    var messages = preview
      ? '<div class="msg is-incoming"><div class="msg-av" style="background:' +
        esc(avatarBg(thread)) +
        '">' +
        esc(initials(thread)) +
        '</div><div>' +
        '<div class="msg-bubble">' +
        esc(preview) +
        '</div>' +
        '<div class="msg-meta">' +
        esc(threadName(thread)) +
        (whenLabel(thread) ? ' · ' + esc(whenLabel(thread)) : '') +
        '</div></div></div>'
      : '<div class="thread-empty">Meddelandeströmmen hydreras i nästa fas (P1).</div>';

    el.innerHTML =
      '<header class="thread-header"><div class="thread-header-main">' +
      '<div class="thread-header-kicker">Konversation</div>' +
      '<h2>' +
      esc(text(thread.subject) || threadName(thread)) +
      '</h2></div>' +
      '<div class="thread-header-actions">' +
      '<button class="nav-btn" type="button" data-v2-action="note" data-v2-soon>✎ Anteckna</button>' +
      '<button class="nav-btn nav-btn--ai" type="button" data-v2-action="studio" data-v2-soon>★ Svarstudio</button>' +
      '</div></header>' +
      '<div class="thread-status-bar">' +
      pills +
      '</div>' +
      '<div class="messages">' +
      messages +
      '</div>' +
      '<div class="thread-bottom-actions" role="toolbar" aria-label="Konversations-actions">' +
      '<button class="action-btn action-btn--studio" type="button" data-v2-action="studio" data-v2-soon><span class="action-ico">✱</span><span>Svarstudio</span></button>' +
      '<button class="action-btn action-btn--booking" type="button" data-v2-action="booking" data-v2-soon><span class="action-ico">📅</span><span>Bokningsyta</span></button>' +
      '<button class="action-btn action-btn--note" type="button" data-v2-action="note" data-v2-soon><span class="action-ico">📄</span><span>Smart anteckning</span></button>' +
      '<button class="action-btn action-btn--calendar" type="button" data-v2-action="calendar" data-v2-soon><span class="action-ico">📆</span><span>Kalender</span></button>' +
      '</div>';
  }

  function renderCtx(ctx) {
    var el = root.querySelector('[data-v2-ctx]');
    if (!el) return;
    var thread = ctx.selected;
    if (!thread) {
      el.innerHTML =
        '<div><div class="ctx-kicker">Kundkontext</div>' +
        '<h3 class="ctx-title">Operatörsstöd</h3></div>' +
        '<div class="ctx-meta" style="padding-top:8px">Ingen konversation vald.</div>';
      return;
    }
    var rows = '';
    rows += '<dt>Källa</dt><dd>' + esc(sourceLabel(thread)) + '</dd>';
    if (text(thread.subject)) rows += '<dt>Ämne</dt><dd>' + esc(text(thread.subject)) + '</dd>';
    if (whenLabel(thread)) rows += '<dt>Senast</dt><dd>' + esc(whenLabel(thread)) + '</dd>';
    rows +=
      '<dt>Status</dt><dd' +
      (isUnread(thread) ? ' style="color:var(--cco-status-warning);font-weight:700"' : '') +
      '>' +
      (isUnread(thread) ? 'Kräver åtgärd' : 'Inläst') +
      '</dd>';

    el.innerHTML =
      '<div><div class="ctx-kicker">Kundkontext</div>' +
      '<h3 class="ctx-title">Operatörsstöd</h3></div>' +
      '<div class="ctx-head"><div class="ctx-avatar" style="background:' +
      esc(avatarBg(thread)) +
      '">' +
      esc(initials(thread)) +
      '</div><div>' +
      '<div class="ctx-name">' +
      esc(threadName(thread)) +
      '</div>' +
      '<div class="ctx-meta">' +
      esc(sourceLabel(thread)) +
      '</div></div></div>' +
      '<dl class="ctx-grid">' +
      rows +
      '</dl>' +
      '<div class="ctx-actions">' +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="dossier" data-v2-soon>👤 Kunddossiér</button>' +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="booking" data-v2-soon>📅 Bokning</button>' +
      '<button class="quick-pill quick-pill--success" style="flex:1" type="button" data-v2-action="handled" data-v2-soon>✓ Klar</button>' +
      '</div>';
  }

  function findThreadById(ctx, id) {
    var all = (ctx.allThreads || []).concat(ctx.laneThreads || []);
    for (var i = 0; i < all.length; i += 1) {
      if (text(all[i].id) === text(id)) return all[i];
    }
    return null;
  }

  var boundCtx = null;

  function bindEvents() {
    if (root.__v2Bound) return;
    root.__v2Bound = true;
    root.addEventListener('click', function (event) {
      var laneEl = event.target.closest('[data-lane]');
      if (laneEl && boundCtx) {
        boundCtx.handlers.setLane(laneEl.getAttribute('data-lane'));
        return;
      }
      var tabEl = event.target.closest('[data-tab]');
      if (tabEl && boundCtx) {
        activeTab = tabEl.getAttribute('data-tab');
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        return;
      }
      var threadEl = event.target.closest('[data-thread-id]');
      if (threadEl && boundCtx) {
        var id = threadEl.getAttribute('data-thread-id');
        if (id) boundCtx.handlers.selectThread(id);
        return;
      }
      var actionEl = event.target.closest('[data-v2-action]');
      if (actionEl && boundCtx) {
        var name = actionEl.getAttribute('data-v2-action');
        boundCtx.handlers.action(name, boundCtx.selected);
      }
    });
  }

  function render(ctx) {
    if (!doc) return;
    boundCtx = ctx;
    ensureRoot();
    bindEvents();
    renderLanes(ctx);
    renderTabs(ctx);
    renderInbox(ctx);
    renderThread(ctx);
    renderCtx(ctx);
  }

  global.ArcanaConversationsV2 = {
    render: render,
    _findThreadById: findThreadById,
  };
})(typeof window !== 'undefined' ? window : globalThis);
