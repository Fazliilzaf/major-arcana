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
 *   loading:    boolean,
 *   authRequired: boolean,
 *   handlers:   { selectThread(id), setLane(id), action(name, thread) },
 * }
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var ROOT_ID = 'cco-conv-v2-root';
  var activeTab = 'alla'; // alla | olasta | bokning | vip
  var activeFolder = 'inbox'; // inbox | sent — samma live-trådar, ingen ny källa
  var inboxQuery = '';
  var mobilePane = 'inbox'; // mobil master-detail: 'inbox' | 'thread'
  var activeSegment = 'alla'; // v3: alla | obesvarade | sla | mina
  var root = null;

  var THEME_KEY = 'arcana.conversationsV2.theme';
  var DENSITY_KEY = 'arcana.conversationsV2.density';
  function lsGet(key, fallback) {
    try {
      return global.localStorage.getItem(key) || fallback;
    } catch (_error) {
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      global.localStorage.setItem(key, value);
    } catch (_error) {
      /* private mode */
    }
  }
  var v3Theme = lsGet(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light';
  var v3Density = lsGet(DENSITY_KEY, 'comfortable') === 'compact' ? 'compact' : 'comfortable';
  var selected = {}; // v3: multi-select set (thread-id → true)
  var qrDraft = {}; // v3: snabbsvar-utkast per tråd-id (överlever om-rendering)
  var docKeydownBound = false; // ⌘K-lyssnaren binds på doc — bara EN gång

  // Temat är app-brett: sätts på <html> (så v8-kalendern re-temas) + på roten.
  function applyTheme() {
    try {
      doc.documentElement.setAttribute('data-theme', v3Theme);
    } catch (_error) {
      /* ignore */
    }
    if (root) root.dataset.theme = v3Theme;
  }
  var activeCtxTab = 'oversikt'; // v3: oversikt | historik | ekonomi
  var cmdkOpen = false;
  var cmdkQuery = '';
  var cmdkActive = 0;

  function selectedIds() {
    return Object.keys(selected).filter(function (k) {
      return selected[k];
    });
  }
  function selectedCount() {
    return selectedIds().length;
  }

  // ⌘K ska bara kapas när v2-konversationsvyn faktiskt är aktiv.
  function conversationsActive() {
    try {
      if (!root || !doc.body.contains(root)) return false;
      var canvas = doc.querySelector('.preview-canvas');
      var sv = canvas ? canvas.getAttribute('data-app-shell-view') : null;
      return !sv || sv === 'conversations';
    } catch (_error) {
      return false;
    }
  }

  // v3: SLA-status från riktiga signaler (eller härledd).
  function slaOf(thread) {
    var raw = text(thread.slaStatus).toLowerCase();
    if (raw === 'overdue' || raw === 'breach' || raw === 'förfallen') {
      return { tone: 'overdue', label: 'SLA' };
    }
    if (raw === 'soon' || raw === 'risk' || raw === 'warning')
      return { tone: 'soon', label: 'SLA' };
    if (raw === 'ok' || raw === 'green') return null;
    // Härledning: kräver-åtgärd + saknad/uppföljning → soon; bara åtgärd → ingen.
    var pending =
      text(thread.followUpLabel) || text(thread.missingLabel) || text(thread.waitingLabel);
    if (pending && isUnread(thread)) return { tone: 'soon', label: 'SLA' };
    return null;
  }

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

  function threadConversationKey(thread) {
    var safe = thread || {};
    return (
      text(safe.id) ||
      text(safe.conversationKey) ||
      text(safe.conversationId) ||
      text(safe.mailboxConversationId)
    );
  }

  function uniqueConversationKeys(threads) {
    var seen = {};
    var keys = [];
    (threads || []).forEach(function (thread) {
      var key = threadConversationKey(thread);
      if (!key || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    });
    return keys;
  }

  function paritySnapshot(ctx) {
    var safe = ctx || {};
    return {
      scopedConversationKeys: uniqueConversationKeys(safe.allThreads),
      laneConversationKeys: uniqueConversationKeys(safe.laneThreads),
      selectedConversationKey: threadConversationKey(safe.selected),
    };
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

  function isSentThread(thread) {
    var raw = thread && typeof thread.raw === 'object' ? thread.raw : {};
    var lastAction = text(raw.lastActionTakenLabel).toLowerCase();
    var lastOutboundAt = parseDate(raw.lastOutboundAt || thread.lastOutboundAt);
    var lastInboundAt = parseDate(raw.lastInboundAt || thread.lastInboundAt);
    var historyContainsSent = (thread.historyEvents || []).slice(0, 4).some(function (event) {
      var haystack = (text(event.title) + ' ' + text(event.description)).toLowerCase();
      return haystack.indexOf('e-post skickat') >= 0 || haystack.indexOf('email sent') >= 0;
    });
    return (
      lastAction.indexOf('svar skickat') >= 0 ||
      lastAction.indexOf('reply sent') >= 0 ||
      historyContainsSent ||
      (lastOutboundAt && (!lastInboundAt || lastOutboundAt.getTime() >= lastInboundAt.getTime()))
    );
  }

  function mailboxTone(mailbox) {
    var haystack = (text(mailbox.id) + ' ' + text(mailbox.email) + ' ' + text(mailbox.label)).toLowerCase();
    if (haystack.indexOf('fazli') >= 0) return 'fazli';
    if (haystack.indexOf('egzona') >= 0) return 'egzona';
    if (haystack.indexOf('contact') >= 0) return 'contact';
    return 'info';
  }

  function smartLabel(thread) {
    var raw = thread && typeof thread.raw === 'object' ? thread.raw : {};
    var value = text(thread.intentLabel || thread.intent || raw.intent).toLowerCase();
    var labels = {
      booking: 'Bokning',
      booking_request: 'Bokning',
      pricing: 'Prisfråga',
      price: 'Prisfråga',
      cancellation: 'Avbokning',
      cancel: 'Avbokning',
      complaint: 'Klagomål',
      follow_up: 'Uppföljning',
      followup: 'Uppföljning',
    };
    if (labels[value]) return labels[value];
    if (thread.followUpLabel || thread.waitingLabel) return 'Uppföljning';
    return '';
  }

  function tagsFor(thread) {
    var tags = [];
    if (isUnread(thread)) tags.push({ kind: 'urgent', label: 'OLÄST' });
    if (isVip(thread)) tags.push({ kind: 'vip', label: 'VIP' });
    if (isBooking(thread)) tags.push({ kind: 'booking', label: 'Bokning' });
    var label = smartLabel(thread);
    if (label && !tags.some(function (tag) { return tag.label === label; })) {
      tags.push({ kind: 'smart', label: label });
    }
    return tags;
  }

  // ── Meddelandeström (hydrerad av selectRuntimeThread → thread.messages) ──
  var WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  var STAFF_BG = 'linear-gradient(180deg,#c5d8a8,#92b86e)';

  function messageList(thread) {
    // Föredra FULL hydrerad historik framför preview-listan: thread.messages
    // fylls av buildPreviewMessages som hårt-cappar till 8, medan hela historiken
    // ligger på thread.threadDocument.messages efter hydrering. Returneras
    // thread.messages först skulle strömmen/räknaren aldrig visa fler än 8
    // (Bugbot: stream capped at eight messages).
    if (
      thread.threadDocument &&
      Array.isArray(thread.threadDocument.messages) &&
      thread.threadDocument.messages.length
    ) {
      return thread.threadDocument.messages;
    }
    if (Array.isArray(thread.messages)) return thread.messages;
    return [];
  }

  function isIncoming(message) {
    var role = text(message.role).toLowerCase();
    if (role === 'customer') return true;
    if (role === 'staff' || role === 'provider_notice') return false;
    return text(message.direction).toLowerCase() === 'inbound';
  }

  function messageBody(message) {
    var safeMessage = message && typeof message === 'object' ? message : {};
    return (
      text(safeMessage.primaryBody && safeMessage.primaryBody.text) ||
      text(safeMessage.presentation && safeMessage.presentation.conversationText) ||
      text(safeMessage.conversationBody) ||
      text(safeMessage.body) ||
      text(safeMessage.preview) ||
      text(safeMessage.bodyPreview)
    );
  }

  function messageBodyHtml(message) {
    var safeMessage = message && typeof message === 'object' ? message : {};
    // Äldre CCO-poster kan ha explicita null-värden i stället för ett
    // mailDocument/primaryBody-objekt. De ska rendera sin text-fallback,
    // aldrig fälla hela v2-skalet.
    var mailDocument = safeMessage.mailDocument && typeof safeMessage.mailDocument === 'object'
      ? safeMessage.mailDocument
      : {};
    var primaryBody = safeMessage.primaryBody && typeof safeMessage.primaryBody === 'object'
      ? safeMessage.primaryBody
      : {};
    var presentation = safeMessage.presentation && typeof safeMessage.presentation === 'object'
      ? safeMessage.presentation
      : {};
    return (
      text(primaryBody.html) ||
      text(presentation.conversationHtml) ||
      text(mailDocument.primaryBodyHtml) ||
      text(mailDocument.bodyHtml) ||
      text(safeMessage.bodyHtml) ||
      text(safeMessage.body_html) ||
      text(safeMessage.html)
    );
  }

  function isLocalMailAssetUrl(value) {
    try {
      var parsed = new global.URL(text(value), global.location && global.location.href);
      return (
        parsed.origin === global.location.origin &&
        parsed.pathname === '/api/v1/cco/runtime/mail-asset/content'
      );
    } catch (_error) {
      return false;
    }
  }

  function allowedMailUrl(value, image) {
    var raw = text(value);
    if (!raw) return false;
    if (isLocalMailAssetUrl(raw)) return true;
    if (/^https:\/\//i.test(raw)) return true;
    return image === true && /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;[^,]*)?,/i.test(raw);
  }

  function removeOutlookSenderNotice(mailDoc) {
    if (!mailDoc || !mailDoc.body) return;
    var links = mailDoc.body.querySelectorAll('a[href]');
    Array.prototype.forEach.call(links, function (link) {
      var href = text(link.getAttribute('href'));
      if (!/^https?:\/\/aka\.ms\/LearnAboutSenderIdentification\/?(?:[?#].*)?$/i.test(href)) return;
      var row = link.closest && link.closest('tr');
      if (row) {
        row.remove();
        return;
      }
      var notice = link.closest && link.closest('p, div, td');
      if (/^(?:Du\s+f[åa]r\s+inte\s+e-post\s+ofta\s+från|You\s+don't\s+often\s+get\s+email\s+from)\b/i.test(text(notice && notice.textContent))) {
        notice.remove();
      }
    });
  }

  function sanitizeMailHtmlForDisplay(html) {
    var source = text(html);
    var Parser = global.DOMParser;
    if (!source || typeof Parser !== 'function') return '';
    var mailDoc;
    try {
      // Wrappa fragmentet uttryckligt. Riktiga browser-DOMParser gör detta
      // implicit, medan vår lätta DOM-smoke annars kan placera ett fragment
      // utanför body och missa samma säkra renderingsväg.
      mailDoc = new Parser().parseFromString('<!doctype html><html><body>' + source + '</body></html>', 'text/html');
    } catch (_error) {
      return '';
    }
    if (!mailDoc || !mailDoc.body) return '';
    removeOutlookSenderNotice(mailDoc);
    Array.prototype.forEach.call(
      mailDoc.querySelectorAll('script,style,iframe,object,embed,form,meta,link,base,input,button'),
      function (node) { node.remove(); }
    );
    var missingInline = 0;
    Array.prototype.forEach.call(mailDoc.body.querySelectorAll('*'), function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attr) {
        var name = text(attr.name).toLowerCase();
        var value = attr.value || '';
        if (name.indexOf('on') === 0 || name === 'srcset' || name === 'formaction') {
          node.removeAttribute(attr.name);
        } else if (name === 'href' && !allowedMailUrl(value, false)) {
          node.removeAttribute(attr.name);
        } else if (name === 'src') {
          if (/^cid:/i.test(value) || /^about:blank(?:$|[?#])/i.test(value)) {
            node.remove();
            missingInline += 1;
          } else if (!allowedMailUrl(value, true)) {
            node.removeAttribute(attr.name);
          } else if (isLocalMailAssetUrl(value)) {
            node.setAttribute('data-v2-mail-asset-src', value);
            node.removeAttribute(attr.name);
          }
        }
      });
    });
    Array.prototype.forEach.call(mailDoc.body.querySelectorAll('a[href]'), function (link) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    if (missingInline) {
      var note = mailDoc.createElement('p');
      note.className = 'mail-inline-asset-missing';
      note.textContent = missingInline === 1
        ? 'En inlinebild saknas i det här äldre mailet.'
        : missingInline + ' inlinebilder saknas i det här äldre mailet.';
      mailDoc.body.appendChild(note);
    }
    return mailDoc.body.innerHTML;
  }

  function attachmentCandidates(message) {
    var safeMessage = message && typeof message === 'object' ? message : {};
    var mailDocument = safeMessage.mailDocument && typeof safeMessage.mailDocument === 'object'
      ? safeMessage.mailDocument
      : {};
    var candidates = []
      .concat(Array.isArray(safeMessage.attachments) ? safeMessage.attachments : [])
      .concat(Array.isArray(mailDocument.attachments) ? mailDocument.attachments : [])
      .concat(Array.isArray(mailDocument.inlineAssets) ? mailDocument.inlineAssets : []);
    var seen = {};
    return candidates.filter(function (attachment) {
      var safe = attachment && typeof attachment === 'object' ? attachment : {};
      var key = text(safe.attachmentId || safe.id || safe.assetId || safe.contentId || safe.name).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function attachmentName(attachment) {
    return text(attachment && (attachment.name || attachment.filename || attachment.fileName)) || 'Bilaga';
  }

  function attachmentType(attachment) {
    return text(attachment && (attachment.contentType || attachment.mimeType)).toLowerCase();
  }

  function attachmentIsImage(attachment) {
    return /^image\//i.test(attachmentType(attachment)) || /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(attachmentName(attachment));
  }

  function attachmentUrl(attachment, message) {
    var safe = attachment && typeof attachment === 'object' ? attachment : {};
    var direct = text(safe.inlineUrl || safe.openUrl || safe.downloadUrl || safe.url || safe.href);
    if (direct) return direct;
    var attachmentId = text(safe.attachmentId || safe.id || safe.assetId);
    var mailboxId = text(message && message.mailboxId);
    var messageId = text(message && (message.graphMessageId || message.messageId));
    if (!attachmentId || !mailboxId || !messageId) return '';
    return '/api/v1/cco/runtime/mail-asset/content?mailboxId=' +
      encodeURIComponent(mailboxId) + '&messageId=' + encodeURIComponent(messageId) +
      '&attachmentId=' + encodeURIComponent(attachmentId) + '&mode=open&fileName=' +
      encodeURIComponent(attachmentName(safe));
  }

  function attachmentIsInline(attachment, message, html) {
    var safe = attachment && typeof attachment === 'object' ? attachment : {};
    if (safe.isInline === true || safe.inline === true || text(safe.disposition).toLowerCase() === 'inline') return true;
    var contentId = text(safe.contentId).replace(/^<|>$/g, '');
    return Boolean(contentId && text(html).toLowerCase().indexOf('cid:' + contentId.toLowerCase()) >= 0);
  }

  function renderMessageAttachments(message) {
    var html = messageBodyHtml(message);
    var attachments = attachmentCandidates(message).filter(function (attachment) {
      return !attachmentIsInline(attachment, message, html);
    });
    if (!attachments.length) return '';
    return '<div class="v2-msg-attachments" aria-label="Bilagor">' + attachments.map(function (attachment, index) {
      var url = attachmentUrl(attachment, message);
      var type = attachmentType(attachment);
      var size = Number(attachment && attachment.size) || 0;
      var meta = [type, size ? Math.max(1, Math.round(size / 1024)) + ' kB' : ''].filter(Boolean).join(' · ');
      return '<button type="button" class="v2-msg-attachment" data-v2-attachment-index="' + index +
        '" data-v2-message-id="' + esc(text(message.messageId || message.graphMessageId)) +
        '" title="' + esc(meta || attachmentName(attachment)) + '"' + (url ? '' : ' disabled') + '>' +
        '<span aria-hidden="true">' + (attachmentIsImage(attachment) ? '🖼' : '📎') + '</span><span>' +
        esc(attachmentName(attachment)) + '</span></button>';
    }).join('') + '</div>';
  }

  function renderRichMessageBubble(message) {
    var html = sanitizeMailHtmlForDisplay(messageBodyHtml(message));
    if (!html) {
      return '<div class="msg-bubble">' + esc(messageBody(message)).replace(/\n/g, '<br>') + '</div>' + renderMessageAttachments(message);
    }
    var frameDocument = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
      '<style>body{margin:0;padding:10px 12px;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2b251f;background:#fffdfb;word-break:break-word}img{max-width:100%;height:auto}.mail-inline-asset-missing{margin:8px 0 0;color:#766f65;font-size:11px;font-style:italic}</style>' +
      '</head><body>' + html + '</body></html>';
    return '<div class="msg-bubble msg-bubble--html"><iframe class="v2-msg-html-frame" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" referrerpolicy="no-referrer" loading="lazy" srcdoc="' +
      esc(frameDocument) + '" title="Mailinnehåll"></iframe></div>' + renderMessageAttachments(message);
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
    pushIf(
      rows,
      'Tråden',
      text(thread.threadSummaryLabel) || (msgs.length ? msgs.length + ' meddelanden' : '')
    );
    rows.push({ dt: 'Källa', ddHtml: '<span class="ctx-dot"></span>' + esc(sourceLabel(thread)) });
    pushIf(
      rows,
      'Bokning',
      thread.bookingLabel || thread.waitingLabel,
      'var(--cco-status-warning)'
    );
    pushIf(
      rows,
      'Saknas',
      thread.missingLabel || thread.followUpLabel,
      'var(--cco-status-warning)'
    );
    pushIf(
      rows,
      'Senast',
      thread.lastTreatmentLabel || thread.lastActivityLabel || whenLabel(thread)
    );
    pushIf(rows, 'Intäkt', thread.revenueLabel);
    // Graciös fallback om de rikare fälten saknas (produktion utan enrichment).
    if (rows.length <= 3) {
      pushIf(rows, 'Status', thread.statusLabel);
      pushIf(rows, 'Risk', thread.riskLabel, 'var(--cco-status-danger)');
      pushIf(rows, 'Ägare', thread.ownerLabel || thread.displayOwnerLabel);
    }
    return rows;
  }

  function pushIf(rows, dt, value, color) {
    var v = text(value);
    if (v) rows.push({ dt: dt, dd: v, color: color });
  }

  // Ctx-meta: "VIP · PRP-kur 4/6 · 92% engagement" (faller tillbaka på källa).
  function ctxMetaLine(thread) {
    var parts = [thread.riskLabel, thread.lifecycleLabel, thread.engagementLabel]
      .map(text)
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : sourceLabel(thread);
  }

  function ctxAiBox(thread) {
    var body = text(thread.aiRecommendation);
    if (!body) return '';
    return '<div class="ctx-ai-box"><div class="ctx-ai-kicker">★ AI</div>' + esc(body) + '</div>';
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
        '" data-v2-message-id="' + esc(text(message.messageId || message.graphMessageId)) + '">' +
        av +
        '<div>' + renderRichMessageBubble(message) + '<div class="msg-meta">' +
        read +
        esc(author) +
        (messageWhen(message) ? ' · ' + esc(messageWhen(message)) : '') +
        '</div></div></div>';
    });
    return html + aiSuggestBlock(thread);
  }

  var mailAssetUrlCache = {};
  var mailAssetObjectUrls = [];

  function releaseMailAssetUrls() {
    mailAssetObjectUrls.forEach(function (url) {
      try { global.URL.revokeObjectURL(url); } catch (_error) { /* best-effort */ }
    });
    mailAssetObjectUrls = [];
    mailAssetUrlCache = {};
  }

  function resolveMailAssetUrl(url) {
    var source = text(url);
    if (!source || !boundCtx || !boundCtx.handlers || typeof boundCtx.handlers.resolveMailAssetUrl !== 'function') {
      return Promise.reject(new Error('Bilagan kan inte öppnas i den här vyn.'));
    }
    if (mailAssetUrlCache[source]) return mailAssetUrlCache[source];
    var pending = Promise.resolve(boundCtx.handlers.resolveMailAssetUrl(source)).then(function (blobUrl) {
      var resolved = text(blobUrl);
      if (!resolved) throw new Error('Bilagan kunde inte läsas.');
      mailAssetObjectUrls.push(resolved);
      mailAssetUrlCache[source] = Promise.resolve(resolved);
      return resolved;
    }).catch(function (error) {
      delete mailAssetUrlCache[source];
      throw error;
    });
    mailAssetUrlCache[source] = pending;
    return pending;
  }

  function resizeRichMailFrame(frame) {
    try {
      var frameDoc = frame.contentDocument;
      var height = Math.max(
        Number(frameDoc && frameDoc.documentElement && frameDoc.documentElement.scrollHeight) || 0,
        Number(frameDoc && frameDoc.body && frameDoc.body.scrollHeight) || 0
      );
      if (height > 0) frame.style.height = Math.min(900, Math.max(120, height + 8)) + 'px';
    } catch (_error) {
      // Ett isolerat frame behåller sin CSS-höjd om browsern inte tillåter mätning.
    }
  }

  function hydrateRichMailFrames() {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.v2-msg-html-frame'), function (frame) {
      var hydrate = function () {
        var frameDoc = frame.contentDocument;
        if (!frameDoc) return;
        Array.prototype.forEach.call(frameDoc.querySelectorAll('[data-v2-mail-asset-src]'), function (element) {
          var source = text(element.getAttribute('data-v2-mail-asset-src'));
          if (!source || element.getAttribute('data-v2-mail-asset-ready') === 'true') return;
          element.setAttribute('data-v2-mail-asset-ready', 'true');
          resolveMailAssetUrl(source).then(function (blobUrl) {
            element.setAttribute('src', blobUrl);
            element.removeAttribute('data-v2-mail-asset-src');
            resizeRichMailFrame(frame);
          }).catch(function () {
            element.replaceWith(frameDoc.createTextNode('Bild kunde inte laddas.'));
            resizeRichMailFrame(frame);
          });
        });
        resizeRichMailFrame(frame);
      };
      frame.addEventListener('load', hydrate, { once: true });
      hydrate();
    });
  }

  function attachmentForMessage(message, index) {
    var html = messageBodyHtml(message);
    return attachmentCandidates(message).filter(function (attachment) {
      return !attachmentIsInline(attachment, message, html);
    })[index] || null;
  }

  function closeAttachmentPreview() {
    var backdrop = root && root.querySelector('[data-v2-attachment-preview]');
    if (backdrop) backdrop.remove();
  }

  function openAttachmentPreview(message, attachment) {
    if (!attachment || !root) return;
    var url = attachmentUrl(attachment, message);
    if (!url) return;
    closeAttachmentPreview();
    var name = attachmentName(attachment);
    var image = attachmentIsImage(attachment);
    var backdrop = doc.createElement('div');
    backdrop.setAttribute('data-v2-attachment-preview', '');
    backdrop.className = 'v2-attachment-backdrop';
    backdrop.innerHTML = '<section class="v2-attachment-dialog" role="dialog" aria-modal="true" aria-label="Förhandsvisning av ' + esc(name) + '">' +
      '<header><strong>' + esc(name) + '</strong><button type="button" data-v2-attachment-close aria-label="Stäng">×</button></header>' +
      '<div class="v2-attachment-stage" data-v2-attachment-stage>Laddar bilagan…</div>' +
      '<footer><a data-v2-attachment-download href="#" download="' + esc(name) + '">Ladda ner</a></footer></section>';
    root.appendChild(backdrop);
    resolveMailAssetUrl(url).then(function (blobUrl) {
      var stage = backdrop.querySelector('[data-v2-attachment-stage]');
      var download = backdrop.querySelector('[data-v2-attachment-download]');
      if (download) download.setAttribute('href', blobUrl);
      if (!stage) return;
      if (image) {
        stage.innerHTML = '<img src="' + esc(blobUrl) + '" alt="' + esc(name) + '">';
      } else {
        stage.innerHTML = '<p>Förhandsvisning finns för bilder i denna vy.</p><p>Öppna eller ladda ner originalfilen.</p>';
      }
    }).catch(function (error) {
      var stage = backdrop.querySelector('[data-v2-attachment-stage]');
      if (stage) stage.textContent = (error && error.message) || 'Bilagan kunde inte laddas.';
    });
  }

  // AI · Föreslaget svar — renderas i strömmen när tråden har ett AI-förslag.
  function aiSuggestBlock(thread) {
    var body = text(thread.aiSuggestion);
    if (!body) return '';
    return (
      '<div class="ai-suggest"><div class="ai-suggest-kicker">★ AI · Föreslaget svar</div>' +
      '<div class="ai-suggest-body">' +
      esc(body) +
      '</div>' +
      '<div class="ai-suggest-actions">' +
      '<button class="quick-pill quick-pill--ai" type="button" data-v2-action="studio">★ Visa förslag</button>' +
      '<button class="quick-pill" type="button" data-v2-action="studio">↻ Generera om</button>' +
      '<button class="quick-pill quick-pill--success" type="button" data-v2-action="studio">✓ Skicka direkt</button>' +
      '<button class="quick-pill" type="button" data-v2-action="studio">✎ Redigera först</button>' +
      '</div></div>'
    );
  }

  function ensureRoot() {
    if (root && doc.body.contains(root)) return root;
    root = doc.getElementById(ROOT_ID);
    if (root) return root;
    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML =
      '<div class="v3-toolbar" data-v3-toolbar></div>' +
      '<div class="app-grid">' +
      '<aside class="lane-sidebar" data-v2-lanes role="navigation" aria-label="Köfält"></aside>' +
      '<aside class="inbox-shell"><div class="inbox-kicker">Inkorg</div>' +
      '<h2 class="inbox-h2" data-v2-inbox-h2></h2>' +
      '<div class="v2-mailbox-controls" data-v2-mailboxes></div>' +
      '<div class="v2-folder-controls" data-v2-folders></div>' +
      '<label class="v2-search"><span aria-hidden="true">⌕</span><input data-v2-search type="search" placeholder="Sök i konversationer…" /></label>' +
      '<div class="v2-action-feedback" data-v2-action-feedback aria-live="polite"></div>' +
      '<div class="lane-chips" data-v2-lane-chips></div>' +
      '<div class="inbox-tabs" data-v2-tabs></div>' +
      '<div class="v3-bulkbar" data-v3-bulkbar></div>' +
      '<div class="inbox-list" data-v2-inbox></div></aside>' +
      '<section class="thread-shell" data-v2-thread></section>' +
      '<aside class="ctx-shell" data-v2-ctx></aside>' +
      '</div>' +
      '<div data-v3-cmdk></div>';
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

  // Samma mailbox-, mapp-, sok- och segmenturval for bade listan och
  // flikbadgarna. Flikfiltret laggs medvetet separat i visibleThreads.
  function scopedThreads(ctx) {
    var query = text(inboxQuery).toLowerCase();
    var list = (ctx.laneThreads || [])
      .slice()
      .filter(function (thread) {
        // Default-vyn "Inkorg" visar hela den aktiva scoped kön (paritet med
        // legacy) — den får INTE gömma en tråd bara för att kliniken svarade
        // sist eller för att inbound-tiden saknas. "Skickat" är ett icke-
        // uteslutande filter för delmängden isSentThread.
        return activeFolder === 'sent' ? isSentThread(thread) : true;
      })
      .filter(function (thread) {
        if (!query) return true;
        var raw = thread && typeof thread.raw === 'object' ? thread.raw : {};
        var haystack = [
          threadName(thread),
          thread.subject,
          thread.preview,
          thread.mailboxBadge,
          thread.mailboxId,
          thread.intentLabel,
          thread.intent,
          raw.intent,
        ]
          .map(text)
          .join(' ')
          .toLowerCase();
        return haystack.indexOf(query) >= 0;
      })
      .filter(segmentMatch);
    return list;
  }

  function visibleThreads(ctx) {
    var list = scopedThreads(ctx);
    if (activeTab === 'olasta') return list.filter(isUnread);
    if (activeTab === 'bokning') return list.filter(isBooking);
    if (activeTab === 'vip') return list.filter(isVip);
    return list;
  }

  function renderTabs(ctx) {
    var el = root.querySelector('[data-v2-tabs]');
    var h2 = root.querySelector('[data-v2-inbox-h2]');
    if (!el) return;
    // Flik-räknarna ska visa hela det scoped urvalet, inte en delmängd skapad
    // av den flik som just är aktiv.
    var lane = scopedThreads(ctx);
    var counts = {
      alla: lane.length,
      olasta: lane.filter(isUnread).length,
      bokning: lane.filter(isBooking).length,
      vip: lane.filter(isVip).length,
    };
    if (h2) {
      h2.textContent = counts.olasta + ' olästa · ' + lane.length + ' totalt';
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

  function renderMailboxControls(ctx) {
    var el = root.querySelector('[data-v2-mailboxes]');
    if (!el) return;
    var selectedMailboxIds = (ctx.selectedMailboxIds || []).map(text).filter(Boolean);
    var selectedSet = {};
    selectedMailboxIds.forEach(function (id) { selectedSet[id] = true; });
    var maxReached = selectedMailboxIds.length >= 2;
    var mailboxes = ctx.mailboxes || [];
    el.innerHTML =
      '<div class="v2-control-kicker">Brevlådor</div>' +
      '<div class="v2-mailbox-list">' +
      mailboxes
        .map(function (mailbox) {
          var isSelected = Boolean(selectedSet[mailbox.id]);
          var disabled = !isSelected && maxReached ? ' disabled aria-disabled="true"' : '';
          return (
            '<button class="v2-mailbox-chip v2-mailbox-chip--' + mailboxTone(mailbox) +
            (isSelected ? ' active' : '') +
            '" data-v2-mailbox="' + esc(mailbox.id) + '" type="button"' + disabled + '>' +
            '<span class="v2-mailbox-dot" aria-hidden="true"></span>' +
            esc(mailbox.label || mailbox.email || mailbox.id) +
            '</button>'
          );
        })
        .join('') +
      '</div>';
  }

  function renderFolderControls() {
    var el = root.querySelector('[data-v2-folders]');
    if (!el) return;
    el.innerHTML =
      '<button class="v2-folder' + (activeFolder === 'inbox' ? ' active' : '') +
      '" data-v2-folder="inbox" type="button">Inkorg</button>' +
      '<button class="v2-folder' + (activeFolder === 'sent' ? ' active' : '') +
      '" data-v2-folder="sent" type="button">Skickat</button>';
  }

  function renderActionFeedback(ctx) {
    var el = root.querySelector('[data-v2-action-feedback]');
    if (!el) return;
    var feedback = ctx && ctx.actionFeedback;
    var message = text(feedback && feedback.message);
    if (!message) {
      el.innerHTML = '';
      el.hidden = true;
      return;
    }
    var tone = text(feedback && feedback.tone).toLowerCase() === 'error' ? 'error' : 'success';
    el.hidden = false;
    el.innerHTML = '<span class="v2-action-feedback--' + tone + '">' + esc(message) + '</span>';
  }

  function renderInbox(ctx) {
    var el = root.querySelector('[data-v2-inbox]');
    if (!el) return;
    var list = visibleThreads(ctx);
    if (!list.length) {
      if (ctx.loading) {
        el.innerHTML = new Array(6).fill('<div class="v3-skel v3-skel-row"></div>').join('');
        return;
      }
      if (ctx.authRequired) {
        el.innerHTML = '<div class="inbox-empty">Logga in igen i admin för att läsa CCO-inkorgen.</div>';
        return;
      }
      if (text(ctx.error)) {
        el.innerHTML = '<div class="inbox-empty">' + esc(ctx.error) + '</div>';
        return;
      }
      el.innerHTML = '<div class="inbox-empty">Inga konversationer i denna vy.</div>';
      return;
    }
    var selectedId = ctx.selected ? threadConversationKey(ctx.selected) : '';
    el.innerHTML = list
      .map(function (thread) {
        // V2 använder exakt samma canonical conversation key som legacy-state
        // (id när den finns, annars den redan normaliserade fallback-nyckeln).
        var id = threadConversationKey(thread);
        var active = id && id === selectedId ? ' active' : '';
        var unread = isUnread(thread) ? ' thread-unread' : '';
        var isSel = selected[id] ? ' is-selected' : '';
        var tags = tagsFor(thread);
        var sla = slaOf(thread);
        return (
          '<div class="thread' +
          active +
          unread +
          isSel +
          '" data-source="' +
          esc(sourceKey(thread)) +
          '" data-thread-id="' +
          esc(id) +
          '" role="button" tabindex="0">' +
          '<span class="thread-select" data-thread-select="' +
          esc(id) +
          '" role="checkbox" aria-checked="' +
          (selected[id] ? 'true' : 'false') +
          '" title="Markera">' +
          (selected[id] ? '✓' : '') +
          '</span>' +
          (sla
            ? '<span class="thread-sla thread-sla--' + sla.tone + '">' + esc(sla.label) + '</span>'
            : '') +
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
    var handoffAvailable = thread.v2Handoff && thread.v2Handoff.available === true;
    var handoffReason =
      text(thread.v2Handoff && thread.v2Handoff.reason) ||
      'Kundkopplingen är oklar eller saknas. Öppna först Granskning.';
    var handoffDisabled = handoffAvailable ? '' : ' disabled aria-disabled="true" title="' + esc(handoffReason) + '"';
    // Testbarhetsmarkörer kommer endast från appens redan autentiserade,
    // valda trådkontext. De ändrar inte interaktionen eller handoff-logiken.
    var testability = thread.v2Testability && typeof thread.v2Testability === 'object'
      ? thread.v2Testability
      : {};
    var noteConversationId = text(testability.noteConversationId);
    var bookingPatientId = handoffAvailable ? text(testability.bookingPatientId) : '';
    var noteContextAttr = noteConversationId
      ? ' data-note-conversation-id="' + esc(noteConversationId) + '"'
      : '';
    var bookingContextAttr = bookingPatientId
      ? ' data-booking-context-patient-id="' + esc(bookingPatientId) + '"'
      : '';

    el.innerHTML =
      '<header class="thread-header">' +
      '<button class="thread-back" type="button" data-v2-back aria-label="Tillbaka till inkorgen">‹ Inkorg</button>' +
      '<div class="thread-header-main">' +
      '<div class="thread-header-kicker">' +
      '<span class="thread-header-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">' +
      '<path d="M4 4h16v16H4z" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M4 4l8 8 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      (msgCount ? 'Konversation · ' + msgCount + ' meddelanden' : 'Konversation') +
      '</div>' +
      '<h2>' +
      esc(
        text(thread.subject)
          ? text(thread.subject) + ' · ' + threadName(thread)
          : threadName(thread)
      ) +
      '</h2></div>' +
      '<div class="thread-header-actions">' +
      '<button class="nav-btn thread-ctx-toggle" type="button" data-v2-ctx-toggle aria-label="Visa kundkontext">ⓘ Kund</button>' +
      '<button class="nav-btn" type="button" data-v2-action="note"' + noteContextAttr + '>✎ Anteckna</button>' +
      '<button class="nav-btn nav-btn--ai" type="button" data-v2-action="studio">★ Svarstudio</button>' +
      '</div></header>' +
      '<div class="thread-status-bar">' +
      pills +
      '</div>' +
      '<div class="messages">' +
      messages +
      '</div>' +
      '<div class="v3-quickreply">' +
      '<textarea data-v3-qr-body placeholder="Snabbsvar — sparas som utkast (skicka kräver owner)…">' +
      esc(qrDraft[threadConversationKey(thread)] || '') +
      '</textarea>' +
      '<div class="v3-quickreply-row">' +
      '<button class="v3-qr-btn v3-qr-btn--primary" type="button" data-v3-qr-save>Spara utkast</button>' +
      '<button class="v3-qr-btn" type="button" data-v3-qr-studio>★ Svarstudio</button>' +
      '<span class="v3-qr-spacer"></span>' +
      '<span class="v3-qr-hint">⌘K för kommandon</span>' +
      '</div></div>' +
      '<div class="thread-bottom-actions" role="toolbar" aria-label="Konversations-actions">' +
      '<button class="action-btn action-btn--studio" type="button" data-v2-action="studio"><span class="action-ico">✱</span><span>Svarstudio</span></button>' +
      '<button class="action-btn action-btn--booking" type="button" data-v2-action="booking"' + bookingContextAttr + handoffDisabled + '><span class="action-ico">📅</span><span>Bokningsyta</span></button>' +
      '<button class="action-btn action-btn--note" type="button" data-v2-action="note"' + noteContextAttr + '><span class="action-ico">📄</span><span>Smart anteckning</span></button>' +
      '<button class="action-btn action-btn--calendar" type="button" data-v2-action="calendar"' + handoffDisabled + '><span class="action-ico">📆</span><span>Kalender</span></button>' +
      '<button class="action-btn" type="button" data-v2-action="handled"><span class="action-ico">✓</span><span>Markera klar</span></button>' +
      '<button class="action-btn" type="button" data-v2-action="reply_later"><span class="action-ico">⌛</span><span>Senare</span></button>' +
      '<button class="action-btn" type="button" data-v2-action="reopen"><span class="action-ico">↩</span><span>Återöppna</span></button>' +
      '</div>';
  }

  function ctxTabBody(thread) {
    if (activeCtxTab === 'historik') {
      var msgs = messageList(thread);
      var lines = [];
      if (msgs.length) lines.push(msgs.length + ' meddelanden i tråden');
      if (text(thread.lastTreatmentLabel))
        lines.push('Senaste: ' + text(thread.lastTreatmentLabel));
      if (text(thread.lifecycleLabel)) lines.push('Livscykel: ' + text(thread.lifecycleLabel));
      if (text(thread.lastActivityLabel))
        lines.push('Aktivitet: ' + text(thread.lastActivityLabel));
      return (
        '<div class="wb-section" style="padding-top:6px">' +
        (lines.length
          ? lines
              .map(function (l) {
                return '<p class="wb-section-sub">' + esc(l) + '</p>';
              })
              .join('')
          : '<p class="wb-section-sub">Ingen historik tillgänglig.</p>') +
        '</div>'
      );
    }
    if (activeCtxTab === 'ekonomi') {
      var rows = [];
      if (text(thread.revenueLabel)) rows.push(['Intäkt', text(thread.revenueLabel)]);
      if (text(thread.bookingLabel)) rows.push(['Bokning', text(thread.bookingLabel)]);
      if (text(thread.lastTreatmentLabel)) rows.push(['Senaste', text(thread.lastTreatmentLabel)]);
      return (
        '<dl class="ctx-grid" style="padding-top:6px">' +
        (rows.length
          ? rows
              .map(function (r) {
                return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
              })
              .join('')
          : '<dd style="grid-column:1/-1;color:var(--cco-text-tertiary)">Ingen ekonomidata.</dd>') +
        '</dl>'
      );
    }
    // oversikt (default)
    var gridRows = signalRows(thread)
      .map(function (row) {
        var style = row.color ? ' style="color:' + row.color + ';font-weight:700"' : '';
        var dd = row.ddHtml ? row.ddHtml : esc(row.dd);
        return '<dt>' + esc(row.dt) + '</dt><dd' + style + '>' + dd + '</dd>';
      })
      .join('');
    var aiAction = text(thread.missingLabel) || text(thread.followUpLabel);
    var handoffAvailable = thread.v2Handoff && thread.v2Handoff.available === true;
    var handoffReason =
      text(thread.v2Handoff && thread.v2Handoff.reason) ||
      'Kundkopplingen är oklar eller saknas. Öppna först Granskning.';
    var handoffDisabled = handoffAvailable ? '' : ' disabled aria-disabled="true" title="' + esc(handoffReason) + '"';
    return (
      '<dl class="ctx-grid" style="padding-top:6px">' +
      gridRows +
      '</dl>' +
      ctxAiBox(thread) +
      '<div class="ctx-actions">' +
      (aiAction
        ? '<button class="quick-pill quick-pill--ai quick-pill--full" type="button" data-v2-action="studio">★ AI ' +
          esc(aiAction) +
          '</button>'
        : '') +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="booking"' + handoffDisabled + '>📅 Öppna bokning</button>' +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="dossier"' + handoffDisabled + '>👤 Kunddossiér</button>' +
      '<button class="quick-pill quick-pill--success" style="flex:1" type="button" data-v2-action="handled">✓ Markera klar</button>' +
      '</div>'
    );
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
    var ctxTabs = [
      { id: 'oversikt', label: 'Översikt' },
      { id: 'historik', label: 'Historik' },
      { id: 'ekonomi', label: 'Ekonomi' },
    ];
    var tabsHtml =
      '<div class="ctx-tabs">' +
      ctxTabs
        .map(function (t) {
          return (
            '<button class="ctx-tab' +
            (t.id === activeCtxTab ? ' active' : '') +
            '" data-ctx-tab="' +
            t.id +
            '" type="button">' +
            esc(t.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>';

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
      esc(ctxMetaLine(thread)) +
      '</div></div></div>' +
      tabsHtml +
      ctxTabBody(thread);
  }

  function findThreadById(ctx, id) {
    var all = (ctx.allThreads || []).concat(ctx.laneThreads || []);
    for (var i = 0; i < all.length; i += 1) {
      if (threadConversationKey(all[i]) === text(id)) return all[i];
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
  var STUDIO_FALLBACK_SIGNATURES = [
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

  // Samma fyra deterministiska snabbsvar som legacy-Svarstudion använder.
  // De skriver bara i editorn; ingen makrokörning eller servermutation sker
  // förrän operatören uttryckligen väljer att spara utkastet.
  var STUDIO_MACROS = [
    { id: 'confirm_booking', label: 'Bekräfta bokning' },
    { id: 'suggest_times', label: 'Föreslå tider' },
    { id: 'send_pricing', label: 'Skicka prislista' },
    { id: 'ask_more_info', label: 'Be om info' },
  ];

  function studioSignatures() {
    var configured = (boundCtx && boundCtx.studioSignatures) || [];
    return configured.length ? configured : STUDIO_FALLBACK_SIGNATURES;
  }

  function signatureText(id) {
    var s = studioSignatures().filter(function (x) {
      return x.id === id;
    })[0];
    return s ? s.text : '';
  }

  function studioDefaultSignatureId(thread) {
    var configuredDefault = text(boundCtx && boundCtx.studioDefaultSignatureId);
    if (configuredDefault && studioSignatures().some(function (item) { return item.id === configuredDefault; })) {
      return configuredDefault;
    }
    var mailbox = text(thread && (thread.mailboxAddress || thread.mailboxId)).toLowerCase();
    var matching = studioSignatures().filter(function (item) {
      return text(item.senderMailboxId || item.email).toLowerCase() === mailbox;
    })[0];
    return (matching && matching.id) || (studioSignatures()[0] && studioSignatures()[0].id) || '';
  }

  function studioSenderOptions() {
    var configured = (boundCtx && boundCtx.studioSenderMailboxOptions) || [];
    return configured.filter(function (option) { return text(option && option.id); });
  }

  function studioDefaultSenderMailbox(thread) {
    var configuredDefault = text(boundCtx && boundCtx.studioDefaultSenderMailboxId);
    var mailbox = text(thread && (thread.mailboxAddress || thread.mailboxId));
    var options = studioSenderOptions();
    if (mailbox && options.some(function (option) { return text(option.id).toLowerCase() === mailbox.toLowerCase(); })) {
      return mailbox;
    }
    if (configuredDefault && options.some(function (option) { return text(option.id).toLowerCase() === configuredDefault.toLowerCase(); })) {
      return configuredDefault;
    }
    return (options[0] && text(options[0].id)) || mailbox;
  }

  function studioMacroText(templateId, thread) {
    var name = threadName(thread).split(/\s+/).filter(Boolean)[0] || '';
    var greeting = name ? 'Hej ' + name + '!' : 'Hej!';
    var topic = text(thread && thread.subject).replace(/^re:\s*/i, '').trim() || 'ditt ärende';
    var bodies = {
      confirm_booking: greeting + '\n\nTack för ditt meddelande om ' + topic + '. Vi bekräftar din bokning och återkommer med detaljerna. Hör av dig om du har några frågor.',
      suggest_times: greeting + '\n\nTack för ditt mejl gällande ' + topic + '. Vi har följande tider lediga, låt oss veta vilken som passar dig bäst:\n\n• \n• \n• ',
      send_pricing: greeting + '\n\nTack för din förfrågan om ' + topic + '. Här kommer prisinformationen du efterfrågade. Säg till om du vill boka en kostnadsfri konsultation.',
      ask_more_info: greeting + '\n\nTack för ditt meddelande om ' + topic + '. För att kunna hjälpa dig på bästa sätt behöver vi lite mer information:\n\n• \n• ',
    };
    return bodies[templateId] || greeting + '\n\nTack för ditt meddelande. Vi återkommer inom kort.';
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
    // V2 öppnar admin#cco:s GODKÄNDA Svarstudio (svarstudio-v2.html) via den
    // delade launchern — inte en egen parallell workbench. Trådkontexten matas
    // in som preset så panelen slipper skrapa legacy-DOM.
    try {
      var api = global.CCOBottomActions;
      if (api && typeof api.run === 'function') {
        // Stäng en ev. öppen fallback-workbench först så inte två overlays visas
        // samtidigt (om användaren hann öppna fallbacken innan launchern laddats).
        closeStudio();
        var studioEmail = text(
          thread.customerEmail || thread.contactEmail || (thread.from && thread.from.address)
        );
        var studioMailbox = text(thread.mailboxId || thread.mailboxAddress || thread.mailboxLabel);
        // Trådens riktiga meddelanden i launcherns form ({dir,time,body}) — utan
        // dessa visar mountSvarstudioV2 design-artefaktens exempel-tråd i stället
        // för den valda konversationen.
        var studioMessages = messageList(thread)
          .slice(-6)
          .map(function (message) {
            return {
              dir: isIncoming(message) ? 'incoming' : 'outgoing',
              time: text(message.sentAt || message.receivedAt || message.time || message.timestamp),
              body: messageBody(message),
            };
          });
        api.run('svarstudio', {
          source: 'cco-conversations-v2',
          conversationKey: threadConversationKey(thread),
          customerName: text(thread.customerName) || threadName(thread),
          email: studioEmail,
          // customerId är en kund-/patient-identifierare i launchern (inte
          // e-post) — använd trådens riktiga customerId; e-post bara som sista
          // fallback (bättre än launcherns CUST-DEMO-default).
          customerId: text(thread.customerId) || studioEmail,
          mailboxId: studioMailbox,
          mailboxSource: studioMailbox,
          subject: text(thread.subject),
          latestMessages: studioMessages,
          threadSnippet: text(thread.preview),
        });
        return;
      }
    } catch (_launcherError) {
      /* faller igenom till fallback nedan om launchern inte är laddad */
    }
    // Fallback (endast om den godkända launchern ännu inte laddats): V2:s egen
    // workbench. Tas bort när launcher-inkopplingen är verifierad live.
    studio = {
      thread: thread,
      draftId: null,
      tone: 'professional',
      signature: studioDefaultSignatureId(thread),
      recipient: text((boundCtx && boundCtx.studioDefaultRecipient) || thread.customerEmail || thread.contactEmail),
      senderMailbox: studioDefaultSenderMailbox(thread),
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
        // Vissa rader (t.ex. "Källa") bär redan-escapead HTML i ddHtml och
        // saknar dd — fall tillbaka på den så värdet inte blir tomt.
        var val = r.ddHtml ? r.ddHtml : esc(r.dd);
        return (
          '<div class="wb-fact-cell"><span class="wb-fact-lbl">' +
          esc(r.dt) +
          '</span><span class="wb-fact-val">' +
          val +
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
      studioChips(studioSignatures(), studio.signature, 'sig') +
      '</div></div>' +
      '<div class="wb-chip-row-sect"><span class="wb-section-kicker">Snabbsvar</span><div class="wb-chips">' +
      studioChips(STUDIO_MACROS, '', 'macro') +
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
      '<div class="wb-field"><span class="wb-field-lbl">Till</span><input data-studio-recipient type="email" value="' +
      esc(studio.recipient) +
      '" placeholder="kundens e-postadress" autocomplete="email"></div>' +
      '<div class="wb-field"><span class="wb-field-lbl">Från</span><select data-studio-sender>' +
      studioSenderOptions().map(function (option) {
        var id = text(option.id);
        return '<option value="' + esc(id) + '"' +
          (id === studio.senderMailbox ? ' selected' : '') + '>' +
          esc(text(option.label) || id) +
          '</option>';
      }).join('') +
      '</select></div>' +
      '</div></div>' +
      '<div class="wb-footer">' +
      '<button class="wb-primary-cta" data-studio-send type="button"' +
      (!(boundCtx && boundCtx.studioOwnerSendAvailable) || studio.busy ? ' disabled' : '') +
      ' title="Kräver godkänt utkast, owner och serverns send-grindar">📨 Godkänn &amp; skicka</button>' +
      '<span class="wb-send-locked">' +
      ((boundCtx && boundCtx.studioOwnerSendAvailable)
        ? '🔒 Servern kontrollerar owner, mottagare och avsändare före skick.'
        : '🔒 Skicka är spärrat tills owner-send är aktiverat.') +
      '</span>' +
      '<button class="wb-secondary-cta" data-studio-save type="button"' +
      (studio.busy ? ' disabled' : '') +
      '>Spara utkast</button>' +
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
      signatureId: studio.signature,
      recipient: studio.recipient,
      senderMailbox: studio.senderMailbox,
      conversationKey: threadConversationKey(t),
      mailboxId: text(t.mailboxAddress || t.mailboxId),
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
    if (studio.busy) return; // bail om redan upptagen → ingen dubbel-POST
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
      signatureId: studio.signature,
    });
    var draft = (res && res.draft) || {};
    if (draft.draftId) studio.draftId = draft.draftId;
    if (draft.status) studio.status = draft.status;
    return draft;
  }

  async function studioSave() {
    if (!studio || !boundCtx.handlers.studioSave) return;
    if (studio.busy) return; // bail om redan upptagen → ingen dubbel-POST/dubbla utkast
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
    if (studio.busy) return; // bail om redan upptagen → ingen dubbel-POST
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

  async function studioSend() {
    if (!studio || !boundCtx.handlers.studioSend) return;
    if (studio.busy || !(boundCtx && boundCtx.studioOwnerSendAvailable)) return;
    studioCapture();
    if (!text(studio.recipient) || !text(studio.senderMailbox)) {
      studio.error = 'Välj både mottagare och avsändarbrevlåda innan du skickar.';
      renderStudio();
      return;
    }
    studio.busy = true;
    studio.error = '';
    try {
      await studioEnsureSaved();
      // studioTransitionTo skyddar användarklick när studion är upptagen.
      // I den sammansatta owner-vägen gör vi övergångarna här, i samma
      // befintliga route och utan ett andra parallellt save-anrop.
      if (studio.status === 'draft') {
        var review = await boundCtx.handlers.studioTransition(studio.draftId, 'needs_approval');
        studio.status = text(review && review.draft && review.draft.status) || 'needs_approval';
      }
      if (studio.status !== 'approved') {
        var approval = await boundCtx.handlers.studioTransition(studio.draftId, 'approved');
        studio.status = text(approval && approval.draft && approval.draft.status) || 'approved';
      }
      var response = await boundCtx.handlers.studioSend({
        draftId: studio.draftId,
        to: studio.recipient,
        senderMailbox: studio.senderMailbox,
      });
      if (!response || response.sent !== true) {
        throw new Error((response && (response.error || response.reason)) || 'Utskicket kunde inte bekräftas.');
      }
      studio.status = 'sent';
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
      if (event.target.matches('[data-v2-search]') && boundCtx) {
        inboxQuery = event.target.value || '';
        activeTab = 'alla';
        selected = {};
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        renderBulkBar();
        return;
      }
      if (studio && event.target.matches('[data-studio-body]')) {
        studio.body = event.target.value;
        var count = root.querySelector('[data-studio-count]');
        if (count) count.textContent = studio.body.length + ' tecken';
      }
      if (studio && event.target.matches('[data-studio-recipient]')) {
        studio.recipient = event.target.value;
        return;
      }
      if (studio && event.target.matches('[data-studio-sender]')) {
        studio.senderMailbox = event.target.value;
        return;
      }
      if (cmdkOpen && event.target.matches('[data-v3-cmdk-input]')) {
        cmdkQuery = event.target.value;
        cmdkActive = 0;
        renderCmdk();
      }
      // Snabbsvar: spegla utkastet till state så det överlever om-rendering
      // (bakgrundspoll, tema-toggle, lane-byte) — annars tappas det skrivna.
      if (boundCtx && boundCtx.selected && event.target.matches('[data-v3-qr-body]')) {
        qrDraft[threadConversationKey(boundCtx.selected)] = event.target.value;
      }
    });
    // ⌘K / Ctrl+K — kommandopalett + tangentbordsnavigering i den. Lyssnaren
    // sitter på doc (inte root), så den binds via en modul-global flagga och
    // dubbelbinds aldrig även om roten skulle återskapas.
    if (!docKeydownBound) {
      docKeydownBound = true;
      doc.addEventListener('keydown', function (event) {
        var key = (event.key || '').toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === 'k') {
          if (!conversationsActive()) return;
          event.preventDefault();
          if (cmdkOpen) closeCmdk();
          else openCmdk();
          return;
        }
        if (!cmdkOpen) return;
        if (key === 'escape') {
          event.preventDefault();
          closeCmdk();
        } else if (key === 'arrowdown') {
          event.preventDefault();
          // Math.max(0, …): vid 0 träffar blir length-1 = -1, klampa upp till 0.
          cmdkActive = Math.max(0, Math.min(filteredCommands(boundCtx).length - 1, cmdkActive + 1));
          renderCmdk();
        } else if (key === 'arrowup') {
          event.preventDefault();
          cmdkActive = Math.max(0, cmdkActive - 1);
          renderCmdk();
        } else if (key === 'enter') {
          event.preventDefault();
          runCmdk(cmdkActive);
        }
      });
    }
    root.addEventListener('click', function (event) {
      // ── Kommandopalett ──
      if (cmdkOpen) {
        if (event.target.matches('[data-v3-cmdk-backdrop]')) {
          closeCmdk();
          return;
        }
        var cmdItem = event.target.closest('[data-v3-cmdk-i]');
        if (cmdItem) {
          runCmdk(Number(cmdItem.getAttribute('data-v3-cmdk-i')));
          return;
        }
      }
      // ── Ctx-flikar ──
      var ctxTabEl = event.target.closest('[data-ctx-tab]');
      if (ctxTabEl && boundCtx) {
        activeCtxTab = ctxTabEl.getAttribute('data-ctx-tab');
        renderCtx(boundCtx);
        return;
      }
      // ── Inline quick-reply ──
      if (event.target.closest('[data-v3-qr-studio]') && boundCtx) {
        openStudio(boundCtx.selected);
        return;
      }
      if (event.target.closest('[data-v2-attachment-close]') || event.target.matches('[data-v2-attachment-preview]')) {
        closeAttachmentPreview();
        return;
      }
      var attachmentEl = event.target.closest('[data-v2-attachment-index]');
      if (attachmentEl && boundCtx && boundCtx.selected) {
        var messageId = text(attachmentEl.getAttribute('data-v2-message-id'));
        var message = messageList(boundCtx.selected).find(function (candidate) {
          return text(candidate && (candidate.messageId || candidate.graphMessageId)) === messageId;
        });
        var attachment = message && attachmentForMessage(message, Number(attachmentEl.getAttribute('data-v2-attachment-index')));
        if (attachment) openAttachmentPreview(message, attachment);
        return;
      }
      if (event.target.closest('[data-v3-qr-save]') && boundCtx && boundCtx.selected) {
        var qrTa = root.querySelector('[data-v3-qr-body]');
        var qrText = qrTa ? qrTa.value : '';
        var qrId = threadConversationKey(boundCtx.selected);
        if (qrText.trim() && typeof boundCtx.handlers.studioSave === 'function') {
          boundCtx.handlers
            .studioSave({
              customerId: text(boundCtx.selected.customerId) || text(boundCtx.selected.id),
              tenantId: text(boundCtx.selected.tenantId),
              subject: text(boundCtx.selected.subject),
              body: qrText,
            })
            .then(function () {
              if (qrTa) qrTa.value = '';
              delete qrDraft[qrId];
              try {
                global.CCOPolish &&
                  global.CCOPolish.showToast &&
                  global.CCOPolish.showToast('Utkast sparat', 'success');
              } catch (_error) {
                /* tyst */
              }
            })
            .catch(function () {});
        }
        return;
      }
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
        var macroEl = event.target.closest('[data-studio-macro]');
        if (macroEl) {
          studioCapture();
          var macroText = studioMacroText(macroEl.getAttribute('data-studio-macro'), studio.thread);
          studio.body = studio.body.trim() ? studio.body.replace(/\s+$/, '') + '\n\n' + macroText : macroText;
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
          void studioSend();
          return;
        }
      }
      // v3 operatörs-toolbar.
      if (event.target.closest('[data-v3-theme]')) {
        v3Theme = v3Theme === 'dark' ? 'light' : 'dark';
        lsSet(THEME_KEY, v3Theme);
        applyTheme();
        if (boundCtx) renderToolbar(boundCtx);
        return;
      }
      if (event.target.closest('[data-v3-density]')) {
        v3Density = v3Density === 'compact' ? 'comfortable' : 'compact';
        lsSet(DENSITY_KEY, v3Density);
        root.dataset.density = v3Density;
        if (boundCtx) renderToolbar(boundCtx);
        return;
      }
      var segEl = event.target.closest('[data-v3-segment]');
      if (segEl && boundCtx) {
        activeSegment = segEl.getAttribute('data-v3-segment');
        // Urvalet är vy-skopat: rensa vid filterbyte så bulk-actions aldrig
        // träffar dolda trådar från en annan vy.
        selected = {};
        renderToolbar(boundCtx);
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        renderBulkBar();
        return;
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
        selected = {}; // urvalet är lane-skopat — rensa vid lane-byte
        boundCtx.handlers.setLane(laneEl.getAttribute('data-lane'));
        return;
      }
      var tabEl = event.target.closest('[data-tab]');
      if (tabEl && boundCtx) {
        activeTab = tabEl.getAttribute('data-tab');
        selected = {}; // rensa urvalet vid flik-byte (vy-skopat)
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        renderBulkBar();
        return;
      }
      var mailboxEl = event.target.closest('[data-v2-mailbox]');
      if (mailboxEl && boundCtx && typeof boundCtx.handlers.setMailboxScope === 'function') {
        if (mailboxEl.disabled) return;
        var mailboxId = mailboxEl.getAttribute('data-v2-mailbox');
        var current = (boundCtx.selectedMailboxIds || []).map(text).filter(Boolean);
        // Ett äldre sparat scope kan vara bredare än runtime-kontraktets två
        // mailboxar. Ett klick väljer då uttryckligen den aktuella mailboxen.
        if (current.length > 2) {
          selected = {};
          boundCtx.handlers.setMailboxScope([mailboxId]);
          return;
        }
        var next = current.filter(function (id) { return id !== mailboxId; });
        if (next.length === current.length) {
          if (current.length >= 2) return;
          next.push(mailboxId);
        }
        // Ett tomt scope skulle återställa den gamla preferensen till alla
        // mailboxar. Behåll minst en aktiv mailbox i v2.
        if (!next.length) return;
        selected = {};
        boundCtx.handlers.setMailboxScope(next);
        return;
      }
      var folderEl = event.target.closest('[data-v2-folder]');
      if (folderEl && boundCtx) {
        activeFolder = folderEl.getAttribute('data-v2-folder') === 'sent' ? 'sent' : 'inbox';
        activeTab = 'alla';
        selected = {};
        renderFolderControls();
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        renderBulkBar();
        return;
      }
      // v3: multi-select checkbox (öppnar inte tråden).
      var selEl = event.target.closest('[data-thread-select]');
      if (selEl && boundCtx) {
        event.stopPropagation();
        var sid = selEl.getAttribute('data-thread-select');
        if (selected[sid]) delete selected[sid];
        else selected[sid] = true;
        renderInbox(boundCtx);
        renderBulkBar();
        return;
      }
      // v3: bulk-actions.
      var bulkEl = event.target.closest('[data-v3-bulk]');
      if (bulkEl && boundCtx) {
        var bname = bulkEl.getAttribute('data-v3-bulk');
        var ids = selectedIds();
        if (bname === 'clear') {
          selected = {};
        } else if (typeof boundCtx.handlers.bulkAction === 'function') {
          var bulkPromise = boundCtx.handlers.bulkAction(bname, ids);
          // Behåll urvalet när servern nekar eller när en mutation misslyckas.
          // Operatören ska kunna läsa felet och korrigera urvalet, inte tyst
          // förlora sina valda trådar.
          if (bulkPromise && typeof bulkPromise.then === 'function') {
            bulkEl.setAttribute('disabled', 'disabled');
            bulkPromise
              .then(function (result) {
                if (!(result && result.cancelled)) {
                  selected = {};
                }
              })
              .catch(function () {
                /* app-handlaren visar serverfelet i v2-ytan */
              })
              .finally(function () {
                bulkEl.removeAttribute('disabled');
                if (boundCtx) {
                  renderInbox(boundCtx);
                  renderBulkBar();
                }
              });
          } else {
            renderActionFeedback({
              actionFeedback: {
                message: 'Massåtgärden kunde inte startas. Försök igen eller ladda om vyn.',
                tone: 'error',
              },
            });
          }
        } else {
          renderActionFeedback({
            actionFeedback: {
              message: 'Massåtgärden är inte tillgänglig i den här vyn.',
              tone: 'error',
            },
          });
        }
        if (bname === 'clear' || typeof boundCtx.handlers.bulkAction !== 'function') {
          renderInbox(boundCtx);
          renderBulkBar();
        }
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
        // Kunddossiér är en säker läs-/navigeringsaction och öppnar V12.
        // De persistenta trådactions hanteras av appens befintliga CCO-kontrakt.
        if (name === 'studio') {
          openStudio(boundCtx.selected);
        } else if (name === 'dossier' && typeof boundCtx.handlers.openDossier === 'function') {
          boundCtx.handlers.openDossier(boundCtx.selected);
        } else if (typeof boundCtx.handlers.action === 'function') {
          var actionPromise = boundCtx.handlers.action(name, boundCtx.selected);
          if (actionPromise && typeof actionPromise.then === 'function') {
            actionEl.setAttribute('disabled', 'disabled');
            actionPromise
              .catch(function () {
                /* app-handlaren visar serverfelet i v2-ytan */
              })
              .finally(function () {
                actionEl.removeAttribute('disabled');
              });
          }
        } else {
          renderActionFeedback({
            actionFeedback: {
              message: 'Åtgärden är inte tillgänglig i den här vyn.',
              tone: 'error',
            },
          });
        }
      }
    });
  }

  // v3: räkna risk-signaler för toolbar-badges.
  function riskCounts(threads) {
    var list = threads || [];
    var high = 0;
    var followup = 0;
    var unassigned = 0;
    list.forEach(function (t) {
      if (/hög|high|klagomål|komplikation/i.test(text(t.riskLabel))) high += 1;
      if (text(t.followUpLabel) || text(t.missingLabel) || text(t.waitingLabel)) followup += 1;
      // oägd = saknar konkret ägare (även ownerKey 'unassigned'/'oägd'), så att
      // räknaren stämmer med "Mina"-logiken ovan.
      if (!isAssigned(t)) unassigned += 1;
    });
    return { high: high, followup: followup, unassigned: unassigned };
  }

  // v3: segment filtrerar inboxen (kombineras med flikar).
  var V3_SEGMENTS = [
    { id: 'alla', label: 'Alla' },
    { id: 'obesvarade', label: 'Obesvarade' },
    { id: 'sla', label: 'SLA-risk' },
    { id: 'mina', label: 'Mina' },
  ];
  // v3: ägar-/tilldelningslogik (delas av "Mina"-segmentet och toolbar-badges).
  function ownerKeyOf(thread) {
    return text(thread.ownerKey || thread.ownerLabel).toLowerCase();
  }
  function isAssigned(thread) {
    var k = ownerKeyOf(thread);
    return Boolean(k) && k !== 'unassigned' && k !== 'oägd' && k !== 'all';
  }
  // "Mina" = den signerade operatörens kö. När en specifik ägare är vald
  // (operatorKey ≠ all) matchas bara den ägarens trådar; annars faller vi
  // tillbaka på tilldelade trådar (aldrig oägda) — fixar att kollegors och
  // oägda rader tidigare räknades som "mina" (Bugbot #235, High).
  function isMine(thread) {
    var op = text(boundCtx && boundCtx.operatorKey).toLowerCase();
    if (op && op !== 'all') return ownerKeyOf(thread) === op;
    return isAssigned(thread);
  }

  function segmentMatch(thread) {
    if (activeSegment === 'obesvarade') return isUnread(thread);
    // SLA-risk: använd den kanoniska slaOf() som även väger in thread.slaStatus
    // (breach/overdue/warning/risk), inte bara follow-up/missing/waiting-etiketter
    // (Bugbot #235, Medium).
    if (activeSegment === 'sla') return Boolean(slaOf(thread));
    if (activeSegment === 'mina') return isMine(thread);
    return true;
  }

  function renderToolbar(ctx) {
    var el = root.querySelector('[data-v3-toolbar]');
    if (!el) return;
    var all = ctx.allThreads || [];
    var risk = riskCounts(all);
    var segs = V3_SEGMENTS.map(function (s) {
      var count =
        s.id === 'alla'
          ? all.length
          : all.filter(function (t) {
              var prev = activeSegment;
              activeSegment = s.id;
              var m = segmentMatch(t);
              activeSegment = prev;
              return m;
            }).length;
      return (
        '<button class="v3-segment' +
        (s.id === activeSegment ? ' active' : '') +
        '" data-v3-segment="' +
        s.id +
        '" type="button">' +
        esc(s.label) +
        '<span class="ct">' +
        count +
        '</span></button>'
      );
    }).join('');
    el.innerHTML =
      '<div class="v3-segments" role="tablist">' +
      segs +
      '</div>' +
      '<div class="v3-spacer"></div>' +
      (risk.high
        ? '<span class="v3-risk v3-risk--high" title="Högrisk">⚠ ' + risk.high + ' högrisk</span>'
        : '') +
      (risk.followup
        ? '<span class="v3-risk v3-risk--followup" title="Behöver uppföljning">⏱ ' +
          risk.followup +
          ' followup</span>'
        : '') +
      (risk.unassigned
        ? '<span class="v3-risk v3-risk--unassigned" title="Ej tilldelat">○ ' +
          risk.unassigned +
          ' ej tilldelat</span>'
        : '') +
      '<button class="v3-iconbtn" data-v3-density type="button" title="Densitet (kompakt/bekväm)" aria-label="Densitet">' +
      (v3Density === 'compact' ? '▤' : '▦') +
      '</button>' +
      '<button class="v3-iconbtn" data-v3-theme type="button" title="Ljust/mörkt tema" aria-label="Tema">' +
      (v3Theme === 'dark' ? '☀' : '☾') +
      '</button>';
  }

  var V3_BULK_ACTIONS = [
    { id: 'handled', label: 'Markera klar' },
    { id: 'reply_later', label: 'Senare' },
    { id: 'reopen', label: 'Återöppna' },
  ];
  function renderBulkBar() {
    var el = root.querySelector('[data-v3-bulkbar]');
    if (!el) return;
    var n = selectedCount();
    root.dataset.selectMode = n > 0 ? 'on' : 'off';
    if (!n) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<span class="count">' +
      n +
      ' valda</span>' +
      V3_BULK_ACTIONS.map(function (a) {
        return (
          '<button class="v3-bulk-action" type="button" data-v3-bulk="' +
          a.id +
          '">' +
          esc(a.label) +
          '</button>'
        );
      }).join('') +
      '<span class="spacer"></span>' +
      '<button class="v3-bulk-action v3-bulk-action--clear" type="button" data-v3-bulk="clear">Avmarkera</button>';
  }

  // ── Kommandopalett (⌘K) ──
  function buildCommands(ctx) {
    var cmds = [];
    (ctx.lanes || []).forEach(function (lane) {
      cmds.push({
        ico: lane.icon || '▸',
        label: 'Gå till ' + lane.label,
        grp: 'Lane',
        run: function () {
          ctx.handlers.setLane(lane.id);
        },
      });
    });
    V3_SEGMENTS.forEach(function (s) {
      cmds.push({
        ico: '◎',
        label: 'Visa ' + s.label,
        grp: 'Vy',
        run: function () {
          activeSegment = s.id;
          renderToolbar(ctx);
          renderTabs(ctx);
          renderInbox(ctx);
        },
      });
    });
    cmds.push({
      ico: v3Theme === 'dark' ? '☀' : '☾',
      label: v3Theme === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema',
      grp: 'Tema',
      run: function () {
        v3Theme = v3Theme === 'dark' ? 'light' : 'dark';
        lsSet(THEME_KEY, v3Theme);
        applyTheme();
        renderToolbar(ctx);
      },
    });
    cmds.push({
      ico: '▤',
      label: v3Density === 'compact' ? 'Bekväm densitet' : 'Kompakt densitet',
      grp: 'Vy',
      run: function () {
        v3Density = v3Density === 'compact' ? 'comfortable' : 'compact';
        lsSet(DENSITY_KEY, v3Density);
        root.dataset.density = v3Density;
        renderToolbar(ctx);
      },
    });
    if (ctx.selected) {
      cmds.push({
        ico: '★',
        label: 'Öppna Svarstudio',
        grp: 'Tråd',
        run: function () {
          openStudio(ctx.selected);
        },
      });
      cmds.push({
        ico: '👤',
        label: 'Öppna Kunddossiér',
        grp: 'Tråd',
        run: function () {
          if (ctx.handlers.openDossier) ctx.handlers.openDossier(ctx.selected);
        },
      });
    }
    return cmds;
  }
  function filteredCommands(ctx) {
    var q = cmdkQuery.trim().toLowerCase();
    var all = buildCommands(ctx);
    if (!q) return all;
    return all.filter(function (c) {
      return c.label.toLowerCase().indexOf(q) >= 0 || c.grp.toLowerCase().indexOf(q) >= 0;
    });
  }
  function openCmdk() {
    cmdkOpen = true;
    cmdkQuery = '';
    cmdkActive = 0;
    renderCmdk();
    var input = root.querySelector('.v3-cmdk-input');
    if (input) input.focus();
  }
  function closeCmdk() {
    cmdkOpen = false;
    var host = root.querySelector('[data-v3-cmdk]');
    if (host) host.innerHTML = '';
  }
  function renderCmdk() {
    var host = root.querySelector('[data-v3-cmdk]');
    if (!host) return;
    if (!cmdkOpen) {
      host.innerHTML = '';
      return;
    }
    var cmds = filteredCommands(boundCtx);
    if (cmdkActive >= cmds.length) cmdkActive = Math.max(0, cmds.length - 1);
    if (cmdkActive < 0) cmdkActive = 0; // klampa även nedåt (0 träffar)
    // Bevara caret-positionen — inputen byggs om vid varje tangenttryck, så
    // att tvinga caret till slutet hoppar vid redigering mitt i söksträngen.
    var prevInput = root.querySelector('.v3-cmdk-input');
    var prevCaret = prevInput ? prevInput.selectionStart : null;
    host.innerHTML =
      '<div class="v3-cmdk-backdrop" data-v3-cmdk-backdrop><div class="v3-cmdk" role="dialog" aria-label="Kommandopalett">' +
      '<input class="v3-cmdk-input" data-v3-cmdk-input placeholder="Sök kommando… (lane, vy, tema, tråd)" value="' +
      esc(cmdkQuery) +
      '" />' +
      '<div class="v3-cmdk-list">' +
      (cmds.length
        ? cmds
            .map(function (c, i) {
              return (
                '<div class="v3-cmdk-item' +
                (i === cmdkActive ? ' active' : '') +
                '" data-v3-cmdk-i="' +
                i +
                '"><span class="v3-cmdk-ico">' +
                esc(c.ico) +
                '</span><span>' +
                esc(c.label) +
                '</span><span class="grp">' +
                esc(c.grp) +
                '</span></div>'
              );
            })
            .join('')
        : '<div class="v3-cmdk-empty">Inga kommandon matchar.</div>') +
      '</div></div></div>';
    var input = root.querySelector('.v3-cmdk-input');
    if (input) {
      input.focus();
      var pos = prevCaret == null ? input.value.length : Math.min(prevCaret, input.value.length);
      input.setSelectionRange(pos, pos);
    }
  }
  function runCmdk(index) {
    var cmds = filteredCommands(boundCtx);
    var c = cmds[index];
    closeCmdk();
    if (c && typeof c.run === 'function') c.run();
  }

  function render(ctx) {
    if (!doc) return;
    releaseMailAssetUrls();
    boundCtx = ctx;
    ensureRoot();
    bindEvents();
    // v3: tema (app-brett) + densitet (persisteras).
    applyTheme();
    root.dataset.density = v3Density;
    // Mobil master-detail: utan vald tråd visas alltid inboxen — och då måste
    // även kontext-arket stängas, annars ligger det kvar fast över inboxen och
    // blockerar interaktion på ≤768px (Bugbot #230).
    if (!ctx.selected) {
      mobilePane = 'inbox';
      root.dataset.mobileCtx = 'closed';
    }
    root.dataset.mobilePane = mobilePane;
    if (!root.dataset.mobileCtx) root.dataset.mobileCtx = 'closed';
    renderToolbar(ctx);
    renderLanes(ctx);
    renderLaneChips(ctx);
    renderMailboxControls(ctx);
    renderFolderControls();
    renderActionFeedback(ctx);
    renderTabs(ctx);
    renderInbox(ctx);
    renderBulkBar();
    renderThread(ctx);
    hydrateRichMailFrames();
    renderCtx(ctx);
    if (cmdkOpen) renderCmdk();
  }

  global.ArcanaConversationsV2 = {
    render: render,
    _findThreadById: findThreadById,
    _paritySnapshot: paritySnapshot,
  };

  function flagEnabled() {
    try {
      return (
        global.__ARCANA_CONVERSATIONS_V2_ENABLED__ === true ||
        doc.documentElement.getAttribute('data-conversations-v2') === 'on'
      );
    } catch (_error) {
      return false;
    }
  }

  function requestRuntimeRender() {
    if (!flagEnabled()) return;
    try {
      if (typeof global.__scheduleRuntimeConversationShell === 'function') {
        global.__scheduleRuntimeConversationShell('all');
      }
    } catch (_error) {
      /* best-effort bootstrap */
    }
  }

  [0, 120, 900].forEach(function (delay) {
    global.setTimeout(requestRuntimeRender, delay);
  });
  if (doc && doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', requestRuntimeRender, { once: true });
  } else {
    requestRuntimeRender();
  }
})(typeof window !== 'undefined' ? window : globalThis);
