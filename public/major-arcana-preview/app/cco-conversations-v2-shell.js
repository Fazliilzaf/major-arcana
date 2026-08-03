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
  // V2 kan ha hela klinikens mailbox-scope valt. Begränsa bara hur många
  // rader som målas per pass, aldrig vilka mailboxar eller trådar som finns.
  var inboxRenderLimit = 120;
  var INBOX_RENDER_STEP = 120;
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

  // En egen färg per brevlåda. Tidigare kände den bara igen fazli/egzona/contact
  // och lät allt annat falla på 'info' — med nio brevlådor delade fem samma
  // gråbruna ton och gick inte att skilja åt i listan.
  //
  // Ordningen är specifik före generisk: 'kontakt' matchas före 'kons', annars
  // fångar 'kons' aldrig något eftersom båda finns i registret.
  var MAILBOX_TONES = [
    ['fazli', 'fazli'],
    ['egzona', 'egzona'],
    ['contact', 'contact'],
    ['kontakt', 'contact'],
    ['kvitto', 'kvitto'],
    ['halso', 'halso'],
    ['hälso', 'halso'],
    ['marknad', 'marknad'],
    ['kons', 'kons'],
    ['info', 'info'],
  ];

  function mailboxTone(mailbox) {
    var haystack = (
      text(mailbox.id) +
      ' ' +
      text(mailbox.email) +
      ' ' +
      text(mailbox.label)
    ).toLowerCase();
    for (var i = 0; i < MAILBOX_TONES.length; i++) {
      if (haystack.indexOf(MAILBOX_TONES[i][0]) >= 0) return MAILBOX_TONES[i][1];
    }
    return 'ovrig';
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
    // Oklar/dubbel kundmatchning syns direkt i listan (paritet med legacy).
    if (needsCustomerReview(thread)) tags.push({ kind: 'warning', label: 'Kundgranskning' });
    if (isVip(thread)) tags.push({ kind: 'vip', label: 'VIP' });
    if (isBooking(thread)) tags.push({ kind: 'booking', label: 'Bokning' });
    var label = smartLabel(thread);
    if (
      label &&
      !tags.some(function (tag) {
        return tag.label === label;
      })
    ) {
      tags.push({ kind: 'smart', label: label });
    }
    return tags;
  }

  // ── Meddelandeström (hydrerad av selectRuntimeThread → thread.messages) ──
  var WEEKDAYS = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  var STAFF_BG = 'linear-gradient(180deg,#c5d8a8,#92b86e)';

  function messageList(thread) {
    // V2:s direkta trådläsning bär den fulla, mailbox-scopeade HTML- och
    // bilagepayloaden från samma endpoint som admin använder. Den ska vinna
    // över den äldre, eventuellt magrare historikprojektionen.
    if (Array.isArray(thread.directMailMessages) && thread.directMailMessages.length) {
      return thread.directMailMessages;
    }
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
    var mailDocument =
      safeMessage.mailDocument && typeof safeMessage.mailDocument === 'object'
        ? safeMessage.mailDocument
        : {};
    var primaryBody =
      safeMessage.primaryBody && typeof safeMessage.primaryBody === 'object'
        ? safeMessage.primaryBody
        : {};
    var presentation =
      safeMessage.presentation && typeof safeMessage.presentation === 'object'
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
      if (
        /^(?:Du\s+f[åa]r\s+inte\s+e-post\s+ofta\s+från|You\s+don't\s+often\s+get\s+email\s+from)\b/i.test(
          text(notice && notice.textContent)
        )
      ) {
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
      mailDoc = new Parser().parseFromString(
        '<!doctype html><html><body>' + source + '</body></html>',
        'text/html'
      );
    } catch (_error) {
      return '';
    }
    if (!mailDoc || !mailDoc.body) return '';
    removeOutlookSenderNotice(mailDoc);
    Array.prototype.forEach.call(
      mailDoc.querySelectorAll('script,style,iframe,object,embed,form,meta,link,base,input,button'),
      function (node) {
        node.remove();
      }
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
      note.textContent =
        missingInline === 1
          ? 'En inlinebild saknas i det här äldre mailet.'
          : missingInline + ' inlinebilder saknas i det här äldre mailet.';
      mailDoc.body.appendChild(note);
    }
    return mailDoc.body.innerHTML;
  }

  function attachmentCandidates(message) {
    var safeMessage = message && typeof message === 'object' ? message : {};
    var mailDocument =
      safeMessage.mailDocument && typeof safeMessage.mailDocument === 'object'
        ? safeMessage.mailDocument
        : {};
    var candidates = []
      .concat(Array.isArray(safeMessage.attachments) ? safeMessage.attachments : [])
      .concat(Array.isArray(mailDocument.attachments) ? mailDocument.attachments : [])
      .concat(Array.isArray(mailDocument.inlineAssets) ? mailDocument.inlineAssets : []);
    var seen = {};
    return candidates.filter(function (attachment) {
      var safe = attachment && typeof attachment === 'object' ? attachment : {};
      var key = text(
        safe.attachmentId || safe.id || safe.assetId || safe.contentId || safe.name
      ).toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function attachmentName(attachment) {
    return (
      text(attachment && (attachment.name || attachment.filename || attachment.fileName)) ||
      'Bilaga'
    );
  }

  function attachmentType(attachment) {
    return text(attachment && (attachment.contentType || attachment.mimeType)).toLowerCase();
  }

  function attachmentIsImage(attachment) {
    return (
      /^image\//i.test(attachmentType(attachment)) ||
      /\.(png|jpe?g|gif|webp|svg|heic)$/i.test(attachmentName(attachment))
    );
  }

  function attachmentUrl(attachment, message) {
    var safe = attachment && typeof attachment === 'object' ? attachment : {};
    var direct = text(safe.inlineUrl || safe.openUrl || safe.downloadUrl || safe.url || safe.href);
    if (direct) return direct;
    var attachmentId = text(safe.attachmentId || safe.id || safe.assetId);
    var mailboxId = text(message && message.mailboxId);
    var messageId = text(message && (message.graphMessageId || message.messageId));
    if (!attachmentId || !mailboxId || !messageId) return '';
    return (
      '/api/v1/cco/runtime/mail-asset/content?mailboxId=' +
      encodeURIComponent(mailboxId) +
      '&messageId=' +
      encodeURIComponent(messageId) +
      '&attachmentId=' +
      encodeURIComponent(attachmentId) +
      '&mode=open&fileName=' +
      encodeURIComponent(attachmentName(safe))
    );
  }

  function attachmentIsInline(attachment, message, html) {
    var safe = attachment && typeof attachment === 'object' ? attachment : {};
    if (
      safe.isInline === true ||
      safe.inline === true ||
      text(safe.disposition).toLowerCase() === 'inline'
    )
      return true;
    var contentId = text(safe.contentId).replace(/^<|>$/g, '');
    return Boolean(
      contentId &&
      text(html)
        .toLowerCase()
        .indexOf('cid:' + contentId.toLowerCase()) >= 0
    );
  }

  function renderMessageAttachments(message) {
    var html = messageBodyHtml(message);
    var attachments = attachmentCandidates(message).filter(function (attachment) {
      return !attachmentIsInline(attachment, message, html);
    });
    if (!attachments.length) return '';
    return (
      '<div class="v2-msg-attachments" aria-label="Bilagor">' +
      attachments
        .map(function (attachment, index) {
          var url = attachmentUrl(attachment, message);
          var type = attachmentType(attachment);
          var size = Number(attachment && attachment.size) || 0;
          var meta = [type, size ? Math.max(1, Math.round(size / 1024)) + ' kB' : '']
            .filter(Boolean)
            .join(' · ');
          return (
            '<button type="button" class="v2-msg-attachment" data-v2-attachment-index="' +
            index +
            '" data-v2-message-id="' +
            esc(text(message.messageId || message.graphMessageId)) +
            '" title="' +
            esc(meta || attachmentName(attachment)) +
            '"' +
            (url ? '' : ' disabled') +
            '>' +
            '<span aria-hidden="true">' +
            (attachmentIsImage(attachment) ? '🖼' : '📎') +
            '</span><span>' +
            esc(attachmentName(attachment)) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderRichMessageBubble(message) {
    var html = sanitizeMailHtmlForDisplay(messageBodyHtml(message));
    if (!html) {
      return (
        '<div class="msg-bubble">' +
        esc(messageBody(message)).replace(/\n/g, '<br>') +
        '</div>' +
        renderMessageAttachments(message)
      );
    }
    var frameDocument =
      '<!doctype html><html><head><meta charset="utf-8"><base target="_blank">' +
      '<style>body{margin:0;padding:10px 12px;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2b251f;background:#fffdfb;word-break:break-word}img{max-width:100%;height:auto}.mail-inline-asset-missing{margin:8px 0 0;color:#766f65;font-size:11px;font-style:italic}</style>' +
      '</head><body>' +
      html +
      '</body></html>';
    return (
      '<div class="msg-bubble msg-bubble--html"><iframe class="v2-msg-html-frame" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" referrerpolicy="no-referrer" loading="lazy" srcdoc="' +
      esc(frameDocument) +
      '" title="Mailinnehåll"></iframe></div>' +
      renderMessageAttachments(message)
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

  // Paritet med legacy admin#cco (patientMatchNeedsManualReview): en oklar/dubbel
  // kundmatchning ("ambiguous") flaggas som manuell kundgranskning. Rent
  // surfacing — vi öppnar aldrig en kunddossier eller skriver en koppling härifrån.
  function needsCustomerReview(thread) {
    if (!thread || !thread.patientMatch) return false;
    return text(thread.patientMatch.status).toLowerCase() === 'ambiguous';
  }

  function statusPills(thread) {
    var pills =
      '<span class="status-pill status-pill--source"><span class="dot"></span>' +
      esc(sourceLabel(thread)) +
      '</span>';
    if (needsCustomerReview(thread)) {
      pills +=
        '<span class="status-pill status-pill--warning"><span class="dot"></span>Manuell kundgranskning</span>';
    }
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
    // Läsytan följer admin#cco: senaste mailet ligger överst. Sortera på den
    // kanoniska tidsstämpeln i stället för att anta att varje hydrator levererar
    // samma inbördes ordning.
    var newestFirst = msgs.slice().sort(function (left, right) {
      var leftDate = messageDate(left);
      var rightDate = messageDate(right);
      var leftMs = leftDate ? leftDate.getTime() : 0;
      var rightMs = rightDate ? rightDate.getTime() : 0;
      return rightMs - leftMs;
    });
    var lastDay = null;
    var html = '';
    newestFirst.forEach(function (message) {
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
        '" data-v2-message-id="' +
        esc(text(message.messageId || message.graphMessageId)) +
        '">' +
        av +
        '<div>' +
        renderRichMessageBubble(message) +
        '<div class="msg-meta">' +
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
      try {
        global.URL.revokeObjectURL(url);
      } catch (_error) {
        /* best-effort */
      }
    });
    mailAssetObjectUrls = [];
    mailAssetUrlCache = {};
  }

  function resolveMailAssetUrl(url) {
    var source = text(url);
    if (
      !source ||
      !boundCtx ||
      !boundCtx.handlers ||
      typeof boundCtx.handlers.resolveMailAssetUrl !== 'function'
    ) {
      return Promise.reject(new Error('Bilagan kan inte öppnas i den här vyn.'));
    }
    if (mailAssetUrlCache[source]) return mailAssetUrlCache[source];
    var pending = Promise.resolve(boundCtx.handlers.resolveMailAssetUrl(source))
      .then(function (blobUrl) {
        var resolved = text(blobUrl);
        if (!resolved) throw new Error('Bilagan kunde inte läsas.');
        mailAssetObjectUrls.push(resolved);
        mailAssetUrlCache[source] = Promise.resolve(resolved);
        return resolved;
      })
      .catch(function (error) {
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
        Array.prototype.forEach.call(
          frameDoc.querySelectorAll('[data-v2-mail-asset-src]'),
          function (element) {
            var source = text(element.getAttribute('data-v2-mail-asset-src'));
            if (!source || element.getAttribute('data-v2-mail-asset-ready') === 'true') return;
            element.setAttribute('data-v2-mail-asset-ready', 'true');
            resolveMailAssetUrl(source)
              .then(function (blobUrl) {
                element.setAttribute('src', blobUrl);
                element.removeAttribute('data-v2-mail-asset-src');
                resizeRichMailFrame(frame);
              })
              .catch(function () {
                element.replaceWith(frameDoc.createTextNode('Bild kunde inte laddas.'));
                resizeRichMailFrame(frame);
              });
          }
        );
        resizeRichMailFrame(frame);
      };
      frame.addEventListener('load', hydrate, { once: true });
      hydrate();
    });
  }

  function attachmentForMessage(message, index) {
    var html = messageBodyHtml(message);
    return (
      attachmentCandidates(message).filter(function (attachment) {
        return !attachmentIsInline(attachment, message, html);
      })[index] || null
    );
  }

  var attachmentPreviewScriptPromises = {};
  var attachmentPdfJsPromise = null;
  var ATTACHMENT_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

  function attachmentPreviewKind(attachment) {
    var name = attachmentName(attachment);
    var type = attachmentType(attachment);
    var value = (name + ' ' + type).toLowerCase();
    if (attachmentIsImage(attachment)) return 'image';
    if (/\.pdf\b|application\/pdf/.test(value)) return 'pdf';
    if (/\.(docx?|odt)\b|wordprocessingml|msword/.test(value)) return 'word';
    if (/\.(xlsx?|xlsm|csv)\b|spreadsheetml|ms-excel|text\/csv/.test(value)) return 'excel';
    if (/\.(pptx?|odp)\b|presentationml|ms-powerpoint/.test(value)) return 'powerpoint';
    if (/^video\//.test(type) || /\.(mp4|webm|mov|m4v)\b/.test(value)) return 'video';
    if (/^audio\//.test(type) || /\.(mp3|wav|m4a|aac|ogg)\b/.test(value)) return 'audio';
    if (/text\//.test(type) || /\.(txt|log)\b/.test(value)) return 'text';
    return 'unknown';
  }

  function loadAttachmentPreviewScript(src, ready) {
    if (ready()) return Promise.resolve();
    if (attachmentPreviewScriptPromises[src]) return attachmentPreviewScriptPromises[src];
    attachmentPreviewScriptPromises[src] = new Promise(function (resolve, reject) {
      var script = doc.createElement('script');
      script.src = src;
      script.onload = function () {
        if (ready()) resolve();
        else reject(new Error('Biblioteket kunde inte startas.'));
      };
      script.onerror = function () {
        reject(new Error('Biblioteket kunde inte laddas.'));
      };
      doc.head.appendChild(script);
    }).catch(function (error) {
      delete attachmentPreviewScriptPromises[src];
      throw error;
    });
    return attachmentPreviewScriptPromises[src];
  }

  function loadAttachmentPreviewLibrary(kind) {
    if (kind === 'word') {
      return loadAttachmentPreviewScript('/vendor/office/mammoth.browser.min.js', function () {
        return Boolean(global.mammoth);
      }).then(function () {
        return global.mammoth;
      });
    }
    if (kind === 'excel') {
      return loadAttachmentPreviewScript('/vendor/office/xlsx.full.min.js', function () {
        return Boolean(global.XLSX);
      }).then(function () {
        return global.XLSX;
      });
    }
    if (kind === 'powerpoint') {
      return loadAttachmentPreviewScript('/vendor/office/jszip.min.js', function () {
        return Boolean(global.JSZip);
      }).then(function () {
        return global.JSZip;
      });
    }
    return Promise.reject(new Error('Filtypen stöds inte.'));
  }

  function loadAttachmentPreviewBlob(blobUrl) {
    return global
      .fetch(blobUrl)
      .then(function (response) {
        if (!response.ok) throw new Error('Bilagan kunde inte läsas.');
        return response.blob();
      })
      .then(function (blob) {
        if (blob.size > ATTACHMENT_PREVIEW_MAX_BYTES) {
          throw new Error('Filen är större än 25 MB och kan inte förhandsvisas.');
        }
        return blob;
      });
  }

  function renderAttachmentPdfPreview(stage, blobUrl) {
    if (!attachmentPdfJsPromise) {
      attachmentPdfJsPromise = import('/vendor/pdfjs/pdf.min.mjs').catch(function (error) {
        attachmentPdfJsPromise = null;
        throw error;
      });
    }
    return Promise.all([attachmentPdfJsPromise, loadAttachmentPreviewBlob(blobUrl)]).then(
      function (values) {
        var pdfjs = values[0];
        var blob = values[1];
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        return blob.arrayBuffer().then(function (data) {
          var loadingTask = pdfjs.getDocument({ data: data });
          return loadingTask.promise.then(function (pdf) {
            var pageNumber = 1;
            var scale = 1.2;
            var renderTask = null;
            stage.innerHTML =
              '<div class="v2-attachment-pdf"><div class="v2-attachment-pdf-toolbar">' +
              '<button type="button" data-v2-pdf-action="previous" aria-label="Föregående sida">‹</button>' +
              '<span data-v2-pdf-page>Laddar PDF…</span>' +
              '<button type="button" data-v2-pdf-action="next" aria-label="Nästa sida">›</button>' +
              '<button type="button" data-v2-pdf-action="zoom-out" aria-label="Zooma ut">−</button>' +
              '<button type="button" data-v2-pdf-action="zoom-in" aria-label="Zooma in">+</button>' +
              '</div><div class="v2-attachment-pdf-canvas"><canvas></canvas></div></div>';
            var canvas = stage.querySelector('canvas');
            var pageLabel = stage.querySelector('[data-v2-pdf-page]');
            var renderPage = function () {
              if (renderTask) renderTask.cancel();
              return pdf.getPage(pageNumber).then(function (page) {
                var viewport = page.getViewport({ scale: scale });
                var ratio = global.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * ratio);
                canvas.height = Math.floor(viewport.height * ratio);
                canvas.style.width = Math.floor(viewport.width) + 'px';
                canvas.style.height = Math.floor(viewport.height) + 'px';
                var context = canvas.getContext('2d');
                context.setTransform(ratio, 0, 0, ratio, 0, 0);
                renderTask = page.render({ canvasContext: context, viewport: viewport });
                return renderTask.promise
                  .catch(function (error) {
                    if (error && error.name !== 'RenderingCancelledException') throw error;
                  })
                  .then(function () {
                    renderTask = null;
                    pageLabel.textContent = 'Sida ' + pageNumber + ' av ' + pdf.numPages;
                  });
              });
            };
            stage
              .querySelector('.v2-attachment-pdf-toolbar')
              .addEventListener('click', function (event) {
                var action = event.target.closest('[data-v2-pdf-action]');
                if (!action) return;
                var name = action.getAttribute('data-v2-pdf-action');
                if (name === 'previous' && pageNumber > 1) pageNumber -= 1;
                if (name === 'next' && pageNumber < pdf.numPages) pageNumber += 1;
                if (name === 'zoom-in') scale = Math.min(3, scale + 0.2);
                if (name === 'zoom-out') scale = Math.max(0.5, scale - 0.2);
                void renderPage();
              });
            var dialog = stage.closest('[data-v2-attachment-preview]');
            if (dialog) {
              dialog._attachmentPreviewCleanup = function () {
                if (renderTask) renderTask.cancel();
                loadingTask.destroy();
              };
            }
            return renderPage();
          });
        });
      }
    );
  }

  function renderAttachmentOfficePreview(stage, blobUrl, kind) {
    return Promise.all([
      loadAttachmentPreviewLibrary(kind),
      loadAttachmentPreviewBlob(blobUrl),
    ]).then(function (values) {
      var library = values[0];
      var blob = values[1];
      return blob.arrayBuffer().then(function (buffer) {
        if (kind === 'word') {
          return library.convertToHtml({ arrayBuffer: buffer }).then(function (result) {
            stage.innerHTML =
              '<article class="v2-attachment-office">' +
              (sanitizeMailHtmlForDisplay(result.value || '') ||
                '<p>Dokumentet saknar synligt innehåll.</p>') +
              '</article>';
          });
        }
        if (kind === 'excel') {
          var workbook = library.read(buffer, { type: 'array', cellDates: true });
          var names = workbook.SheetNames.slice(0, 30);
          if (!names.length) throw new Error('Arbetsboken innehåller inga blad.');
          stage.innerHTML =
            '<div class="v2-attachment-sheet-tabs">' +
            names
              .map(function (name, index) {
                return (
                  '<button type="button" data-v2-sheet-index="' +
                  index +
                  '"' +
                  (index === 0 ? ' class="active"' : '') +
                  '>' +
                  esc(name) +
                  '</button>'
                );
              })
              .join('') +
            '</div><div class="v2-attachment-office" data-v2-sheet-content></div>';
          var renderSheet = function (index) {
            var content = stage.querySelector('[data-v2-sheet-content]');
            if (content)
              content.innerHTML = sanitizeMailHtmlForDisplay(
                library.utils.sheet_to_html(workbook.Sheets[names[index]])
              );
            Array.prototype.forEach.call(
              stage.querySelectorAll('[data-v2-sheet-index]'),
              function (button) {
                button.classList.toggle(
                  'active',
                  Number(button.getAttribute('data-v2-sheet-index')) === index
                );
              }
            );
          };
          stage
            .querySelector('.v2-attachment-sheet-tabs')
            .addEventListener('click', function (event) {
              var button = event.target.closest('[data-v2-sheet-index]');
              if (button) renderSheet(Number(button.getAttribute('data-v2-sheet-index')));
            });
          renderSheet(0);
          return null;
        }
        return library.loadAsync(buffer).then(function (archive) {
          var slides = Object.keys(archive.files)
            .filter(function (path) {
              return /^ppt\/slides\/slide\d+\.xml$/i.test(path);
            })
            .sort(function (left, right) {
              return Number(left.match(/slide(\d+)/i)[1]) - Number(right.match(/slide(\d+)/i)[1]);
            })
            .slice(0, 100);
          if (!slides.length) throw new Error('Presentationens bilder kunde inte läsas.');
          return Promise.all(
            slides.map(function (path, index) {
              return archive
                .file(path)
                .async('text')
                .then(function (xml) {
                  var parsed = new global.DOMParser().parseFromString(xml, 'application/xml');
                  var texts = Array.prototype.map
                    .call(parsed.getElementsByTagName('a:t'), function (node) {
                      return text(node.textContent);
                    })
                    .filter(Boolean);
                  var title = texts.shift() || 'Bild ' + (index + 1);
                  var slideNumber = path.match(/slide(\d+)\.xml$/i);
                  var relationshipPath = slideNumber
                    ? 'ppt/slides/_rels/slide' + slideNumber[1] + '.xml.rels'
                    : '';
                  var relationshipFile = relationshipPath && archive.file(relationshipPath);
                  var imageRelations = relationshipFile
                    ? relationshipFile.async('text').then(function (relationshipXml) {
                        var relationshipDocument = new global.DOMParser().parseFromString(
                          relationshipXml,
                          'application/xml'
                        );
                        var relationships = {};
                        Array.prototype.forEach.call(
                          relationshipDocument.getElementsByTagName('Relationship'),
                          function (node) {
                            relationships[node.getAttribute('Id')] = text(
                              node.getAttribute('Target')
                            );
                          }
                        );
                        return Promise.all(
                          Array.prototype.slice
                            .call(parsed.getElementsByTagName('a:blip'), 0, 20)
                            .map(function (node) {
                              var target = relationships[node.getAttribute('r:embed')];
                              if (!target) return '';
                              var mediaPath =
                                target.indexOf('../') === 0
                                  ? 'ppt/' + target.slice(3)
                                  : 'ppt/slides/' + target;
                              var media = archive.file(mediaPath);
                              if (!media) return '';
                              var extension = mediaPath.split('.').pop().toLowerCase();
                              var mime = {
                                png: 'image/png',
                                jpg: 'image/jpeg',
                                jpeg: 'image/jpeg',
                                gif: 'image/gif',
                                webp: 'image/webp',
                                svg: 'image/svg+xml',
                              }[extension];
                              if (!mime) return '';
                              return media.async('base64').then(function (data) {
                                return (
                                  '<img src="data:' +
                                  mime +
                                  ';base64,' +
                                  data +
                                  '" alt="Bild från presentationssida ' +
                                  (index + 1) +
                                  '">'
                                );
                              });
                            })
                        );
                      })
                    : Promise.resolve([]);
                  return imageRelations.then(function (images) {
                    var textMarkup = texts
                      .map(function (value) {
                        return '<p>' + esc(value) + '</p>';
                      })
                      .join('');
                    return (
                      '<section class="v2-attachment-slide"><h3>' +
                      esc(title) +
                      '</h3>' +
                      images.join('') +
                      (textMarkup || (!images.length ? '<p>Ingen text på bilden.</p>' : '')) +
                      '</section>'
                    );
                  });
                });
            })
          ).then(function (slidesHtml) {
            stage.innerHTML = '<div class="v2-attachment-slides">' + slidesHtml.join('') + '</div>';
          });
        });
      });
    });
  }

  function closeAttachmentPreview() {
    var backdrop = root && root.querySelector('[data-v2-attachment-preview]');
    if (!backdrop) return;
    if (typeof backdrop._attachmentPreviewCleanup === 'function') {
      backdrop._attachmentPreviewCleanup();
    }
    backdrop.remove();
  }

  function openAttachmentPreview(message, attachment) {
    if (!attachment || !root) return;
    var url = attachmentUrl(attachment, message);
    if (!url) return;
    closeAttachmentPreview();
    var name = attachmentName(attachment);
    var kind = attachmentPreviewKind(attachment);
    var backdrop = doc.createElement('div');
    backdrop.setAttribute('data-v2-attachment-preview', '');
    backdrop.className = 'v2-attachment-backdrop';
    backdrop.innerHTML =
      '<section class="v2-attachment-dialog" role="dialog" aria-modal="true" aria-label="Förhandsvisning av ' +
      esc(name) +
      '">' +
      '<header><strong>' +
      esc(name) +
      '</strong><button type="button" data-v2-attachment-close aria-label="Stäng">×</button></header>' +
      '<div class="v2-attachment-stage" data-v2-attachment-stage>Laddar bilagan…</div>' +
      '<footer><a data-v2-attachment-download href="#" download="' +
      esc(name) +
      '">Ladda ner</a></footer></section>';
    root.appendChild(backdrop);
    resolveMailAssetUrl(url)
      .then(function (blobUrl) {
        var stage = backdrop.querySelector('[data-v2-attachment-stage]');
        var download = backdrop.querySelector('[data-v2-attachment-download]');
        if (download) download.setAttribute('href', blobUrl);
        if (!stage) return;
        if (kind === 'image') {
          stage.innerHTML = '<img src="' + esc(blobUrl) + '" alt="' + esc(name) + '">';
        } else if (kind === 'pdf') {
          return renderAttachmentPdfPreview(stage, blobUrl);
        } else if (kind === 'word' || kind === 'excel' || kind === 'powerpoint') {
          stage.innerHTML = '<p>Öppnar dokumentet…</p>';
          return renderAttachmentOfficePreview(stage, blobUrl, kind);
        } else if (kind === 'video') {
          stage.innerHTML =
            '<video src="' + esc(blobUrl) + '" controls playsinline preload="none"></video>';
        } else if (kind === 'audio') {
          stage.innerHTML = '<audio src="' + esc(blobUrl) + '" controls preload="none"></audio>';
        } else if (kind === 'text') {
          stage.innerHTML =
            '<iframe src="' + esc(blobUrl) + '" sandbox="" title="' + esc(name) + '"></iframe>';
        } else {
          stage.innerHTML =
            '<p>Ingen inbyggd förhandsvisning för filtypen.</p><p>Ladda ner originalfilen.</p>';
        }
      })
      .catch(function (error) {
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
      '<aside class="lane-sidebar" role="navigation" aria-label="Köfält">' +
      '<div class="v2-mailbox-controls v2-mailbox-controls--sidebar" data-v2-mailboxes></div>' +
      '<div data-v2-lanes></div></aside>' +
      '<aside class="inbox-shell"><div class="inbox-kicker">Inkorg</div>' +
      '<h2 class="inbox-h2" data-v2-inbox-h2></h2>' +
      '<div class="v2-mailbox-summary" data-v2-mailbox-summary></div>' +
      '<div class="v2-mailbox-controls v2-mailbox-controls--compact" data-v2-mailboxes-compact></div>' +
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
      var needsReply = lane.filter(function (thread) {
        return thread && thread.needsReply === true;
      }).length;
      var history = selectedMailboxHistory(ctx, mailboxHistoryById(ctx));
      h2.textContent = [
        counts.olasta + ' oläst',
        needsReply + ' behöver svar',
        lane.length + ' trådar',
        history.messageCount + ' mail',
      ].join(' · ');
    }
    renderMailboxSummary(ctx);
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

  function mailboxKey(value) {
    return text(value).trim().toLowerCase();
  }

  function mailboxHistoryById(ctx) {
    var history = {};
    (ctx.mailboxMetrics || []).forEach(function (metric) {
      var id = mailboxKey(metric && metric.mailboxId);
      if (!id) return;
      history[id] = {
        inboxCount: Number(metric.inboxCount) || 0,
        sentCount: Number(metric.sentCount) || 0,
        messageCount: Number(metric.messageCount) || 0,
      };
    });
    return history;
  }

  function selectedMailboxHistory(ctx, historyById) {
    var selected = {};
    var history = historyById || mailboxHistoryById(ctx);
    (ctx.selectedMailboxIds || []).forEach(function (id) {
      selected[mailboxKey(id)] = true;
    });
    return Object.keys(selected).reduce(
      function (total, id) {
        var metric = history[id];
        if (!metric) return total;
        total.inboxCount += metric.inboxCount;
        total.sentCount += metric.sentCount;
        total.messageCount += metric.messageCount;
        return total;
      },
      { inboxCount: 0, sentCount: 0, messageCount: 0 }
    );
  }

  function renderMailboxSummary(ctx) {
    var el = root.querySelector('[data-v2-mailbox-summary]');
    if (!el) return;
    var selected = {};
    (ctx.selectedMailboxIds || []).forEach(function (id) {
      selected[mailboxKey(id)] = true;
    });
    var selectedCount = (ctx.mailboxes || []).filter(function (mailbox) {
      return selected[mailboxKey(mailbox.id)];
    }).length;
    if (!selectedCount) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<span class="v2-mailbox-summary-total">Inkorg + Skickat · hela historiken</span>';
  }

  function renderMailboxControls(ctx) {
    var selectedMailboxIds = (ctx.selectedMailboxIds || []).map(text).filter(Boolean);
    var selectedSet = {};
    selectedMailboxIds.forEach(function (id) {
      selectedSet[mailboxKey(id)] = true;
    });
    var mailboxes = ctx.mailboxes || [];
    var history = mailboxHistoryById(ctx);
    var selectedCount = mailboxes.filter(function (mailbox) {
      return selectedSet[mailboxKey(mailbox.id)];
    }).length;
    var html =
      '<div class="v2-control-kicker">Brevlådor</div>' +
      '<div class="v2-mailbox-menu" role="group" aria-label="Välj brevlådor">' +
      '<div class="v2-mailbox-menu-heading"><span>Valda konton</span><strong>' +
      selectedCount +
      '/' +
      mailboxes.length +
      '</strong></div>' +
      '<div class="v2-mailbox-list">' +
      mailboxes
        .map(function (mailbox) {
          var id = mailboxKey(mailbox.id);
          var isSelected = Boolean(selectedSet[id]);
          var metric = history[id];
          var historyLabel = metric
            ? metric.inboxCount + ' ink. · ' + metric.sentCount + ' skick.'
            : 'Historik laddas…';
          return (
            '<label class="v2-mailbox-option v2-mailbox-option--' +
            mailboxTone(mailbox) +
            (isSelected ? ' active' : '') +
            '">' +
            '<input type="checkbox" data-v2-mailbox="' +
            esc(mailbox.id) +
            '"' +
            (isSelected ? ' checked' : '') +
            ' />' +
            '<span class="v2-mailbox-check" aria-hidden="true">✓</span>' +
            '<span class="v2-mailbox-copy"><span>' +
            esc(mailbox.label || mailbox.email || mailbox.id) +
            '</span>' +
            '<small>' +
            esc(historyLabel) +
            '</small></span>' +
            '</label>'
          );
        })
        .join('') +
      '</div></div>';
    var controls = root.querySelectorAll('[data-v2-mailboxes], [data-v2-mailboxes-compact]');
    for (var index = 0; index < controls.length; index++) {
      controls[index].innerHTML = html;
    }
  }

  function renderFolderControls() {
    var el = root.querySelector('[data-v2-folders]');
    if (!el) return;
    el.innerHTML =
      '<button class="v2-folder' +
      (activeFolder === 'inbox' ? ' active' : '') +
      '" data-v2-folder="inbox" type="button">Inkorg</button>' +
      '<button class="v2-folder' +
      (activeFolder === 'sent' ? ' active' : '') +
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

  // Signatur över allt en inbox-rad ritar UTOM markering/oläst/bulkval — de
  // reconcile:as live. Ändras inget av detta (vilket det aldrig gör vid ett
  // trådklick) tas snabbvägen och listans DOM byggs inte om.
  function inboxRowContentSig(thread) {
    var tags = tagsFor(thread);
    var sla = slaOf(thread);
    return [
      threadConversationKey(thread),
      sourceKey(thread),
      avatarBg(thread),
      initials(thread),
      threadName(thread),
      whenLabel(thread),
      text(thread.subject),
      text(thread.preview),
      tags
        .map(function (tag) {
          return tag.kind + ':' + tag.label;
        })
        .join(','),
      sla ? sla.tone + ':' + sla.label : '',
    ].join('');
  }

  function inboxRowHtml(thread, selectedId) {
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
  }

  // Native-mail-snabbväg: vid ett trådklick ändras bara markeringen, inte
  // radernas innehåll. Flytta då bara active/oläst/bulkval-klasserna på de
  // befintliga rad-noderna i stället för att riva och bygga om hela listans
  // DOM (upp till 120 rader, dubbelt per klick efter hydrering).
  function reconcileInboxSelection(el, renderedList, selectedId) {
    var byId = {};
    renderedList.forEach(function (thread) {
      byId[threadConversationKey(thread)] = thread;
    });
    var rows = el.querySelectorAll('[data-thread-id]');
    Array.prototype.forEach.call(rows, function (row) {
      var id = row.getAttribute('data-thread-id');
      var thread = byId[id];
      if (!thread) return;
      row.classList.toggle('active', Boolean(id) && id === selectedId);
      row.classList.toggle('thread-unread', isUnread(thread));
      var isSel = Boolean(selected[id]);
      row.classList.toggle('is-selected', isSel);
      var box = row.querySelector('[data-thread-select]');
      if (box) {
        box.setAttribute('aria-checked', isSel ? 'true' : 'false');
        box.textContent = isSel ? '✓' : '';
      }
    });
  }

  function buildInboxRowNode(thread, selectedId, sig) {
    var temp = doc.createElement('div');
    temp.innerHTML = inboxRowHtml(thread, selectedId);
    var card = temp.firstElementChild;
    if (card) card.__v2RowSig = typeof sig === 'string' ? sig : inboxRowContentSig(thread);
    return card;
  }

  // Virtualiserings-parametrar — portade från admin#cco:s lit-switchover.js.
  // Över tröskeln renderas bara det synliga fönstret (+ overscan) i DOM, med
  // höjd-satta spacers ovanför/nedanför så scrollen ser hela listan. Det är
  // det som låter admin bära alla 8 konton utan att frysa; V2 saknade det.
  var INBOX_VIRTUALIZE_THRESHOLD = 60;
  var INBOX_OVERSCAN = 6;
  var INBOX_MIN_WINDOW = 30; // golv innan layout gett clientHeight
  // Raderna har GARANTERAD fast höjd via CSS (#cco-conv-v2-root .thread{height})
  // så virtualiseringen slipper mäta varje rad — precis som admin#cco:s
  // lit-switchover (fasta 88px-kort). Konstanterna = CSS-höjd + rad-margin och
  // MÅSTE följa cco-conversations-v2.css. Compact-läget döljer preview och
  // krymper raden, så höjden väljs efter densitet.
  var INBOX_ROW_H_COMFORTABLE = 95; // .thread height 92 + margin-bottom 3
  var INBOX_ROW_H_COMPACT = 55; // compact .thread height 54 + margin-bottom 1

  function currentInboxRowHeight() {
    try {
      var density = root && root.dataset ? root.dataset.density : '';
      return density === 'compact' ? INBOX_ROW_H_COMPACT : INBOX_ROW_H_COMFORTABLE;
    } catch (_e) {
      return INBOX_ROW_H_COMFORTABLE;
    }
  }

  function computeInboxVisibleRange(total, scrollTop, clientHeight, rowH) {
    if (total <= 0) return { start: 0, end: 0 };
    var h = rowH > 0 ? rowH : INBOX_ROW_H_COMFORTABLE;
    var start = Math.max(0, Math.floor((scrollTop || 0) / h) - INBOX_OVERSCAN);
    var vis = Math.ceil((clientHeight || 0) / h) + INBOX_OVERSCAN * 2;
    var windowCount = Math.max(vis, INBOX_MIN_WINDOW);
    var end = Math.min(total, start + windowCount);
    return { start: start, end: end };
  }

  function ensureInboxScaffold(el) {
    var mount = el.querySelector('[data-v2-inbox-mount]');
    if (el.__v2InboxScaffold && mount) return mount;
    var top = doc.createElement('div');
    top.setAttribute('data-v2-inbox-spacer-top', '');
    top.style.cssText = 'width:100%;height:0;flex-shrink:0;pointer-events:none;';
    mount = doc.createElement('div');
    mount.setAttribute('data-v2-inbox-mount', '');
    mount.style.cssText = 'width:100%;';
    var bot = doc.createElement('div');
    bot.setAttribute('data-v2-inbox-spacer-bottom', '');
    bot.style.cssText = 'width:100%;height:0;flex-shrink:0;pointer-events:none;';
    el.replaceChildren(top, mount, bot);
    el.__v2InboxScaffold = true;
    return mount;
  }

  // Keyed inkrementell reconcile (admin#cco:s renderQueueHistoryList-mönster):
  // återanvänd befintliga rad-noder per data-thread-id, patcha bara nya/ändrade,
  // ta bort de som lämnat fönstret och håll ordningen.
  function reconcileInboxRows(mount, rows, selectedId) {
    var existingRows = Array.prototype.slice.call(mount.querySelectorAll('[data-thread-id]'));
    var existingMap = {};
    existingRows.forEach(function (node) {
      existingMap[node.getAttribute('data-thread-id')] = node;
    });
    var wanted = {};
    rows.forEach(function (thread) {
      wanted[threadConversationKey(thread)] = true;
    });
    existingRows.forEach(function (node) {
      if (!wanted[node.getAttribute('data-thread-id')]) node.remove();
    });
    var prev = null;
    rows.forEach(function (thread) {
      var id = threadConversationKey(thread);
      var sig = inboxRowContentSig(thread);
      var existing = existingMap[id];
      var node;
      if (existing && existing.__v2RowSig === sig) {
        node = existing;
      } else {
        if (existing) existing.remove();
        node = buildInboxRowNode(thread, selectedId, sig);
      }
      if (!node) return;
      if (prev) {
        if (prev.nextElementSibling !== node) prev.after(node);
      } else if (mount.firstElementChild !== node) {
        mount.prepend(node);
      }
      prev = node;
    });
  }

  // Vilken behållare scrollar faktiskt? Scrollmodellen följer LAYOUT-BREAKPOINTEN
  // — samma signal som CSS:en byter på — inte element-mått. Vid ≤768px sätts
  // .inbox-shell till max-height:none → listan växer och SIDAN scrollar; däröver
  // (inkl. surfplatta 769–1024) är .inbox-shell höjd-bounded och .inbox-list
  // scrollar internt.
  //
  // Avgör INTE via `scrollHeight > clientHeight`: virtualiseringens bottom-spacer
  // gör alltid .inbox-list:s scrollHeight större än clientHeight, även på mobil
  // där sidan scrollar — det valde felaktigt intern-grenen och läste scrollTop=0.
  function inboxScrollMetrics(el) {
    var pageScroll = false;
    try {
      pageScroll = Boolean(isMobileViewport());
    } catch (_e) {
      pageScroll = false;
    }
    if (!pageScroll) {
      // Desktop/surfplatta: .inbox-list är den bounded interna scroll-containern.
      return { scrollTop: el.scrollTop || 0, clientHeight: el.clientHeight || 0 };
    }
    // Mobil: sidan scrollar → räkna fönstret ur listans position i viewporten.
    var rect =
      typeof el.getBoundingClientRect === 'function'
        ? el.getBoundingClientRect()
        : { top: 0, bottom: 0, height: 0 };
    var vh = (global.visualViewport && global.visualViewport.height) || global.innerHeight || 0;
    var scrollTop = Math.max(0, -(rect.top || 0));
    var visibleBottom = Math.min(vh, rect.bottom || 0);
    var visibleTop = Math.max(0, rect.top || 0);
    var clientHeight = Math.max(0, visibleBottom - visibleTop) || vh;
    return { scrollTop: scrollTop, clientHeight: clientHeight };
  }

  function paintInboxWindow(el, list, selectedId, fromScroll) {
    var mount = ensureInboxScaffold(el);
    var total = list.length;
    var rowH = currentInboxRowHeight();
    var virtual = total > INBOX_VIRTUALIZE_THRESHOLD;
    el.__v2InboxVirtual = virtual;

    var metrics = inboxScrollMetrics(el);
    var range = virtual
      ? computeInboxVisibleRange(total, metrics.scrollTop, metrics.clientHeight, rowH)
      : { start: 0, end: total };

    // Radhöjden kan ha ändrats (densitetsbyte) även om fönstret är detsamma —
    // hoppa bara över om BÅDE range och radhöjd är oförändrade.
    if (
      fromScroll &&
      el.__v2Range &&
      el.__v2Range.start === range.start &&
      el.__v2Range.end === range.end &&
      el.__v2RowH === rowH
    ) {
      return;
    }
    el.__v2Range = range;
    el.__v2RowH = rowH;

    var slice = list.slice(range.start, range.end);
    reconcileInboxRows(mount, slice, selectedId);

    // Spacers bär de off-screen radernas höjd. Eftersom varje rad har fast höjd
    // gäller invarianten topp + fönster*rowH + botten === total*rowH, så
    // scrollpositionen driver aldrig och sista tråden nås utan hopp.
    var top = el.querySelector('[data-v2-inbox-spacer-top]');
    var bot = el.querySelector('[data-v2-inbox-spacer-bottom]');
    if (top) top.style.height = range.start * rowH + 'px';
    if (bot) bot.style.height = Math.max(0, total - range.end) * rowH + 'px';

    reconcileInboxSelection(mount, slice, selectedId);
  }

  function rewindowInbox(el) {
    if (!el || !el.__v2InboxState) return;
    paintInboxWindow(el, el.__v2InboxState.list, el.__v2InboxState.selectedId, true);
  }

  function attachInboxScrollListener(el) {
    if (el.__v2InboxScrollBound) return;
    el.__v2InboxScrollBound = true;
    var ticking = false;
    var onScroll = function () {
      if (!el.__v2InboxVirtual || !el.__v2InboxState) return;
      if (ticking) return;
      ticking = true;
      var run = function () {
        ticking = false;
        rewindowInbox(el);
      };
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(run);
      } else {
        // Ingen rAF (t.ex. test/headless) → kör synkront. Throttlas ändå av
        // ticking-flaggan per event-loop-varv.
        run();
      }
    };
    // Desktop: .inbox-list scrollar internt.
    el.addEventListener('scroll', onScroll, { passive: true });
    // Mobil: sidan/fönstret scrollar (inbox-shell max-height:none) → lyssna på
    // fönster-scroll också, annars fastnar fönstret på första sidan. Samma
    // onScroll räknar om metrics ur listans viewport-position.
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('scroll', onScroll, { passive: true });
      global.addEventListener(
        'resize',
        function () {
          if (el.__v2InboxVirtual) rewindowInbox(el);
        },
        { passive: true }
      );
    }
  }

  function renderInbox(ctx) {
    var el = root.querySelector('[data-v2-inbox]');
    if (!el) return;
    var list = visibleThreads(ctx);
    if (!list.length) {
      // Empty/skeleton/error: riv scaffold-läget så nästa lista bygger om.
      el.__v2InboxScaffold = false;
      el.__v2InboxState = null;
      el.__v2Range = null;
      if (ctx.loading) {
        el.innerHTML = new Array(6).fill('<div class="v3-skel v3-skel-row"></div>').join('');
        return;
      }
      if (ctx.authRequired) {
        el.innerHTML =
          '<div class="inbox-empty">Logga in igen i admin för att läsa CCO-inkorgen.</div>';
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
    // Spara aktuell lista/urval så scroll-handlern kan om-fönstra utan att räkna
    // om visibleThreads.
    el.__v2InboxState = { list: list, selectedId: selectedId };
    attachInboxScrollListener(el);
    paintInboxWindow(el, list, selectedId, false);
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
    // handoffAvailable behålls som testbarhetssignal (bookingPatientId nedan);
    // knapparna disablas INTE längre — Bokning/Kalender/Dossier är alltid
    // klickbara som admin#cco:s bubblor. Panelen sköter kundvalet; obekräftad
    // patient auto-låses aldrig (se buildLauncherThreadContext).
    var handoffAvailable = thread.v2Handoff && thread.v2Handoff.available === true;
    // Testbarhetsmarkörer kommer endast från appens redan autentiserade,
    // valda trådkontext. De ändrar inte interaktionen eller handoff-logiken.
    var testability =
      thread.v2Testability && typeof thread.v2Testability === 'object' ? thread.v2Testability : {};
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
      '<button class="nav-btn" type="button" data-v2-action="note"' +
      noteContextAttr +
      '>✎ Anteckna</button>' +
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
      '<button class="action-btn action-btn--booking" type="button" data-v2-action="booking"' +
      bookingContextAttr +
      '><span class="action-ico">📅</span><span>Bokningsyta</span></button>' +
      '<button class="action-btn action-btn--note" type="button" data-v2-action="note"' +
      noteContextAttr +
      '><span class="action-ico">📄</span><span>Smart anteckning</span></button>' +
      '<button class="action-btn action-btn--calendar" type="button" data-v2-action="calendar"><span class="action-ico">📆</span><span>Kalender</span></button>' +
      '<button class="action-btn" type="button" data-v2-action="handled"><span class="action-ico">✓</span><span>Markera klar</span></button>' +
      // Senare öppnar admin#cco:s panel (cco-senare-v3), inte ett-kliks-snooze.
      // Det är inget val vi gör här: PR 11 avgjorde det redan för legacy —
      // "reply_later körs först när användaren bekräftar snooze-tid i panelen
      // (inte ett-klicks-snooze från bottenknappen)". V2 hade en egen ett-kliks-
      // väg som satte uppföljning UTAN tid, vilket är en annan operation än den
      // operatören är van vid. Bulkfältet behåller ett-klick — en panel går inte
      // att fylla i för N trådar, och legacy har ingen bulkväg alls att bryta mot.
      '<button class="action-btn" type="button" data-v2-action="senare"><span class="action-ico">⌛</span><span>Senare</span></button>' +
      '<button class="action-btn" type="button" data-v2-action="reopen"><span class="action-ico">↩</span><span>Återöppna</span></button>' +
      moreMenu() +
      '</div>';
  }

  // "Mer"-menyn: de återstående admin#cco-panelerna som inte får plats i
  // huvud-actionbaren. Varje post öppnar EXAKT admin#cco:s panel via den delade
  // launchern (routas i app.js handlers.action → CCOBottomActions.run). Ingen
  // egen V2-parallell. Menyn är en enkel popover som togglas i klick-delegeringen.
  function closeMoreMenus() {
    if (!root) return;
    var open = root.querySelectorAll('[data-v2-more-menu]:not([hidden])');
    for (var i = 0; i < open.length; i++) {
      open[i].setAttribute('hidden', 'hidden');
      var wrap = open[i].parentNode;
      var toggle = wrap && wrap.querySelector('[data-v2-more-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }

  function moreMenu() {
    var items = [
      { action: 'makron', ico: '🧩', label: 'Makron' },
      { action: 'notiser', ico: '🔔', label: 'Notiser' },
      { action: 'skickat', ico: '📤', label: 'Skickat / kö' },
      // 'senarekopanel' borttagen: den öppnade SAMMA launcher-action ('senare')
      // som huvudknappen nu gör. Två ingångar till en panel är inte två val.
      { action: 'noshow', ico: '🚫', label: 'No-show' },
      { action: 'signering', ico: '✍️', label: 'Signering' },
      { action: 'portal', ico: '★', label: 'Portal' },
      { action: 'nyttmail', ico: '✉', label: 'Nytt mail' },
    ];
    var menuItems = items
      .map(function (it) {
        return (
          '<button class="v2-more-item" type="button" role="menuitem" data-v2-action="' +
          it.action +
          '" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:600;color:#3a3a44;cursor:pointer;text-align:left">' +
          '<span aria-hidden="true" style="width:18px;text-align:center">' +
          it.ico +
          '</span><span>' +
          esc(it.label) +
          '</span></button>'
        );
      })
      .join('');
    return (
      '<span class="v2-more-wrap" style="position:relative;display:inline-flex">' +
      '<button class="action-btn" type="button" data-v2-more-toggle aria-haspopup="true" aria-expanded="false"><span class="action-ico">⋯</span><span>Mer</span></button>' +
      '<div class="v2-more-menu" data-v2-more-menu hidden role="menu" style="position:absolute;bottom:calc(100% + 8px);right:0;z-index:60;display:flex;flex-direction:column;gap:2px;min-width:200px;padding:6px;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:14px;box-shadow:0 14px 34px rgba(60,50,40,0.22)">' +
      menuItems +
      '</div>' +
      '</span>'
    );
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
    // Bokning/Dossier-pillren är alltid klickbara (som admin#cco); ingen
    // handoff-grind. Obekräftad patient auto-låses aldrig (buildLauncherThreadContext).
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
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="booking">📅 Öppna bokning</button>' +
      '<button class="quick-pill" style="flex:1" type="button" data-v2-action="dossier">👤 Kunddossiér</button>' +
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
  function buildLauncherThreadContext(thread) {
    if (!thread) return null;
    var email = text(
      thread.customerEmail || thread.contactEmail || (thread.from && thread.from.address)
    );
    var mailbox = text(thread.mailboxId || thread.mailboxAddress || thread.mailboxLabel);
    // Nyans (fail-closed-anda utan att blockera): lås bara en BEKRÄFTAD patient
    // som customerId. Utan bekräftad handoff skickas e-post som sökhjälp —
    // panelen låter operatören välja/bekräfta kund, så vi agerar aldrig
    // automatiskt på en obekräftad patient (t.ex. bokar aldrig fel patient).
    var handoffConfirmed = thread.v2Handoff && thread.v2Handoff.available === true;
    var confirmedPatientId = handoffConfirmed
      ? text((thread.v2Testability && thread.v2Testability.bookingPatientId) || thread.customerId)
      : '';
    return {
      source: 'cco-conversations-v2',
      conversationKey: threadConversationKey(thread),
      customerName: text(thread.customerName) || threadName(thread),
      email: email,
      customerId: confirmedPatientId || email,
      // Kanoniskt patient-master-ID (resolverns exakta e-postmatch). Endast satt
      // vid bekräftad match — panelerna hämtar riktig kundpost på DETTA, aldrig
      // på customerId (som kan vara e-post) eller activeCustomerId-demofallbacken.
      patientId: confirmedPatientId,
      mailboxId: mailbox,
      mailboxSource: mailbox,
      subject: text(thread.subject),
      // Trådens riktiga meddelanden i launcherns form ({dir,time,body}).
      latestMessages: messageList(thread)
        .slice(-6)
        .map(function (message) {
          return {
            dir: isIncoming(message) ? 'incoming' : 'outgoing',
            time: text(message.sentAt || message.receivedAt || message.time || message.timestamp),
            body: messageBody(message),
          };
        }),
      threadSnippet: text(thread.preview),
    };
  }

  // Svarstudio öppnar admin#cco:s GODKÄNDA panel (svarstudio-v2.html) via den
  // delade launchern, med trådkontexten som preset så panelen slipper skrapa
  // legacy-DOM. Den tidigare inline-fallbacken (en egen workbench när launchern
  // inte hunnit laddas) är borttagen — inkopplingen är den enda vägen.
  function openSvarstudioPanel(thread) {
    var target = thread || (boundCtx && boundCtx.selected);
    if (!target) return;
    // Bara ÅTKOMSTEN till launchern guardas. Kontextbygget ligger utanför
    // try/catch med flit: ett fel där är en bugg och ska synas, inte sväljas.
    // (En för bred catch dolde en gång att buildLauncherThreadContext saknades.)
    var api = null;
    try {
      api = global.CCOBottomActions;
    } catch (_launcherAccessError) {
      api = null;
    }
    if (api && typeof api.run === 'function') {
      api.run('svarstudio', buildLauncherThreadContext(target));
      return;
    }
    // Ingen tyst stub: utan launcher failar panelvägen högt via app-handlern.
    if (boundCtx && typeof boundCtx.handlers.action === 'function') {
      boundCtx.handlers.action('studio', target);
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
      // Menyn ska stänga för varje klick utanför den, även när ett tidigare
      // klickflöde (t.ex. trådval) returnerar innan action-delen nedan.
      if (
        !event.target.closest('[data-v2-more-menu]') &&
        !event.target.closest('[data-v2-more-toggle]')
      ) {
        closeMoreMenus();
      }
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
        openSvarstudioPanel(boundCtx.selected);
        return;
      }
      if (
        event.target.closest('[data-v2-attachment-close]') ||
        event.target.matches('[data-v2-attachment-preview]')
      ) {
        closeAttachmentPreview();
        return;
      }
      var attachmentEl = event.target.closest('[data-v2-attachment-index]');
      if (attachmentEl && boundCtx && boundCtx.selected) {
        var messageId = text(attachmentEl.getAttribute('data-v2-message-id'));
        var message = messageList(boundCtx.selected).find(function (candidate) {
          return text(candidate && (candidate.messageId || candidate.graphMessageId)) === messageId;
        });
        var attachment =
          message &&
          attachmentForMessage(
            message,
            Number(attachmentEl.getAttribute('data-v2-attachment-index'))
          );
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
        // Radhöjden ändras med densiteten → om-fönstra virtualiseringen så
        // spacers matchar de nya raderna (annars driver scrollen).
        rewindowInbox(root.querySelector('[data-v2-inbox]'));
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
        inboxRenderLimit = INBOX_RENDER_STEP;
        selected = {}; // rensa urvalet vid flik-byte (vy-skopat)
        renderTabs(boundCtx);
        renderInbox(boundCtx);
        renderBulkBar();
        return;
      }
      var mailboxEl = event.target.closest('[data-v2-mailbox]');
      if (mailboxEl && boundCtx && typeof boundCtx.handlers.setMailboxScope === 'function') {
        var mailboxId = mailboxEl.getAttribute('data-v2-mailbox');
        var current = (boundCtx.selectedMailboxIds || []).map(text).filter(Boolean);
        var next = current.filter(function (id) {
          return id !== mailboxId;
        });
        if (next.length === current.length) {
          next.push(mailboxId);
        }
        // Ett tomt scope skulle återställa den gamla preferensen till alla
        // mailboxar. Behåll minst en aktiv mailbox i v2.
        if (!next.length) {
          if (mailboxEl.tagName === 'INPUT') mailboxEl.checked = true;
          return;
        }
        selected = {};
        boundCtx.handlers.setMailboxScope(next);
        return;
      }
      var loadMoreEl = event.target.closest('[data-v2-load-more]');
      if (loadMoreEl && boundCtx) {
        inboxRenderLimit += INBOX_RENDER_STEP;
        renderInbox(boundCtx);
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
      // ── "Mer"-meny (popover) ──
      var moreToggle = event.target.closest('[data-v2-more-toggle]');
      if (moreToggle) {
        var moreWrap = moreToggle.parentNode;
        var moreEl = moreWrap && moreWrap.querySelector('[data-v2-more-menu]');
        if (moreEl) {
          if (moreEl.hasAttribute('hidden')) {
            closeMoreMenus();
            moreEl.removeAttribute('hidden');
            moreToggle.setAttribute('aria-expanded', 'true');
          } else {
            moreEl.setAttribute('hidden', 'hidden');
            moreToggle.setAttribute('aria-expanded', 'false');
          }
        }
        return;
      }
      var actionEl = event.target.closest('[data-v2-action]');
      // Ett menyval öppnar sin panel via handlers.action nedan; stäng menyn.
      if (actionEl && actionEl.closest('[data-v2-more-menu]')) closeMoreMenus();
      if (actionEl && boundCtx) {
        var name = actionEl.getAttribute('data-v2-action');
        // Kunddossiér är en säker läs-/navigeringsaction och öppnar V12.
        // De persistenta trådactions hanteras av appens befintliga CCO-kontrakt.
        // Svarstudio har INGEN egen V2-väg längre: den routas via
        // handlers.action → CCOBottomActions.run('svarstudio'), dvs exakt
        // admin#cco:s panel — samma modell som de tolv övriga panelerna.
        if (name === 'dossier' && typeof boundCtx.handlers.openDossier === 'function') {
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
        rewindowInbox(root.querySelector('[data-v2-inbox]'));
      },
    });
    if (ctx.selected) {
      cmds.push({
        ico: '★',
        label: 'Öppna Svarstudio',
        grp: 'Tråd',
        run: function () {
          openSvarstudioPanel(ctx.selected);
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
    _computeInboxVisibleRange: computeInboxVisibleRange,
    _inboxVirtualizeThreshold: function () {
      return INBOX_VIRTUALIZE_THRESHOLD;
    },
    _currentInboxRowHeight: currentInboxRowHeight,
  };

  // Persistent kontext-provider för admin#cco:s panel-launcher. Launchern har
  // en inbyggd hook: getLiveConversationContext() läser
  // window.CCOLiveConversationContext.getContext(). När launcherns egna
  // re-entry-vägar (modal-flikar, tangentbord, cco:panel:action utan preset)
  // anropar openX utan kontext läser den denna i stället för att skrapa
  // legacy-DOM (som saknas i V2). getContext läser boundCtx.selected dynamiskt
  // så den alltid speglar V2:s aktuella tråd.
  try {
    global.CCOLiveConversationContext = {
      getContext: function () {
        return buildLauncherThreadContext(boundCtx && boundCtx.selected);
      },
    };
  } catch (_providerError) {
    /* ignore */
  }

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
