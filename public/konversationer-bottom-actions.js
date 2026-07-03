/* ─── Konversationer Bottom Actions — Sprint 18C.2 ─────────────────────
 * Workbench-modaler för Svarstudio + Smart anteckning,
 * inspirerade av gamla CCO Svarstudio-arbetsyta.
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ROLE = 'owner';
  const TENANT = 'hair_tp';

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) n.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function toast(msg, kind) {
    document.querySelectorAll('.k-bot-toast').forEach((n) => n.remove());
    const t = el('div', { class: 'k-bot-toast' }, msg);
    t.style.cssText = [
      'position:fixed',
      'top:24px',
      'right:24px',
      'z-index:99999',
      'padding:11px 16px',
      'border-radius:12px',
      'font:700 12px Inter,sans-serif',
      'box-shadow:0 18px 38px rgba(93,74,60,.18)',
      kind === 'err'
        ? 'background:linear-gradient(180deg,#f5d6d3,#e8b5b0);color:#8c2626;border:1px solid rgba(185,74,74,.32)'
        : 'background:linear-gradient(180deg,#d8ead9,#b8d8c5);color:#365422;border:1px solid rgba(74,130,104,.32)',
    ].join(';');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function activeCustomerId() {
    return document.body.dataset.activeCustomerId || window.__activeCustomerId || 'CUST-DEMO-002';
  }

  function getLiveConversationContext() {
    try {
      if (typeof window.CCOLiveConversationContext?.getContext !== 'function') return null;
      const context = window.CCOLiveConversationContext.getContext();
      return context && context.conversationKey ? context : null;
    } catch {
      return null;
    }
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonicalHairTpMailbox(value) {
    const text = cleanText(value).toLowerCase();
    const full = text.match(/[a-z0-9._%+-]+@hairtpclinic\.com\b/);
    if (full) return full[0];
    const partial = text.match(/[a-z0-9._%+-]+@hairtpclinic\b/);
    if (partial) return partial[0] + '.com';
    return text;
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanText(value));
  }

  function firstEmailValue(...values) {
    for (const value of values) {
      const text = cleanText(value);
      if (!text) continue;
      if (looksLikeEmail(text)) return text.toLowerCase();
      const embedded = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (embedded) return embedded[0].toLowerCase();
    }
    return '';
  }

  function isHairTpMailboxEmail(value) {
    const email = firstEmailValue(value) || canonicalHairTpMailbox(value);
    return /@hairtpclinic\.com$/i.test(email);
  }

  function firstCustomerEmailValue(...values) {
    for (const value of values) {
      const email = firstEmailValue(value);
      if (email && !isHairTpMailboxEmail(email)) return email;
    }
    return '';
  }

  function mailboxMatchValue(value) {
    return canonicalHairTpMailbox(value).replace(/\s+/g, '');
  }

  function findMailboxOption(mailboxes, ...candidates) {
    const targets = candidates.map(mailboxMatchValue).filter(Boolean);
    if (!targets.length) return null;
    return (
      mailboxes.find((mailbox) => {
        const values = [mailbox?.id, mailbox?.mailboxId, mailbox?.email, mailbox?.mailboxAddress]
          .map(mailboxMatchValue)
          .filter(Boolean);
        return targets.some((target) =>
          values.some(
            (value) =>
              value === target ||
              (value.includes('@') && target && value.startsWith(target + '@')) ||
              (target.includes('@') && value && target.startsWith(value + '@'))
          )
        );
      }) || null
    );
  }

  function formatMailboxOptionLabel(mailbox) {
    const email = canonicalHairTpMailbox(
      mailbox?.email || mailbox?.mailboxAddress || mailbox?.id || mailbox?.mailboxId
    );
    const rawName = cleanText(mailbox?.name);
    const nameEmail = canonicalHairTpMailbox(rawName);
    if (!email) return rawName;
    if (email.endsWith('@hairtpclinic.com')) return email;
    if (!rawName || nameEmail === email || firstEmailValue(rawName) === email) return email;
    return `${rawName} · ${email}`;
  }

  function selectedThreadText(selector) {
    return cleanText(document.querySelector(selector)?.textContent);
  }

  function activeInboxName() {
    const node =
      document.querySelector('.thread.active .thread-from') ||
      document.querySelector('.thread .thread-from');
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('.when').forEach((item) => item.remove());
    return cleanText(clone.textContent);
  }

  function activeMailboxLabel() {
    return canonicalHairTpMailbox(
      selectedThreadText('.thread-status-bar .status-pill--source') ||
        selectedThreadText('.thread.active .thread-tag--booking') ||
        selectedThreadText('.thread .thread-tag--booking') ||
        'contact@hairtpclinic.com'
    );
  }

  function visibleThreadMessages() {
    return Array.from(document.querySelectorAll('#messages .msg'))
      .map((node) => {
        const meta = cleanText(node.querySelector('.msg-meta')?.textContent);
        const parts = meta.split('·').map((part) => cleanText(part));
        const email = firstEmailValue(node.dataset.senderEmail, node.dataset.fromEmail, meta);
        return {
          dir: node.classList.contains('is-outgoing') ? 'outgoing' : 'incoming',
          from: parts[0] || '',
          time: parts[1] || '',
          mailboxId: parts[2] || activeMailboxLabel(),
          email,
          body: cleanText(node.querySelector('.msg-bubble')?.textContent),
        };
      })
      .filter((message) => message.body || message.from || message.time);
  }

  function getVisibleConversationContext() {
    const customerName =
      selectedThreadText('.ctx-name') ||
      activeInboxName() ||
      selectedThreadText('.thread-header-main h2').split('·').pop()?.trim() ||
      'Vald kund';
    const subject =
      selectedThreadText('.thread-header-main h2') ||
      selectedThreadText('.thread.active .thread-subj') ||
      selectedThreadText('.thread .thread-subj') ||
      'Konversation';
    const mailbox = activeMailboxLabel();
    const messages = visibleThreadMessages();
    const latestIncoming = [...messages].reverse().find((message) => message.dir !== 'outgoing');
    const threadNode =
      document.querySelector('.thread.active') || document.querySelector('.thread');
    const recipientEmail = firstCustomerEmailValue(
      threadNode?.dataset?.customerEmail,
      threadNode?.dataset?.email,
      selectedThreadText('.wb-contact-line'),
      latestIncoming?.email,
      latestIncoming?.from
    );
    return {
      source: 'visible-thread',
      conversationKey:
        document.querySelector('.thread.active')?.dataset?.conversationKey ||
        document.querySelector('.thread')?.dataset?.conversationKey ||
        'visible-thread',
      customerName,
      customerSub: selectedThreadText('.ctx-meta') || 'Konversation i CCO',
      avatar: selectedThreadText('.ctx-avatar') || customerName.slice(0, 1).toUpperCase(),
      email: recipientEmail,
      phone: '',
      mailboxId: mailbox,
      mailboxSource: mailbox,
      mailboxSourceNote: 'Källa hämtad från vald CCO-tråd',
      doNow: 'Svara nu',
      doNowSub: 'Svarstudio öppnad från vald konversation',
      ctaLabel: '',
      whyFocus: selectedThreadText('.ai-suggest-kicker') || 'Aktiv konversation',
      whyFocusSub:
        selectedThreadText('.ai-suggest-body') ||
        selectedThreadText('.thread.active .thread-preview'),
      agent: 'CCO',
      status: selectedThreadText('.thread-status-bar .status-pill--warning') || 'Behöver granskas',
      sla: selectedThreadText('.risk-badge-row [data-r="followup"]') || '—',
      priority: selectedThreadText('.risk-badge-row [data-r="high"]') || '—',
      churnRisk: '—',
      engagement: selectedThreadText('.ctx-meta') || '—',
      chips: [{ label: 'Live', ct: 'CCO' }],
      aiSummary: selectedThreadText('.ai-suggest-body') || '',
      nuI: 'Vald tråd',
      nuISub: subject,
      nextStep: 'Svara nu',
      nextStepSub: 'Utgå från meddelandena i vald tråd',
      waiting: selectedThreadText('.thread-status-bar .status-pill--warning') || '',
      waitingSub: '',
      subject: 'Re: ' + subject,
      threadDate: latestIncoming?.time || '',
      threadFrom: latestIncoming?.from || customerName,
      threadSnippet: latestIncoming?.body || selectedThreadText('.thread.active .thread-preview'),
      threadVia: 'via ' + mailbox,
      latestMessages: messages,
    };
  }

  function openSvarstudioForSelectedThread(presetContext) {
    return openSvarstudio(
      presetContext || getLiveConversationContext() || getVisibleConversationContext()
    );
  }

  async function auditStudioEvent(eventKind, detail) {
    try {
      await fetch('/api/v1/cco-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cco-role': ROLE, 'x-cco-tenant': TENANT },
        body: JSON.stringify({
          kind: eventKind,
          tenantId: TENANT,
          actor: 'staff',
          entityKind: 'svarstudio',
          detail: detail || {},
        }),
      });
    } catch {
      /* ignore */
    }
  }

  function openModal({ title, body, footer, wide, workbench, headChips, onClose } = {}) {
    document.querySelectorAll('.action-modal-backdrop').forEach((n) => n.remove());
    const backdrop = el('div', {
      class: 'action-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
    });
    const close = () => {
      backdrop.remove();
      if (onClose) onClose();
    };
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    const modalClasses = ['action-modal'];
    if (wide) modalClasses.push('action-modal--wide');
    if (workbench) modalClasses.push('action-modal--workbench');
    const modal = el('div', { class: modalClasses.join(' ') });

    const head = el('div', { class: 'action-modal-head' });
    const titleSpan = el('h3', {}, title || '');
    head.appendChild(titleSpan);
    if (headChips && headChips.length) {
      const chipWrap = el('div', { class: 'wb-head-chips' });
      for (const c of headChips) {
        chipWrap.appendChild(
          el('span', { class: 'wb-head-chip wb-head-chip--' + (c.kind || 'neutral') }, c.label)
        );
      }
      head.appendChild(chipWrap);
    }
    if (workbench) {
      const hideBtn = el(
        'button',
        {
          class: 'wb-hide-context-btn',
          type: 'button',
          onclick: () => modal.classList.toggle('is-context-hidden'),
        },
        'Dölj kontext'
      );
      head.appendChild(hideBtn);
    }
    head.appendChild(
      el('button', { class: 'action-modal-close', type: 'button', onclick: close }, '×')
    );
    modal.appendChild(head);

    if (body) {
      if (workbench) {
        modal.appendChild(body);
      } else {
        const bodyEl = el('div', { class: 'action-modal-body' });
        bodyEl.appendChild(body);
        modal.appendChild(bodyEl);
      }
    }
    if (footer) {
      const footEl = el('div', { class: workbench ? 'wb-footer' : 'action-modal-foot' });
      for (const b of footer) footEl.appendChild(b);
      modal.appendChild(footEl);
    }

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    return { backdrop, modal, close };
  }

  // ─── Konstanter ──────────────────────────────────────────────────────
  const RESPONSE_TRACKS = [
    { id: 'booking', label: 'Bokning' },
    { id: 'followup', label: 'Uppföljning' },
    { id: 'midmessage', label: 'Mellanbesked' },
    { id: 'medical', label: 'Medicinsk' },
    { id: 'pricing_trust', label: 'Pris/trygghet' },
    { id: 'admin', label: 'Admin' },
  ];
  const TONE_FILTERS = [
    { id: 'professional', label: 'Professionell' },
    { id: 'warm', label: 'Varm' },
    { id: 'solution', label: 'Lösningsfokus' },
    { id: 'decision', label: 'Beslutsstöd' },
  ];
  const REFINE_FILTERS = [
    { id: 'shorter', label: 'Kortare' },
    { id: 'sharper', label: 'Skarpare' },
  ];
  const SIGNATURES = [
    {
      id: 'fazli',
      label: 'Fazli',
      text: 'Med vänliga hälsningar,\n\nDr. Fazli · Medical Director\nHair TP Clinic\nSveavägen 42, 113 50 Stockholm\n08-555 123 45 · www.hairtpclinic.com',
    },
    {
      id: 'egzona',
      label: 'Egzona',
      text: 'Med vänliga hälsningar,\n\nEgzona M. · Customer Lead\nHair TP Clinic\nSveavägen 42, 113 50 Stockholm\n08-555 123 45 · www.hairtpclinic.com',
    },
    {
      id: 'contact',
      label: 'Kontakt',
      text: 'Med vänliga hälsningar,\n\nHair TP Clinic\nSveavägen 42, 113 50 Stockholm\n08-555 123 45 · contact@hairtpclinic.com',
    },
  ];

  function applySignatureToBody(currentBody, sigId) {
    const sig = SIGNATURES.find((s) => s.id === sigId);
    if (!sig) return currentBody;
    // Hitta befintlig signatur-divider och ersätt — annars append
    const SIG_DIVIDER = '\n\n— — — — —\n';
    const idx = currentBody.indexOf(SIG_DIVIDER);
    const baseBody = idx >= 0 ? currentBody.slice(0, idx) : currentBody.replace(/\s+$/, '');
    return baseBody + SIG_DIVIDER + sig.text;
  }
  const SNABBMALLAR = [
    { id: 'confirm_booking', label: 'Bekräfta bokning' },
    { id: 'suggest_times', label: 'Föreslå tider' },
    { id: 'send_pricing', label: 'Skicka prislista' },
    { id: 'ask_more_info', label: 'Be om info' },
  ];

  // PR 3 — makron/svarsmallar använder vald live-tråds kontext: kund
  // (customerName), ämne (subject) och senaste meddelanden (latestMessages).
  // Ren funktion — ingen DOM, ingen live-send.
  function macroFirstName(context) {
    const full = cleanText(context && context.customerName);
    // Placeholder-namn (från live-/visible-fallback) räknas som "inget namn".
    if (!full || /^(vald konversation|vald kund|okänd kund|kund)$/i.test(full)) return '';
    return full.split(/\s+/)[0];
  }
  function macroTopic(context) {
    const ctx = context || {};
    const raw = cleanText(ctx.subject)
      .replace(/^re:\s*/i, '')
      .trim();
    // Generiska ämnen ('Re: konversation' eller ämne = kundnamn) räknas som
    // tomma så makrot faller tillbaka på senaste meddelandet (PR 3-avsikten).
    const nameLower = cleanText(ctx.customerName).toLowerCase();
    const isGeneric =
      !raw || /^konversation(er)?$/i.test(raw) || (nameLower && raw.toLowerCase() === nameLower);
    if (!isGeneric) return raw;
    const messages = Array.isArray(ctx.latestMessages) ? ctx.latestMessages : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const snippet = cleanText(messages[i] && (messages[i].body || messages[i].snippet));
      if (snippet) return snippet.slice(0, 60);
    }
    return 'ditt ärende';
  }
  function buildMacroText(templateId, context) {
    const ctx = context || {};
    const first = macroFirstName(ctx);
    const greeting = first ? 'Hej ' + first + '!' : 'Hej!';
    const topic = macroTopic(ctx);
    const bodies = {
      confirm_booking:
        greeting +
        '\n\nTack för ditt meddelande om ' +
        topic +
        '. Vi bekräftar din bokning och återkommer med detaljerna. Hör av dig om du har några frågor.',
      suggest_times:
        greeting +
        '\n\nTack för ditt mejl gällande ' +
        topic +
        '. Vi har följande tider lediga – låt oss veta vilken som passar dig bäst:\n\n– \n– \n– ',
      send_pricing:
        greeting +
        '\n\nTack för din förfrågan om ' +
        topic +
        '. Här kommer prisinformationen du efterfrågade. Säg till om du vill boka en kostnadsfri konsultation.',
      ask_more_info:
        greeting +
        '\n\nTack för ditt meddelande om ' +
        topic +
        '. För att kunna hjälpa dig på bästa sätt behöver vi lite mer information:\n\n– \n– ',
    };
    return (
      bodies[templateId] || greeting + '\n\nTack för ditt meddelande. Vi återkommer inom kort.'
    );
  }

  let _mailboxesCache = null;
  async function loadMailboxes() {
    if (_mailboxesCache) return _mailboxesCache;
    try {
      const r = await fetch('/api/v1/cco-mailboxes', { headers: { 'x-cco-role': ROLE } });
      const j = await r.json();
      _mailboxesCache = Array.isArray(j?.mailboxes) ? j.mailboxes : [];
    } catch {
      _mailboxesCache = [];
    }
    return _mailboxesCache;
  }

  function chipBtn(label, opts) {
    opts = opts || {};
    const btn = el(
      'button',
      {
        type: 'button',
        class: 'wb-chip' + (opts.active ? ' is-active' : ''),
      },
      label
    );
    if (opts.onclick) btn.addEventListener('click', opts.onclick);
    return btn;
  }

  // ─── SVARSTUDIO — workbench layout ───────────────────────────────────
  async function openSvarstudio(presetContext) {
    const liveContext =
      presetContext || getLiveConversationContext() || getVisibleConversationContext();
    const customerId = liveContext?.customerId || activeCustomerId();
    auditStudioEvent('studio.opened', {
      customerId,
      conversationKey: liveContext?.conversationKey,
      source: liveContext?.source,
    });
    const storedMailboxes = await loadMailboxes();

    const ctx = liveContext || {
      customerName: 'Vald konversation',
      customerSub: 'Ingen tråd vald ännu',
      avatar: 'C',
      email: '',
      phone: '',
      mailboxSource: 'CCO',
      mailboxSourceNote: 'Välj en tråd i inkorgen',
      doNow: 'Svara nu',
      doNowSub: 'Välj en tråd och öppna Svarstudio igen',
      ctaLabel: '',
      whyFocus: 'Senaste händelsen i tråden',
      whyFocusSub: '',
      agent: 'Oägd',
      status: 'Behöver svar',
      sla: '—',
      priority: '—',
      churnRisk: '—',
      engagement: '—',
      chips: [{ label: 'CCO', ct: '0' }],
      aiSummary: '',
      nuI: 'Behöver svar',
      nuISub: '',
      nextStep: 'Svara nu',
      nextStepSub: '',
      waiting: '',
      waitingSub: '',
      threadDate: '',
      threadFrom: 'CCO',
      threadSnippet: 'Välj en konversation i inkorgen.',
      threadVia: '',
    };
    const contextMailboxes = Array.isArray(ctx.mailboxOptions)
      ? ctx.mailboxOptions
      : (Array.isArray(ctx.mailboxTrail) ? ctx.mailboxTrail : [ctx.mailboxSource || ctx.mailboxId])
          .filter(Boolean)
          .map((mailbox) => ({ id: mailbox, name: mailbox, email: mailbox }));
    const mailboxes = [...contextMailboxes, ...storedMailboxes].reduce((list, mailbox) => {
      const rawId = cleanText(mailbox?.id || mailbox?.mailboxId || mailbox?.email);
      const rawEmail = cleanText(mailbox?.email || mailbox?.mailboxAddress || rawId);
      const email = canonicalHairTpMailbox(rawEmail || rawId);
      const id = canonicalHairTpMailbox(rawId || email);
      if (!id || list.some((item) => item.id === id || item.email === email)) return list;
      list.push({ id, name: cleanText(mailbox?.name) || email.split('@')[0] || id, email });
      return list;
    }, []);
    if (!mailboxes.length) {
      mailboxes.push({
        id: 'contact@hairtpclinic.com',
        name: 'contact',
        email: 'contact@hairtpclinic.com',
      });
    }

    const preferredMailbox =
      findMailboxOption(
        mailboxes,
        ctx.mailboxId,
        ctx.mailboxSource,
        ctx.mailboxAddress,
        Array.isArray(ctx.mailboxTrail) ? ctx.mailboxTrail[0] : '',
        ctx.threadVia
      ) || mailboxes[0];
    const recipientEmail = firstCustomerEmailValue(
      ctx.email,
      ctx.customerEmail,
      ctx.replyTo,
      ctx.threadEmail,
      ctx.threadFromEmail
    );
    const recipientMissing = !recipientEmail;
    const recipientMissingMessage =
      'Mottagare saknas i vald tråd. Koppla kundmail eller välj en tråd med kundadress innan svar kan skickas.';

    const initialBody =
      'Hej ' +
      (ctx.customerName || '') +
      ',\n\nTack för ditt meddelande. Jag bekräftar gärna nästa steg för ' +
      (ctx.sla || 'kommande tid') +
      '.\n\nJag återkommer med en tydlig bekräftelse och det du behöver inför besöket.' +
      '\n\nHör gärna av dig om något behöver justeras.';
    const state = {
      mailboxId: preferredMailbox?.id || 'contact@hairtpclinic.com',
      signatureId: 'fazli',
      track: null,
      tone: null,
      refine: null,
      template: null,
      subject: ctx.subject || 'Re: ' + (ctx.customerName || 'konversation'),
      body: applySignatureToBody(initialBody, 'fazli'),
      draftId: null,
    };

    // ─── Vänster: kontextpanel ──────────────────────────────────────
    const contextPanel = el('aside', { class: 'workbench-context' });
    // Kund-card
    contextPanel.appendChild(
      el('div', { class: 'wb-customer-card' }, [
        el('div', { class: 'wb-avatar' }, ctx.avatar || (ctx.customerName || '?').slice(0, 1)),
        el('div', {}, [
          el('h4', { class: 'wb-customer-name' }, ctx.customerName || ''),
          el('p', { class: 'wb-customer-sub' }, ctx.customerSub || ''),
        ]),
      ])
    );
    // Kontakt
    if (ctx.email) {
      contextPanel.appendChild(
        el('div', { class: 'wb-contact-line' }, [el('span', { class: 'ico' }, '✉'), ctx.email])
      );
    }
    if (ctx.phone) {
      contextPanel.appendChild(
        el('div', { class: 'wb-contact-line' }, [el('span', { class: 'ico' }, '☎'), ctx.phone])
      );
    }
    // KÄLLA LÅST
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, '🔒 Källa låst'),
        el('div', {}, [
          el('span', { style: 'font-weight:700' }, ctx.mailboxSource || ''),
          ' ',
          el('span', { style: 'color:#84756b;font-size:11px' }, ctx.mailboxSourceNote || ''),
        ]),
      ])
    );
    // GÖR DETTA NU
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, '⚠ Gör detta nu'),
        el('h4', { class: 'wb-section-title' }, ctx.doNow || ''),
        el('p', { class: 'wb-section-sub' }, ctx.doNowSub || ''),
      ])
    );
    if (ctx.ctaLabel) {
      contextPanel.appendChild(
        el(
          'button',
          {
            class: 'wb-cta-btn',
            type: 'button',
            onclick: () => toast('+ ' + ctx.ctaLabel),
          },
          '+ ' + ctx.ctaLabel
        )
      );
    }
    // VARFÖR I FOKUS
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, '◆ Varför i fokus'),
        el('h4', { class: 'wb-section-title' }, ctx.whyFocus || ''),
        el('p', { class: 'wb-section-sub' }, ctx.whyFocusSub || ''),
      ])
    );
    // FACT-GRID
    contextPanel.appendChild(
      el('div', { class: 'wb-fact-grid' }, [
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'Agent'),
          el('span', { class: 'wb-fact-val' }, ctx.agent || ''),
        ]),
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'Status'),
          el('span', { class: 'wb-fact-val' }, ctx.status || ''),
        ]),
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'SLA'),
          el('span', { class: 'wb-fact-val' }, ctx.sla || ''),
        ]),
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'Prioritet'),
          el('span', { class: 'wb-fact-val' }, ctx.priority || ''),
        ]),
      ])
    );
    // Risk/Engagemang
    contextPanel.appendChild(
      el('div', { class: 'wb-risk-row' }, [
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'Churn-risk'),
          el('span', { class: 'wb-fact-val wb-risk-val--miss' }, ctx.churnRisk || ''),
        ]),
        el('div', { class: 'wb-fact-cell' }, [
          el('span', { class: 'wb-fact-lbl' }, 'Engagemang'),
          el('span', { class: 'wb-fact-val wb-risk-val--engagement' }, ctx.engagement || ''),
        ]),
      ])
    );
    // Pills
    const pillRow = el('div', { class: 'wb-context-chips' });
    for (const c of ctx.chips || []) {
      pillRow.appendChild(
        el('span', { class: 'wb-context-chip' }, [c.label, el('span', { class: 'ct' }, c.ct)])
      );
    }
    contextPanel.appendChild(pillRow);
    // AI-sammanfattning
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, 'AI-sammanfattning'),
        el('p', { class: 'wb-section-sub' }, ctx.aiSummary || ''),
      ])
    );
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, 'Nu i'),
        el('h5', { class: 'wb-section-title', style: 'font-size:11.5px' }, ctx.nuI || ''),
        el('p', { class: 'wb-section-sub' }, ctx.nuISub || ''),
      ])
    );
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, 'Nästa steg'),
        el('h5', { class: 'wb-section-title', style: 'font-size:11.5px' }, ctx.nextStep || ''),
        el('p', { class: 'wb-section-sub' }, ctx.nextStepSub || ''),
      ])
    );
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, 'Väntar / Blockerar'),
        el('h5', { class: 'wb-section-title', style: 'font-size:11.5px' }, ctx.waiting || ''),
        el('p', { class: 'wb-section-sub' }, ctx.waitingSub || ''),
      ])
    );

    // ─── Höger: huvudkolumn ──────────────────────────────────────────
    const main = el('section', { class: 'workbench-main' });

    // Thread-block överst
    const threadBlock = el('div', { class: 'wb-thread-block' }, [
      el('div', { class: 'wb-thread-meta' }, [
        el(
          'span',
          { class: 'wb-avatar', style: 'width:24px;height:24px;font-size:10px' },
          (ctx.threadFrom || '?').slice(0, 1)
        ),
        el(
          'strong',
          { style: 'color:var(--cco-color-brand);font-size:12px' },
          ctx.threadFrom || ''
        ),
        ctx.threadDate || '',
        '· Konversation i tråden',
        ctx.threadVia ? el('span', { class: 'wb-thread-via' }, ctx.threadVia) : null,
      ]),
      el('div', { class: 'wb-thread-snippet' }, [
        el(
          'div',
          { class: 'wb-thread-snippet-from' },
          (ctx.threadFrom || '') + ' · ' + (ctx.threadDate || '')
        ),
        ctx.threadSnippet || '',
      ]),
    ]);
    if (Array.isArray(ctx.latestMessages) && ctx.latestMessages.length) {
      threadBlock.appendChild(
        el(
          'div',
          {
            class: 'wb-thread-snippet',
            style: 'margin-top:8px;display:flex;flex-direction:column;gap:6px',
          },
          ctx.latestMessages
            .slice(-3)
            .map((message) =>
              el('div', {}, [
                el(
                  'div',
                  { class: 'wb-thread-snippet-from' },
                  (message.from || 'Okänd') +
                    ' · ' +
                    (message.time || '') +
                    (message.mailboxId ? ' · ' + message.mailboxId : '')
                ),
                message.body || '',
              ])
            )
        )
      );
    }
    main.appendChild(threadBlock);

    // Reply-block
    const replyBlock = el('div', { class: 'wb-reply-block' });

    // Guardrail
    replyBlock.appendChild(
      el(
        'div',
        {
          style:
            'padding:9px 12px;background:linear-gradient(180deg,rgba(255,244,219,.92),rgba(248,233,198,.82));border:1px solid rgba(200,130,30,.32);border-radius:10px;font-size:11px;color:rgba(118,81,18,.92)',
        },
        '✋ Inget skickas externt automatiskt. Utkast → human approval → queued. Live-send kräver owner-GO.'
      )
    );

    // Snabbmallar
    const snabbRow = el('div', { class: 'wb-chips' });
    for (const sm of SNABBMALLAR) {
      snabbRow.appendChild(
        chipBtn(sm.label, {
          onclick: () => {
            state.template = sm.id;
            // Fyll svarsfältet från vald tråds kontext (kund/ämne/senaste
            // meddelanden). Send-låset (recipientMissing) påverkas INTE.
            const macroText = buildMacroText(sm.id, ctx);
            const nextBody = state.signatureId
              ? applySignatureToBody(macroText, state.signatureId)
              : macroText;
            bodyArea.value = nextBody;
            state.body = nextBody;
            wordCount.textContent = nextBody.split(/\s+/).filter(Boolean).length + ' ord';
            auditStudioEvent('studio.template_selected', { templateId: sm.id });
            toast('★ Mall infogad: ' + sm.label);
          },
        })
      );
    }
    replyBlock.appendChild(
      el('div', { class: 'wb-snabbmall-row' }, [
        el('span', { class: 'wb-section-kicker' }, 'Snabbmallar'),
        snabbRow,
      ])
    );

    // Till + Från-mailbox
    const recipientInput = el('input', {
      type: 'text',
      value: recipientEmail || '',
      placeholder: recipientEmail ? '' : 'Mottagare saknas i tråddatan',
      'aria-invalid': recipientMissing ? 'true' : null,
      readonly: recipientMissing ? 'readonly' : null,
    });
    const mailboxSelect = el('select', {
      onchange: () => {
        state.mailboxId = mailboxSelect.value;
        auditStudioEvent('studio.mailbox_selected', { mailboxId: state.mailboxId });
        updateMetaLine();
      },
    });
    for (const mb of mailboxes) {
      mailboxSelect.appendChild(el('option', { value: mb.id }, formatMailboxOptionLabel(mb)));
    }
    mailboxSelect.value = state.mailboxId;
    if (mailboxSelect.value !== state.mailboxId && mailboxes[0]) {
      state.mailboxId = mailboxes[0].id;
      mailboxSelect.value = state.mailboxId;
    }
    replyBlock.appendChild(
      el('div', { class: 'wb-form-row' }, [
        el('label', { class: 'wb-field' }, [
          el('span', { class: 'wb-field-lbl' }, 'Till'),
          recipientInput,
        ]),
        el('label', { class: 'wb-field' }, [
          el('span', { class: 'wb-field-lbl' }, 'Från'),
          mailboxSelect,
        ]),
      ])
    );
    if (recipientMissing) {
      replyBlock.appendChild(
        el(
          'div',
          {
            style:
              'padding:9px 12px;background:linear-gradient(180deg,rgba(245,214,211,.82),rgba(255,244,219,.82));border:1px solid rgba(185,74,74,.28);border-radius:10px;font-size:11px;color:#8c2626;font-weight:700',
          },
          '⚠ ' + recipientMissingMessage
        )
      );
    }

    // Ämne + Body
    const subjectInput = el('input', { type: 'text', value: state.subject });
    subjectInput.addEventListener('input', (e) => {
      state.subject = e.target.value;
    });
    replyBlock.appendChild(
      el('label', { class: 'wb-field' }, [
        el('span', { class: 'wb-field-lbl' }, 'Ämne'),
        subjectInput,
      ])
    );

    const bodyArea = el('textarea', {});
    bodyArea.value = state.body;
    bodyArea.addEventListener('input', (e) => {
      state.body = e.target.value;
      wordCount.textContent = e.target.value.split(/\s+/).filter(Boolean).length + ' ord';
    });
    replyBlock.appendChild(
      el('label', { class: 'wb-field' }, [
        el('span', { class: 'wb-field-lbl' }, 'Meddelande'),
        bodyArea,
      ])
    );

    const wordCount = el('span', {}, state.body.split(/\s+/).filter(Boolean).length + ' ord');
    replyBlock.appendChild(
      el('div', { class: 'wb-textmeta' }, [
        wordCount,
        el('span', { class: 'wb-policy-ok' }, 'Policy OK'),
      ])
    );

    // Signatur
    function makeChipSection(items, getActive, onPick, eventKind) {
      const wrap = el('div', { class: 'wb-chips' });
      function rerender() {
        wrap.innerHTML = '';
        for (const it of items) {
          wrap.appendChild(
            chipBtn(it.label, {
              active: getActive() === it.id,
              onclick: () => {
                onPick(it.id);
                auditStudioEvent(eventKind, { value: it.id });
                rerender();
                updateMetaLine();
              },
            })
          );
        }
      }
      rerender();
      return wrap;
    }
    const sigChips = makeChipSection(
      SIGNATURES,
      () => state.signatureId,
      (v) => {
        state.signatureId = v;
        bodyArea.value = applySignatureToBody(bodyArea.value, v);
        state.body = bodyArea.value;
        wordCount.textContent = bodyArea.value.split(/\s+/).filter(Boolean).length + ' ord';
      },
      'studio.signature_selected'
    );
    replyBlock.appendChild(
      el('div', { class: 'wb-chip-row-sect', 'data-group': 'signatur' }, [
        el('span', { class: 'wb-section-kicker' }, 'Signatur'),
        sigChips,
      ])
    );

    // Meta-line: Från / Signatur / Nästa steg
    const metaLine = el('div', { class: 'wb-route-info' });
    function updateMetaLine() {
      const mb = mailboxes.find((m) => m.id === state.mailboxId);
      const sig = SIGNATURES.find((s) => s.id === state.signatureId);
      metaLine.textContent =
        'Från: ' +
        (mb?.name || state.mailboxId) +
        ' · Signatur: ' +
        (sig?.label || '—') +
        ' · Nästa steg: ' +
        (ctx.nextStep || 'Svara nu');
    }
    updateMetaLine();
    replyBlock.appendChild(metaLine);

    // Responsspår
    const trackChips = makeChipSection(
      RESPONSE_TRACKS,
      () => state.track,
      (v) => {
        state.track = v;
      },
      'studio.track_selected'
    );
    replyBlock.appendChild(
      el('div', { class: 'wb-chip-row-sect', 'data-group': 'responsspar' }, [
        el('span', { class: 'wb-section-kicker' }, 'Responsspår'),
        trackChips,
      ])
    );
    // Tonfilter
    const toneChips = makeChipSection(
      TONE_FILTERS,
      () => state.tone,
      (v) => {
        state.tone = v;
      },
      'studio.tone_selected'
    );
    replyBlock.appendChild(
      el('div', { class: 'wb-chip-row-sect', 'data-group': 'tonfilter' }, [
        el('span', { class: 'wb-section-kicker' }, 'Tonfilter'),
        toneChips,
      ])
    );
    // Finjustera
    const refineChips = makeChipSection(
      REFINE_FILTERS,
      () => state.refine,
      (v) => {
        state.refine = v;
      },
      'studio.refine_selected'
    );
    replyBlock.appendChild(
      el('div', { class: 'wb-chip-row-sect', 'data-group': 'finjustera' }, [
        el('span', { class: 'wb-section-kicker' }, 'Finjustera'),
        refineChips,
      ])
    );

    // Smart actions inne i Svarstudio
    const smartActions = el('div', { class: 'wb-smart-actions' });
    smartActions.appendChild(
      chipBtn('★ AI-utkast', {
        onclick: () => {
          bodyArea.value = '[AI-utkast — administrativt, kräver godkännande]\n\n' + bodyArea.value;
          state.body = bodyArea.value;
          auditStudioEvent('studio.ai_draft_requested', { mode: 'administrative' });
          toast('★ AI-utkast — granska + godkänn');
        },
      })
    );
    smartActions.appendChild(
      chipBtn('📎 Bifoga friskförsäkran', {
        onclick: () => {
          auditStudioEvent('studio.attach_form', { formKind: 'fitness_certificate' });
          toast('📎 Friskförsäkran bifogad');
        },
      })
    );
    smartActions.appendChild(
      chipBtn('📅 Ändra bokning', {
        onclick: () => {
          auditStudioEvent('studio.open_booking_drawer', {});
          toast('📅 Bokningsyta — öppna från bottom-bar');
        },
      })
    );
    smartActions.appendChild(
      chipBtn('😊 Personlig ton', {
        onclick: () => {
          state.tone = 'warm';
          auditStudioEvent('studio.tone_selected', { value: 'warm', source: 'personal_quick' });
          toast('😊 Personlig ton aktiverad');
        },
      })
    );
    replyBlock.appendChild(smartActions);

    main.appendChild(replyBlock);

    // ─── Workbench-grid wrapper ──────────────────────────────────────
    const workbenchGrid = el('div', { class: 'workbench-grid' }, [contextPanel, main]);

    // ─── Footer-actions ──────────────────────────────────────────────
    async function saveDraft(targetStatus) {
      if (recipientMissing) {
        toast('✗ ' + recipientMissingMessage, 'err');
        return false;
      }
      try {
        if (!state.draftId) {
          const r = await fetch('/api/v1/cco-comm/drafts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            },
            body: JSON.stringify({
              customerId,
              templateId: state.template || 'manual_reply',
              subject: state.subject,
              body: state.body,
              channel: 'email',
              journeyStep: state.track || 'reply',
              mailboxId: state.mailboxId,
              signatureId: state.signatureId,
              tone: state.tone,
              refine: state.refine,
            }),
          });
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || 'fel');
          state.draftId = j.draft.draftId;
          auditStudioEvent('studio.draft_created', {
            draftId: state.draftId,
            track: state.track,
            tone: state.tone,
          });
        } else {
          await fetch('/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId), {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            },
            body: JSON.stringify({ subject: state.subject, body: state.body }),
          });
          auditStudioEvent('studio.draft_edited', { draftId: state.draftId });
        }
        if (targetStatus && targetStatus !== 'draft') {
          const r2 = await fetch(
            '/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId) + '/transition',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-cco-role': ROLE,
                'x-cco-tenant': TENANT,
              },
              body: JSON.stringify({ status: targetStatus, reason: 'via Svarstudio' }),
            }
          );
          const j2 = await r2.json();
          if (!j2.ok) throw new Error(j2.error || 'transition');
          auditStudioEvent('studio.transitioned', { draftId: state.draftId, to: targetStatus });
        }
        return true;
      } catch (e) {
        toast('✗ ' + e.message, 'err');
        return false;
      }
    }

    function showPreview() {
      if (recipientMissing) {
        toast('✗ ' + recipientMissingMessage, 'err');
        return;
      }
      auditStudioEvent('studio.preview_opened', { bodyLength: state.body.length });
      const mb = mailboxes.find((m) => m.id === state.mailboxId);
      const sig = SIGNATURES.find((s) => s.id === state.signatureId)?.label || '';
      const preview =
        'Från: ' +
        (mb?.email || state.mailboxId) +
        '\nTill: ' +
        recipientInput.value +
        '\nÄmne: ' +
        state.subject +
        '\n\n' +
        state.body +
        '\n\n—\n' +
        sig +
        '\nHair TP Clinic';
      openModal({
        title: '👁 Förhandsvisning',
        body: el('div', {}, [
          el(
            'div',
            {
              style:
                'padding:10px 12px;background:rgba(255,244,219,.92);border:1px solid rgba(200,130,30,.32);border-radius:10px;font-size:11.5px;margin-bottom:12px',
            },
            '✋ Utkast. Inget skickas utan human approval.'
          ),
          el(
            'pre',
            {
              style:
                'background:rgba(248,243,235,.86);padding:14px;border-radius:10px;font:inherit;font-size:12.5px;white-space:pre-wrap;line-height:1.55;max-height:60vh;overflow-y:auto',
            },
            preview
          ),
        ]),
        footer: [
          el(
            'button',
            {
              class: 'wb-secondary-cta',
              type: 'button',
              onclick: () => document.querySelectorAll('.action-modal-backdrop')[1]?.remove(),
            },
            'Stäng'
          ),
        ],
      });
    }

    const sendButton = el(
      'button',
      {
        class: 'wb-primary-cta',
        type: 'button',
        disabled: recipientMissing ? 'disabled' : null,
        'aria-disabled': recipientMissing ? 'true' : null,
        title: recipientMissing ? recipientMissingMessage : null,
        onclick: async () => {
          if (recipientMissing) {
            toast('✗ ' + recipientMissingMessage, 'err');
            return;
          }
          if (await saveDraft('needs_approval')) {
            toast('▶ Skickat för godkännande');
            m.close();
          }
        },
      },
      [el('span', {}, '▶'), 'Skicka svar']
    );
    if (recipientMissing) {
      sendButton.style.opacity = '0.48';
      sendButton.style.cursor = 'not-allowed';
    }

    const m = openModal({
      title: 'Arbetsyta · Svarstudio',
      headChips: [
        { label: 'Oklart', kind: 'neutral' },
        { label: 'VIP', kind: 'gold' },
        { label: ctx.engagement || '84%', kind: 'engage' },
        { label: ctx.priority || 'Miss', kind: 'risk' },
        { label: ctx.sla || 'SLA', kind: 'sla' },
      ],
      body: workbenchGrid,
      footer: [
        sendButton,
        el(
          'button',
          { class: 'wb-secondary-cta', type: 'button', onclick: showPreview },
          'Förhandsvisning'
        ),
        el(
          'button',
          {
            class: 'wb-secondary-cta',
            type: 'button',
            onclick: async () => {
              if (await saveDraft('draft')) toast('💾 Utkast sparat');
            },
          },
          'Spara utkast'
        ),
        el(
          'button',
          {
            class: 'wb-secondary-cta',
            type: 'button',
            onclick: async () => {
              const h = window.prompt('Senare — vänta hur många timmar?', '24');
              if (!h) return;
              if (await saveDraft('draft')) {
                auditStudioEvent('studio.snoozed', { draftId: state.draftId, hours: h });
                toast('⏰ Snoozad ' + h + 'h');
              }
            },
          },
          'Senare'
        ),
        el(
          'button',
          {
            class: 'wb-secondary-cta wb-secondary-cta--approve',
            type: 'button',
            onclick: async () => {
              if (await saveDraft('approved')) {
                auditStudioEvent('studio.approved', { draftId: state.draftId });
                toast('★ Godkänd');
                m.close();
              }
            },
          },
          'Klar'
        ),
        el(
          'button',
          {
            class: 'wb-secondary-cta wb-secondary-cta--danger',
            type: 'button',
            onclick: async () => {
              if (!state.draftId) {
                m.close();
                return;
              }
              if (!window.confirm('Radera utkast?')) return;
              if (await saveDraft('cancelled')) {
                toast('🗑 Raderat');
                m.close();
              }
            },
          },
          'Radera'
        ),
      ],
      workbench: true,
    });
  }

  // ─── SMART ANTECKNING — 2-stegs workbench ────────────────────────────
  function openSmartAnteckning() {
    const customerId = activeCustomerId();
    const modes = [
      {
        id: 'ai-summary',
        icon: '✏',
        label: 'Sammanfatta konversation',
        sub: 'Låt systemet analysera och fylla anteckningen med tät helhetssammanfattning.',
      },
      {
        id: 'ai-extract',
        icon: '◆',
        label: 'Extrahera viktiga detaljer',
        sub: 'Lyft datum, tider, preferenser och vad som blockerar beslutet just nu.',
      },
      {
        id: 'ai-action-items',
        icon: '✓',
        label: 'Identifiera åtgärder',
        sub: 'Skapa action-orienterad anteckning för team, SLA eller uppföljning.',
      },
      {
        id: 'manual',
        icon: '✎',
        label: 'Skapa manuell anteckning',
        sub: 'Öppna utan AI-förifyllning.',
      },
    ];

    const grid = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    for (const mode of modes) {
      grid.appendChild(
        el(
          'button',
          {
            type: 'button',
            style:
              'text-align:left;padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.92);background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(248,241,232,.92));cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:4px;box-shadow:0 6px 14px rgba(93,74,60,.1),inset 0 1px 0 rgba(255,255,255,.96);transition:transform .14s ease',
            onmouseenter: function () {
              this.style.transform = 'translateY(-2px)';
            },
            onmouseleave: function () {
              this.style.transform = '';
            },
            onclick: () => openSmartAnteckningEditor(mode, customerId, m.close),
          },
          [
            el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
              el('span', { style: 'font-size:14px;color:var(--accent-studio,#bb4779)' }, mode.icon),
              el('div', { style: 'font-weight:700;font-size:13px;color:#2b251f' }, mode.label),
            ]),
            el(
              'div',
              { style: 'font-size:11.5px;color:rgba(70,60,50,.62);padding-left:22px' },
              mode.sub
            ),
          ]
        )
      );
    }
    const m = openModal({
      title: 'Smart anteckning · Välj läge',
      body: el('div', {}, [
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(232,234,245,.86);border:1px solid rgba(74,123,168,.22);border-radius:10px;font-size:11.5px;margin-bottom:14px;color:#36507a',
          },
          'Aktuell kontext: ' + customerId + ' · konversation pågående'
        ),
        grid,
      ]),
    });
  }

  function openSmartAnteckningEditor(mode, customerId, closeSelect) {
    closeSelect?.();
    const targets = [
      { id: 'kundprofil', label: 'Kundprofil', sub: 'Allmänna kundnoter' },
      { id: 'konversation', label: 'Konversation', sub: 'Specifikt för denna tråd' },
      { id: 'medicinsk', label: 'Medicinsk', sub: 'Behandling och hälsa' },
      { id: 'betalning', label: 'Betalning', sub: 'Ekonomi och faktura' },
      { id: 'sla', label: 'SLA / eskalering', sub: 'Brådskande uppföljning' },
      { id: 'intern', label: 'Intern', sub: 'Bara för teamet' },
      { id: 'uppfoljning', label: 'Uppföljning', sub: 'Framtida åtgärder' },
    ];
    let activeTarget = 'konversation';

    // ── Vänster: spara-mål ──
    const leftCol = el('aside', { class: 'workbench-context' });
    leftCol.appendChild(el('div', { class: 'wb-section-kicker' }, 'Var ska anteckningen sparas?'));
    function renderTargets() {
      leftCol.querySelectorAll('.wb-target-btn').forEach((n) => n.remove());
      for (const t of targets) {
        const btn = el(
          'button',
          {
            type: 'button',
            class: 'wb-target-btn',
            style: [
              'display:flex',
              'flex-direction:column',
              'gap:2px',
              'text-align:left',
              'padding:10px 12px',
              'border-radius:11px',
              'cursor:pointer',
              'font-family:inherit',
              'border:1px solid ' +
                (t.id === activeTarget ? 'rgba(187,71,121,.28)' : 'rgba(187,159,122,.18)'),
              'background:' +
                (t.id === activeTarget
                  ? 'linear-gradient(180deg,var(--rose-pill-top),var(--rose-pill-bottom))'
                  : 'rgba(255,255,255,.62)'),
              'color:' +
                (t.id === activeTarget ? 'var(--accent-studio)' : 'var(--cco-color-brand)'),
            ].join(';'),
            onclick: () => {
              activeTarget = t.id;
              renderTargets();
              previewEl.textContent = buildPreview();
            },
          },
          [
            el('span', { style: 'font-weight:700;font-size:12.5px' }, t.label),
            el('span', { style: 'font-size:10.5px;color:#84756b' }, t.sub),
          ]
        );
        leftCol.appendChild(btn);
      }
    }
    renderTargets();

    // ── Mitten: auto-data ──
    const midCol = el('section', {
      style:
        'padding:18px 20px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;background:rgba(255,255,255,.42)',
    });
    midCol.appendChild(el('div', { class: 'wb-section-kicker' }, 'Auto-hämtad data'));
    midCol.appendChild(
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
        el(
          'div',
          {
            class: 'wb-fact-cell',
            style:
              'background:rgba(255,255,255,.62);padding:10px 12px;border-radius:10px;border:1px solid rgba(187,159,122,.18)',
          },
          [
            el('span', { class: 'wb-fact-lbl' }, 'Kund och tråd'),
            el('span', { class: 'wb-fact-val' }, customerId + ' · konversation pågående'),
          ]
        ),
        el(
          'div',
          {
            class: 'wb-fact-cell',
            style:
              'background:rgba(255,255,255,.62);padding:10px 12px;border-radius:10px;border:1px solid rgba(187,159,122,.18)',
          },
          [
            el('span', { class: 'wb-fact-lbl' }, 'Vad ärendet gäller'),
            el('span', { class: 'wb-fact-val' }, 'Oklart (tolkas från aktiv tråd)'),
          ]
        ),
        el(
          'div',
          {
            class: 'wb-fact-cell',
            style:
              'background:rgba(255,255,255,.62);padding:10px 12px;border-radius:10px;border:1px solid rgba(187,159,122,.18)',
          },
          [
            el('span', { class: 'wb-fact-lbl' }, 'Nästa steg'),
            el('span', { class: 'wb-fact-val' }, 'Öppna tråden och ta nästa tydliga steg'),
          ]
        ),
        el(
          'div',
          {
            class: 'wb-fact-cell',
            style:
              'background:rgba(255,255,255,.62);padding:10px 12px;border-radius:10px;border:1px solid rgba(187,159,122,.18)',
          },
          [
            el('span', { class: 'wb-fact-lbl' }, 'Mailbox och ansvar'),
            el('span', { class: 'wb-fact-val' }, 'Contact · Oägd'),
          ]
        ),
      ])
    );
    midCol.appendChild(
      el('div', { class: 'wb-section-kicker', style: 'margin-top:6px' }, 'Auto-kopplas till')
    );
    midCol.appendChild(
      el(
        'div',
        {
          style:
            'padding:10px 12px;background:linear-gradient(180deg,rgba(216,235,219,.78),rgba(184,216,197,.62));border:1px solid rgba(74,130,104,.22);border-radius:10px;font-size:11.5px;line-height:1.6;color:rgba(54,84,32,.92)',
        },
        '• Kund: ' +
          customerId +
          '\n• Ärende: konversation i tråden\n• Mejlkonto: Contact\n• Ansvar: Oägd\n• Nästa steg: nästa SLA-deadline'
      )
    );
    midCol.appendChild(
      el('div', { class: 'wb-section-kicker', style: 'margin-top:6px' }, 'Liveförhandsvisning')
    );
    const previewEl = el('pre', {
      style:
        'padding:10px 12px;background:rgba(248,243,235,.86);border-radius:10px;font:inherit;font-size:11.5px;white-space:pre-wrap;line-height:1.55;color:rgba(70,60,50,.85);min-height:80px',
    });

    function buildPreview() {
      const sel = targets.find((t) => t.id === activeTarget);
      return (
        'Sparas till: ' + (sel?.label || '') + '\nKund: ' + customerId + '\nMode: ' + mode.label
      );
    }
    previewEl.textContent = buildPreview();
    midCol.appendChild(previewEl);

    // ── Höger: anteckning + taggar + prio + synlighet ──
    const rightCol = el('section', {
      style:
        'padding:18px 20px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;border-left:1px solid rgba(187,159,122,.18)',
    });
    rightCol.appendChild(el('div', { class: 'wb-section-kicker' }, 'Snabbmallar'));
    const noteSnabb = el('div', { class: 'wb-chips' });
    for (const m of ['Ombokning begärd', 'Allergier/kontraindikationer', 'Betalningsplan']) {
      noteSnabb.appendChild(chipBtn(m, { onclick: () => toast('★ Mall: ' + m) }));
    }
    rightCol.appendChild(noteSnabb);

    rightCol.appendChild(el('div', { class: 'wb-section-kicker' }, 'Anteckning'));
    const noteArea = el('textarea', {
      style:
        'width:100%;min-height:160px;padding:11px 13px;border-radius:10px;border:1px solid rgba(187,159,122,.3);font:inherit;font-size:12.5px;line-height:1.55;background:rgba(255,255,255,.92);resize:vertical',
    });
    if (mode.id === 'ai-summary') {
      noteArea.value =
        'AI-sammanfattning:\n- Kund: ' +
        customerId +
        '\n- Status: konversation pågående\n- Senaste händelsen: behöver svar\n- Föreslagen åtgärd: skicka svar eller skapa utkast';
    } else if (mode.id === 'ai-extract') {
      noteArea.value =
        'Viktiga detaljer:\n- Datum: (auto-extraheras)\n- Tider: (auto-extraheras)\n- Preferenser: (auto-extraheras)\n- Blockerare: (auto-extraheras)';
    } else if (mode.id === 'ai-action-items') {
      noteArea.value =
        'Åtgärder:\n- [ ] Bekräfta bokning före 18:00\n- [ ] Skicka friskförsäkran\n- [ ] Följ upp SLA';
    }
    rightCol.appendChild(noteArea);

    const tagsInput = el('input', {
      type: 'text',
      placeholder: 'Kommaseparerade taggar…',
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.3);font:inherit;font-size:12px',
    });
    const priSel = el('select', {
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.3);font:inherit;font-size:12px',
    });
    for (const p of ['Låg', 'Medel', 'Hög']) priSel.appendChild(el('option', { value: p }, p));
    priSel.value = 'Medel';
    const visSel = el('select', {
      style:
        'padding:8px 12px;border-radius:8px;border:1px solid rgba(187,159,122,.3);font:inherit;font-size:12px',
    });
    for (const v of ['Team', 'Privat']) visSel.appendChild(el('option', { value: v }, v));
    visSel.value = 'Team';

    rightCol.appendChild(
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, [
        el('label', { style: 'display:flex;flex-direction:column;gap:4px' }, [
          el('span', { class: 'wb-section-kicker' }, 'Prioritet'),
          priSel,
        ]),
        el('label', { style: 'display:flex;flex-direction:column;gap:4px' }, [
          el('span', { class: 'wb-section-kicker' }, 'Synlighet'),
          visSel,
        ]),
      ])
    );
    rightCol.appendChild(
      el('label', { style: 'display:flex;flex-direction:column;gap:4px' }, [
        el('span', { class: 'wb-section-kicker' }, 'Taggar'),
        tagsInput,
      ])
    );

    // ── Grid: 220px | 1fr | 320px ──
    const grid = el(
      'div',
      {
        class: 'workbench-grid',
        style: 'grid-template-columns: 220px 1fr 320px',
      },
      [leftCol, midCol, rightCol]
    );

    const m = openModal({
      title: 'Arbetsyta · Smart anteckning · ' + mode.label,
      headChips: [
        { label: mode.label.split(' ')[0], kind: 'neutral' },
        { label: customerId, kind: 'engage' },
      ],
      body: grid,
      footer: [
        el(
          'button',
          {
            class: 'wb-primary-cta',
            type: 'button',
            onclick: async () => {
              try {
                const r = await fetch(
                  '/api/v1/cco-customers/' + encodeURIComponent(customerId) + '/internal-note',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-cco-role': ROLE,
                      'x-cco-tenant': TENANT,
                    },
                    body: JSON.stringify({
                      body: noteArea.value,
                      target: activeTarget,
                      priority: priSel.value,
                      visibility: visSel.value,
                      tags: tagsInput.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                      mode: mode.id,
                    }),
                  }
                );
                const j = await r.json();
                if (j.ok) {
                  toast('✓ Sparad till ' + activeTarget);
                  m.close();
                } else toast('✗ ' + (j.error || 'fel'), 'err');
              } catch (e) {
                toast('✗ ' + e.message, 'err');
              }
            },
          },
          [el('span', {}, '✓'), 'Spara anteckning']
        ),
        el('button', { class: 'wb-secondary-cta', type: 'button', onclick: m.close }, 'Avbryt'),
      ],
      workbench: true,
    });
  }

  // ─── BOKNINGSYTA ─────────────────────────────────────────────────────
  function openBokningsyta() {
    const customerId = activeCustomerId();
    const m = openModal({
      title: '📅 Bokningsyta',
      body: el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
        el(
          'div',
          {
            style:
              'padding:10px 12px;background:rgba(216,235,219,.78);border:1px solid rgba(74,130,104,.32);border-radius:10px;font-size:12px',
          },
          'Kopplad bokning: PRP tor 28 maj 08:00 · Egzona'
        ),
        el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, [
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => toast('→ Boka om — välj ny tid i kalendern'),
            },
            '↻ Boka om'
          ),
          el(
            'button',
            { class: 'quick-pill', type: 'button', onclick: () => toast('★ Föreslå återbesök') },
            '★ Föreslå återbesök (3 mån)'
          ),
          el(
            'button',
            {
              class: 'quick-pill',
              type: 'button',
              onclick: () => {
                window.open('/kalender.html', '_blank');
                m.close();
              },
            },
            '📆 Öppna i full kalendervy'
          ),
          el(
            'button',
            {
              class: 'quick-pill quick-pill--success',
              type: 'button',
              onclick: () => toast('✓ Markerad ankommen'),
            },
            '✓ Markera ankommen'
          ),
          el(
            'button',
            { class: 'quick-pill', type: 'button', onclick: () => toast('⊘ No-show registrerad') },
            '⊘ Markera no-show'
          ),
        ]),
      ]),
      footer: [el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Stäng')],
    });
  }

  // ─── KALENDER ────────────────────────────────────────────────────────
  function openKalender() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const m = openModal({
      title: '📆 Kalender — ' + dateStr,
      body: el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, [
        el('div', { style: 'display:grid;grid-template-columns:60px 1fr;gap:8px;font-size:12px' }, [
          el('span', { style: 'font-weight:700;color:#84756b' }, '08:00'),
          el('span', {}, 'PRP för hår — Anna K. (Egzona)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '09:30'),
          el('span', {}, 'Uppföljning — Karl L. (Fazli)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '11:00'),
          el('span', {}, 'DHI konsultation — Sofie A. (Dr. Arya)'),
          el('span', { style: 'font-weight:700;color:#84756b' }, '14:00'),
          el('span', {}, 'Microneedling — Eva J. (Egzona)'),
        ]),
        el(
          'div',
          {
            style:
              'padding:8px 12px;background:rgba(216,235,219,.78);border-radius:8px;font-size:11px',
          },
          '✓ 4 bokningar idag · 0 no-shows · 1 återbesök väntar'
        ),
      ]),
      footer: [
        el(
          'button',
          {
            class: 'quick-pill',
            type: 'button',
            onclick: () => {
              window.open('/kalender.html', '_blank');
              m.close();
            },
          },
          '📆 Öppna full kalender'
        ),
        el('button', { class: 'quick-pill', type: 'button', onclick: m.close }, 'Stäng'),
      ],
    });
  }

  // ─── Wire bottom-bar + keyboard ──────────────────────────────────────
  function wireActions() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener('click', () => {
        if (action === 'svarstudio') openSvarstudioForSelectedThread();
        else if (action === 'smart-anteckning') openSmartAnteckning();
        else if (action === 'bokningsyta') openBokningsyta();
        else if (action === 'kalender') openKalender();
      });
    });
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSvarstudioForSelectedThread();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openSmartAnteckning();
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        openBokningsyta();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        openKalender();
      } else if (e.key === 'Escape')
        document.querySelectorAll('.action-modal-backdrop').forEach((n) => n.remove());
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireActions);
  else wireActions();
})();
