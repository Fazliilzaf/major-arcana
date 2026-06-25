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
  var mobilePane = 'inbox'; // mobil master-detail: 'inbox' | 'thread'
  var root = null;

  function isMobileViewport() {
    try {
      return global.matchMedia && global.matchMedia('(max-width: 768px)').matches;
    } catch (_error) {
      return false;
    }
  }

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

  function initialsFromName(name) {
    var parts = text(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return '–';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function initials(thread) {
    var explicit = text(thread.customerInitials);
    if (explicit) return explicit.slice(0, 2).toUpperCase();
    return initialsFromName(threadName(thread));
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

  function parseDate(raw) {
    if (!raw) return null;
    var date = raw instanceof Date ? raw : new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  }

  function parseTs(thread) {
    return parseDate(thread.ts || thread.lastMessageAt || thread.updatedAt || thread.receivedAt);
  }

  function hhmm(date) {
    return (
      String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
    );
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
      return hhmm(date);
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

  // ── Meddelandeström (hydrerad av selectRuntimeThread → thread.messages) ──
  var WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  var STAFF_BG = 'linear-gradient(180deg,#c5d8a8,#92b86e)';

  function messageList(thread) {
    if (Array.isArray(thread.messages)) return thread.messages;
    if (thread.threadDocument && Array.isArray(thread.threadDocument.messages)) {
      return thread.threadDocument.messages;
    }
    return [];
  }

  function isIncoming(message) {
    var role = text(message.role).toLowerCase();
    if (role === 'customer') return true;
    if (role === 'staff' || role === 'provider_notice') return false;
    return text(message.direction).toLowerCase() === 'inbound';
  }

  function messageBody(message) {
    return (
      text(message.conversationBody) ||
      text(message.body) ||
      text(message.preview) ||
      text(message.bodyPreview)
    );
  }

  function messageDate(message) {
    return parseDate(message.recordedAt || message.sentAt || message.ts);
  }

  function messageWhen(message) {
    if (text(message.time)) return text(message.time);
    var date = messageDate(message);
    return date ? hhmm(date) : '';
  }

  function dayKey(date) {
    return date ? date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate() : '';
  }

  function dayLabel(date) {
    if (!date) return '';
    var now = new Date();
    if (dayKey(date) === dayKey(now)) return 'Idag';
    var yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (dayKey(date) === dayKey(yest)) return 'Igår';
    return WEEKDAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()];
  }

  // ── Kontext-signaler (befintliga intel-fält på tråden) ──
  function signalRows(thread) {
    var msgs = messageList(thread);
    var rows = [];
    if (msgs.length) rows.push({ dt: 'Tråden', dd: msgs.length + ' meddelanden' });
    rows.push({ dt: 'Källa', dd: sourceLabel(thread) });
    pushIf(rows, 'Status', thread.statusLabel);
    pushIf(rows, 'Livscykel', thread.lifecycleLabel);
    pushIf(rows, 'Väntar på', thread.waitingLabel);
    pushIf(rows, 'Uppföljning', thread.followUpLabel, 'var(--cco-status-warning)');
    pushIf(rows, 'Risk', thread.riskLabel, 'var(--cco-status-danger)');
    pushIf(rows, 'Ägare', thread.ownerLabel || thread.displayOwnerLabel);
    pushIf(rows, 'Engagemang', thread.engagementLabel);
    pushIf(rows, 'Senast', thread.lastActivityLabel || whenLabel(thread));
    return rows;
  }

  function pushIf(rows, dt, value, color) {
    var v = text(value);
    if (v) rows.push({ dt: dt, dd: v, color: color });
  }

  function statusPills(thread) {
    var pills =
      '<span class="status-pill status-pill--source"><span class="dot"></span>' +
      esc(sourceLabel(thread)) +
      '</span>';
    if (text(thread.riskLabel)) {
      pills +=
        '<span class="status-pill status-pill--warning"><span class="dot"></span>' +
        esc(text(thread.riskLabel)) +
        '</span>';
    }
    var waiting = text(thread.waitingLabel) || text(thread.followUpLabel);
    if (waiting) {
      pills +=
        '<span class="status-pill status-pill--warning"><span class="dot"></span>' +
        esc(waiting) +
        '</span>';
    } else if (text(thread.statusLabel)) {
      pills +=
        '<span class="status-pill status-pill--info"><span class="dot"></span>' +
        esc(text(thread.statusLabel)) +
        '</span>';
    } else if (isUnread(thread)) {
      pills +=
        '<span class="status-pill status-pill--warning"><span class="dot"></span>Kräver åtgärd</span>';
    }
    if (isVip(thread)) {
      pills +=
        '<span class="status-pill" style="color:var(--accent-studio);' +
        'background:linear-gradient(180deg,var(--rose-pill-top),var(--rose-pill-bottom));' +
        'border-color:rgba(187,71,121,0.32)">' +
        '<span class="dot" style="background:var(--accent-studio)"></span>VIP</span>';
    }
    return pills;
  }

  function renderMessageStream(thread) {
    var msgs = messageList(thread);
    if (!msgs.length) {
      // Pre-hydrering: visa ärligt det vi har (senaste preview); hydreringen
      // triggas av selectRuntimeThread och målar om strömmen när den landat.
      var preview = text(thread.preview);
      if (!preview) {
        return '<div class="thread-empty">Laddar konversationen…</div>';
      }
      return (
        '<div class="msg is-incoming"><div class="msg-av" style="background:' +
        esc(avatarBg(thread)) +
        '">' +
        esc(initials(thread)) +
        '</div><div><div class="msg-bubble">' +
        esc(preview) +
        '</div><div class="msg-meta">' +
        esc(threadName(thread)) +
        (whenLabel(thread) ? ' · ' + esc(whenLabel(thread)) : '') +
        '</div></div></div>'
      );
    }
    // thread.messages är DESC (nyast först) → vänd till ASC för chatt-flöde.
    var asc = msgs.slice().reverse();
    var lastDay = null;
    var html = '';
    asc.forEach(function (message) {
      var date = messageDate(message);
      var key = dayKey(date);
      if (key && key !== lastDay) {
        html += '<div class="msg-day">' + esc(dayLabel(date)) + '</div>';
        lastDay = key;
      }
      var incoming = isIncoming(message);
      var author = text(message.author) || (incoming ? threadName(thread) : 'Klinik');
      var av = incoming
        ? '<div class="msg-av" style="background:' +
          esc(avatarBg(thread)) +
          '">' +
          esc(initials(thread)) +
          '</div>'
        : '<div class="msg-av" style="background:' +
          STAFF_BG +
          '">' +
          esc(initialsFromName(author)) +
          '</div>';
      var read =
        !incoming && message.isRead === true
          ? '<span style="color:var(--cco-status-success)">✓ läst</span> · '
          : '';
      html +=
        '<div class="msg ' +
        (incoming ? 'is-incoming' : 'is-outgoing') +
        '">' +
        av +
        '<div><div class="msg-bubble">' +
        esc(messageBody(message)) +
        '</div><div class="msg-meta">' +
        read +
        esc(author) +
        (messageWhen(message) ? ' · ' + esc(messageWhen(message)) : '') +
        '</div></div></div>';
    });
    return html;
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
      '<div class="lane-chips" data-v2-lane-chips></div>' +
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

  // Mobil: lane-sidebaren ersätts av en horisontell chip-rad i inboxen.
  function renderLaneChips(ctx) {
    var el = root.querySelector('[data-v2-lane-chips]');
    if (!el) return;
    el.innerHTML = ctx.lanes
      .map(function (lane) {
        var active = lane.id === ctx.activeLane ? ' active' : '';
        return (
          '<button class="lane-chip' +
          active +
          '" data-lane="' +
          esc(lane.id) +
          '" type="button">' +
          esc(lane.icon) +
          ' ' +
          esc(lane.label) +
          ' <span class="lane-chip-ct">' +
          esc(lane.count) +
          '</span></button>'
        );
      })
      .join('');
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
    var msgCount = messageList(thread).length;
    var pills = statusPills(thread);
    var messages = renderMessageStream(thread);

    el.innerHTML =
      '<header class="thread-header">' +
      '<button class="thread-back" type="button" data-v2-back aria-label="Tillbaka till inkorgen">‹ Inkorg</button>' +
      '<div class="thread-header-main">' +
      '<div class="thread-header-kicker">' +
      (msgCount ? 'Konversation · ' + msgCount + ' meddelanden' : 'Konversation') +
      '</div>' +
      '<h2>' +
      esc(text(thread.subject) || threadName(thread)) +
      '</h2></div>' +
      '<div class="thread-header-actions">' +
      '<button class="nav-btn thread-ctx-toggle" type="button" data-v2-ctx-toggle aria-label="Visa kundkontext">ⓘ Kund</button>' +
      '<button class="nav-btn" type="button" data-v2-action="note">✎ Anteckna</button>' +
      '<button class="nav-btn nav-btn--ai" type="button" data-v2-action="studio">★ Svarstudio</button>' +
      '</div></header>' +
      '<div class="thread-status-bar">' +
      pills +
      '</div>' +
      '<div class="messages">' +
      messages +
      '</div>' +
      '<div class="thread-bottom-actions" role="toolbar" aria-label="Konversations-actions">' +
      '<button class="action-btn action-btn--studio" type="button" data-v2-action="studio" data-v2-soon><span class="action-ico">✱</span><span>Svarstudio</span></button>' +
      '<button class="action-btn action-btn--booking" type="button" data-v2-action="booking"><span class="action-ico">📅</span><span>Bokningsyta</span></button>' +
      '<button class="action-btn action-btn--note" type="button" data-v2-action="note"><span class="action-ico">📄</span><span>Smart anteckning</span></button>' +
      '<button class="action-btn action-btn--calendar" type="button" data-v2-action="calendar"><span class="action-ico">📆</span><span>Kalender</span></button>' +
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
    var rows = signalRows(thread)
      .map(function (row) {
        var style = row.color ? ' style="color:' + row.color + ';font-weight:700"' : '';
        return '<dt>' + esc(row.dt) + '</dt><dd' + style + '>' + esc(row.dd) + '</dd>';
      })
      .join('');

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
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="dossier">👤 Kunddossiér</button>' +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="booking">📅 Bokning</button>' +
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

  // ─────────────────────────────────────────────────────────────────────
  // Svarstudio workbench (P2) — wired live mot draft-state-machine + gateway.
  // Skicka (→ sent) är owner-blockerat i backend OCH låst i UI:t.
  // ─────────────────────────────────────────────────────────────────────
  var studio = null;
  var STUDIO_TONES = [
    { id: 'professional', label: 'Professionell' },
    { id: 'warm', label: 'Varm' },
    { id: 'solution', label: 'Lösningsfokus' },
    { id: 'decision', label: 'Beslutsstöd' },
  ];
  var STUDIO_SIGNATURES = [
    {
      id: 'fazli',
      label: 'Fazli',
      text: 'Med vänliga hälsningar,\n\nDr. Fazli · Medical Director\nHair TP Clinic',
    },
    {
      id: 'egzona',
      label: 'Egzona',
      text: 'Med vänliga hälsningar,\n\nEgzona · Customer Lead\nHair TP Clinic',
    },
    { id: 'contact', label: 'Kontakt', text: 'Med vänliga hälsningar,\n\nHair TP Clinic' },
  ];

  function signatureText(id) {
    var s = STUDIO_SIGNATURES.filter(function (x) {
      return x.id === id;
    })[0];
    return s ? s.text : '';
  }

  function studioSnippet(thread) {
    var msgs = messageList(thread);
    for (var i = 0; i < msgs.length; i += 1) {
      if (isIncoming(msgs[i])) return messageBody(msgs[i]);
    }
    return text(thread.preview);
  }

  function openStudio(thread) {
    if (!thread) return;
    studio = {
      thread: thread,
      draftId: null,
      tone: 'professional',
      signature: 'egzona',
      body: '',
      busy: false,
      status: 'draft',
      error: '',
      decision: '',
    };
    renderStudio();
  }

  function closeStudio() {
    studio = null;
    var host = root.querySelector('[data-v2-studio]');
    if (host) host.remove();
  }

  function studioCapture() {
    if (!studio) return;
    var ta = root.querySelector('[data-studio-body]');
    if (ta) studio.body = ta.value;
  }

  function studioChips(items, activeId, group) {
    return items
      .map(function (it) {
        return (
          '<button class="wb-chip' +
          (it.id === activeId ? ' is-active' : '') +
          '" data-studio-' +
          group +
          '="' +
          it.id +
          '" type="button">' +
          esc(it.label) +
          '</button>'
        );
      })
      .join('');
  }

  function renderStudio() {
    if (!studio) return;
    var thread = studio.thread;
    var host = root.querySelector('[data-v2-studio]');
    if (!host) {
      host = doc.createElement('div');
      host.setAttribute('data-v2-studio', '');
      root.appendChild(host);
    }
    var snippet = studioSnippet(thread);
    var ctxRows = signalRows(thread)
      .map(function (r) {
        return (
          '<div class="wb-fact-cell"><span class="wb-fact-lbl">' +
          esc(r.dt) +
          '</span><span class="wb-fact-val">' +
          esc(r.dd) +
          '</span></div>'
        );
      })
      .join('');
    var policyNote =
      studio.decision === 'review_required'
        ? '⚠ Kräver granskning'
        : studio.draftId
          ? '✓ Sparat (' + esc(studio.status) + ')'
          : 'Ej sparat';
    host.innerHTML =
      '<div class="action-modal-backdrop" data-studio-backdrop>' +
      '<div class="action-modal--workbench" role="dialog" aria-modal="true" aria-label="Svarstudio">' +
      '<div class="action-modal-head"><h3>Svarstudio · ' +
      esc(threadName(thread)) +
      '</h3>' +
      '<span class="wb-head-chips">' +
      (text(thread.riskLabel)
        ? '<span class="wb-head-chip wb-head-chip--risk">' + esc(thread.riskLabel) + '</span>'
        : '') +
      '<span class="wb-head-chip wb-head-chip--blocked">⏸ Skicka kräver owner</span></span>' +
      '<button class="action-modal-close" data-studio-close type="button" aria-label="Stäng">×</button></div>' +
      '<div class="workbench-grid">' +
      '<div class="workbench-context">' +
      '<div class="wb-customer-card"><div class="wb-avatar" style="background:' +
      esc(avatarBg(thread)) +
      '">' +
      esc(initials(thread)) +
      '</div><div><p class="wb-customer-name">' +
      esc(threadName(thread)) +
      '</p><p class="wb-customer-sub">' +
      esc(sourceLabel(thread)) +
      '</p></div></div>' +
      '<div class="wb-fact-grid">' +
      ctxRows +
      '</div>' +
      '</div>' +
      '<div class="workbench-main">' +
      '<div class="wb-thread-block"><div class="wb-thread-snippet">' +
      '<div class="wb-thread-snippet-from">' +
      esc(threadName(thread)) +
      '</div>' +
      esc(snippet || '') +
      '</div></div>' +
      '<div class="wb-reply-block">' +
      '<div class="wb-chip-row-sect"><span class="wb-section-kicker">Ton</span><div class="wb-chips">' +
      studioChips(STUDIO_TONES, studio.tone, 'tone') +
      '</div></div>' +
      '<div class="wb-chip-row-sect"><span class="wb-section-kicker">Signatur</span><div class="wb-chips">' +
      studioChips(STUDIO_SIGNATURES, studio.signature, 'sig') +
      '</div></div>' +
      '<div class="wb-smart-actions"><button class="wb-chip" data-studio-generate type="button"' +
      (studio.busy ? ' disabled' : '') +
      '>' +
      (studio.busy ? '… genererar' : '★ AI-generera utkast') +
      '</button></div>' +
      '<div class="wb-field"><span class="wb-field-lbl">Svar</span>' +
      '<textarea data-studio-body placeholder="Skriv eller generera ett svar…">' +
      esc(studio.body) +
      '</textarea>' +
      '<div class="wb-textmeta"><span data-studio-count>' +
      studio.body.length +
      ' tecken</span>' +
      '<span class="wb-policy-ok">' +
      policyNote +
      '</span></div></div>' +
      (studio.error
        ? '<div class="wb-route-info" style="color:var(--cco-status-danger)">' +
          esc(studio.error) +
          '</div>'
        : '') +
      '</div></div>' +
      '<div class="wb-footer">' +
      '<button class="wb-primary-cta" data-studio-send type="button" disabled title="Live-utskick kräver owner och är avstängt">📨 Skicka (låst)</button>' +
      '<span class="wb-send-locked">🔒 Skicka är owner-blockerat</span>' +
      '<button class="wb-secondary-cta" data-studio-save type="button">Spara utkast</button>' +
      '<button class="wb-secondary-cta" data-studio-review type="button">Begär godkännande</button>' +
      '<button class="wb-secondary-cta wb-secondary-cta--approve" data-studio-approve type="button">Godkänn</button>' +
      '<button class="wb-secondary-cta" data-studio-close type="button">Stäng</button>' +
      '</div></div></div>';
  }

  function studioPayload() {
    var t = studio.thread;
    return {
      customerId: text(t.customerId) || text(t.id),
      tenantId: text(t.tenantId),
      tone: studio.tone,
      customerName: threadName(t),
      threadSnippet: studioSnippet(t),
      signature: signatureText(studio.signature),
      subject: text(t.subject),
    };
  }

  function studioFail(error) {
    studio.busy = false;
    studio.error = (error && error.message) || 'Något gick fel.';
    renderStudio();
  }

  async function studioGenerate() {
    if (!studio || !boundCtx.handlers.studioGenerate) return;
    studioCapture();
    studio.busy = true;
    studio.error = '';
    renderStudio();
    try {
      var res = await boundCtx.handlers.studioGenerate(studioPayload());
      studio.body = text(res && res.body) || studio.body;
      studio.draftId = (res && res.draftId) || studio.draftId;
      studio.status = (res && res.status) || 'draft';
      studio.decision = (res && res.decision) || '';
      studio.busy = false;
      renderStudio();
    } catch (error) {
      studioFail(error);
    }
  }

  async function studioEnsureSaved() {
    studioCapture();
    var res = await boundCtx.handlers.studioSave({
      draftId: studio.draftId,
      customerId: text(studio.thread.customerId) || text(studio.thread.id),
      tenantId: text(studio.thread.tenantId),
      subject: text(studio.thread.subject),
      body: studio.body,
    });
    var draft = (res && res.draft) || {};
    if (draft.draftId) studio.draftId = draft.draftId;
    if (draft.status) studio.status = draft.status;
    return draft;
  }

  async function studioSave() {
    if (!studio || !boundCtx.handlers.studioSave) return;
    studio.busy = true;
    studio.error = '';
    try {
      await studioEnsureSaved();
      studio.busy = false;
      renderStudio();
    } catch (error) {
      studioFail(error);
    }
  }

  async function studioTransitionTo(target) {
    if (!studio || !boundCtx.handlers.studioTransition) return;
    studio.busy = true;
    studio.error = '';
    try {
      await studioEnsureSaved();
      // approve kräver needs_approval först
      var chain =
        target === 'approved' && studio.status === 'draft'
          ? ['needs_approval', 'approved']
          : target === 'needs_approval' && studio.status !== 'draft'
            ? []
            : [target];
      for (var i = 0; i < chain.length; i += 1) {
        var res = await boundCtx.handlers.studioTransition(studio.draftId, chain[i]);
        if (res && res.draft && res.draft.status) studio.status = res.draft.status;
      }
      studio.busy = false;
      renderStudio();
    } catch (error) {
      studioFail(error);
    }
  }

  var boundCtx = null;

  function bindEvents() {
    if (root.__v2Bound) return;
    root.__v2Bound = true;
    root.addEventListener('input', function (event) {
      if (studio && event.target.matches('[data-studio-body]')) {
        studio.body = event.target.value;
        var count = root.querySelector('[data-studio-count]');
        if (count) count.textContent = studio.body.length + ' tecken';
      }
    });
    root.addEventListener('click', function (event) {
      // ── Svarstudio workbench-interaktioner ──
      if (studio) {
        if (
          event.target.closest('[data-studio-close]') ||
          event.target.matches('[data-studio-backdrop]')
        ) {
          closeStudio();
          return;
        }
        var toneEl = event.target.closest('[data-studio-tone]');
        if (toneEl) {
          studioCapture();
          studio.tone = toneEl.getAttribute('data-studio-tone');
          renderStudio();
          return;
        }
        var sigEl = event.target.closest('[data-studio-sig]');
        if (sigEl) {
          studioCapture();
          studio.signature = sigEl.getAttribute('data-studio-sig');
          renderStudio();
          return;
        }
        if (event.target.closest('[data-studio-generate]')) {
          void studioGenerate();
          return;
        }
        if (event.target.closest('[data-studio-save]')) {
          void studioSave();
          return;
        }
        if (event.target.closest('[data-studio-review]')) {
          void studioTransitionTo('needs_approval');
          return;
        }
        if (event.target.closest('[data-studio-approve]')) {
          void studioTransitionTo('approved');
          return;
        }
        if (event.target.closest('[data-studio-send]')) {
          return; /* låst: owner-blockerat */
        }
      }
      // Mobil master-detail-navigering.
      if (event.target.closest('[data-v2-back]')) {
        mobilePane = 'inbox';
        if (root.dataset) root.dataset.mobileCtx = 'closed';
        root.dataset.mobilePane = 'inbox';
        return;
      }
      if (event.target.closest('[data-v2-ctx-toggle]')) {
        root.dataset.mobileCtx = root.dataset.mobileCtx === 'open' ? 'closed' : 'open';
        return;
      }
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
        if (id) {
          // Mobil: navigera till tråd-panelen (master-detail).
          if (isMobileViewport()) {
            mobilePane = 'thread';
            root.dataset.mobilePane = 'thread';
          }
          boundCtx.handlers.selectThread(id);
        }
        return;
      }
      var actionEl = event.target.closest('[data-v2-action]');
      if (actionEl && boundCtx) {
        var name = actionEl.getAttribute('data-v2-action');
        // Kunddossiér är en säker läs-/navigeringsaction (P1) — öppnar V12.
        // Övriga (Svarstudio/skicka/bokning) förblir inerta tills owner-GO.
        if (name === 'studio') {
          openStudio(boundCtx.selected);
        } else if (name === 'dossier' && typeof boundCtx.handlers.openDossier === 'function') {
          boundCtx.handlers.openDossier(boundCtx.selected);
        } else {
          boundCtx.handlers.action(name, boundCtx.selected);
        }
      }
    });
  }

  function render(ctx) {
    if (!doc) return;
    boundCtx = ctx;
    ensureRoot();
    bindEvents();
    // Mobil master-detail: utan vald tråd visas alltid inboxen.
    if (!ctx.selected) mobilePane = 'inbox';
    root.dataset.mobilePane = mobilePane;
    if (!root.dataset.mobileCtx) root.dataset.mobileCtx = 'closed';
    renderLanes(ctx);
    renderLaneChips(ctx);
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
