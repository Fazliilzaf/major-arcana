/* ─── Konversationer Bottom Actions — Sprint 18C.2 ─────────────────────
 * Workbench-modaler för Svarstudio + Smart anteckning,
 * inspirerade av gamla CCO Svarstudio-arbetsyta.
 * ────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const ROLE = 'owner';
  const TENANT = 'hair_tp';

  // Svarstudio v2 — porten av design-artifacten "precis som den är". Renderas i
  // en isolerad shadow-DOM-host (svarstudio-v2.css/.html) så artifactens 141
  // egna klasser aldrig krockar med sidan. Sändkedjan är oförändrad: v2 postar
  // exakt samma draft-/transition-endpoints (upp till needs_approval), live-send
  // förblir serverspärrat. Faller tillbaka på den klassiska modalen om assets
  // saknas.
  const USE_SVARSTUDIO_V2 = true;

  function adminAuthHeaders(headers = {}) {
    if (window.CCOConversationAuth?.headers) {
      return window.CCOConversationAuth.headers(headers);
    }
    let token = '';
    try {
      token =
        window.localStorage?.getItem('ARCANA_ADMIN_TOKEN') ||
        window.sessionStorage?.getItem('ARCANA_ADMIN_TOKEN') ||
        '';
    } catch {
      token = '';
    }
    const next = { ...headers };
    if (token && token !== '__preview_local__') next.Authorization = 'Bearer ' + token;
    return next;
  }

  // PR 4 — Smart anteckning-knappen öppnar Smart anteckning v3 (rätt/ny CCO-vy),
  // inte det gamla "Välj läge"-modalflödet (legacy). admin#cco förblir enda
  // produktionsytan; v3 laddas via samma origin (inte som lokal fil).
  const SMART_ANTECKNING_V3_SRC = '/major-arcana-preview/cco-smart-anteckning-v3.html';
  // PR 12 — "Öppna bokning" öppnar "CCO · Ny bokning"-ytan (Boka behandling-
  // wizarden, portad in i repot — samma origin, inte som lokal fil). Scoped till
  // vald kund. OBS: användarens uttryckliga, låsta val — INTE den äldre
  // Bokningsguiden (cco-booking-wizard-v3). Ändra inte tillbaka.
  const BOOKING_SRC = '/major-arcana-preview/cco-ny-bokning.html';
  // PR 10 — "Öppna kalender" går till den riktiga CCO-kalenderytan (inte v8-preview),
  // som panel med vald tråds kund. Samma origin, ingen live-send.
  const KALENDER_SRC = '/kalender.html';
  // PR 11 — "Lägg senare" öppnar Senare v3 som panel; reply_later körs FÖRST när
  // användaren bekräftar snooze-tid i panelen (inte ett-klicks-snooze). Samma origin.
  const SENARE_V3_SRC = '/major-arcana-preview/cco-senare-v3.html';
  // PR 13 — Notiser är ett notiscenter (entry i badge-raden, inte trådaction).
  // Öppnar Notiser v3 som panel; tar med vald tråds kontext om en tråd är vald.
  const NOTISER_V3_SRC = '/major-arcana-preview/cco-notiser-v3.html';
  // PR 14 — Skickat/utkast/kö hör till utgående svarspipeline → öppnas som
  // sektion inne i Svarstudio (inte bottom action, inte vänsterfilter).
  const SKICKAT_V3_SRC = '/major-arcana-preview/cco-skickat-v3.html';
  // PR 17 — Makron/snabbsvar (nivå 1). Öppnas från Svarstudio (utgående
  // svarsflöde) med vald tråds kontext, scopar makronbiblioteket till kunden.
  // Samma origin, ingen live-send.
  const MAKRON_V3_SRC = '/major-arcana-preview/cco-makron-v3.html';
  // PR 18 — Patient-/kunddossier (nivå 2, kundkontext bredvid tråden — inte i
  // svarslinjen). "Vem är detta" scopad på vald tråds kund. Samma origin.
  const PATIENT_HUB_V3_SRC = '/major-arcana-preview/cco-patient-hub-v3.html';
  // PR 20 — Signaturer & samtycken (BankID-signeringscentral, nivå 2). Vilka
  // dokument väntar patienten på att signera. Scopad på vald tråds kund. Samma
  // origin, ingen live-send.
  const SIGNATURER_V3_SRC = '/major-arcana-preview/cco-signaturer-v3.html';
  // PR 19 — No-show-hantering (nivå 2). Använder den nyare AI-vyn (no-show-
  // prediction), inte den äldre listvyn — nyare CCO-vy vinner. Relevant när en
  // bokningstråd hanteras; kopplar mot bokning/kalender. Scopad på vald tråds
  // kund. Samma origin.
  const NO_SHOW_V3_SRC = '/major-arcana-preview/cco-no-show-ai-v3.html';

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

  // PR 6 — kundidentitet för Klar/Senare/Reopen. Backend matchar customerId mot
  // trådens INKOMMANDE avsändarmail (icke-klinik). Använd trådens inkommande
  // meddelanden (första inkommande först), inte ett härlett fält som kan ge 409.
  function resolveThreadCustomerEmail(context) {
    const ctx = context || {};
    const messages = Array.isArray(ctx.latestMessages) ? ctx.latestMessages : [];
    for (const message of messages) {
      if (!message || message.dir === 'outgoing') continue;
      const email = firstCustomerEmailValue(message.email, message.from);
      if (email) return email;
    }
    // Fallback: kundmail på kontexten (fortf. icke-klinik).
    return firstCustomerEmailValue(ctx.email, ctx.customerEmail, ctx.customerId);
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
      // Engagemangs-% ligger numera i kundkontext-kortets meta-rad (chips-redesign).
      engagement:
        (selectedThreadText('.ctx-metaline').match(/engagemang\s+(\d+\s*%)/i) || [])[1] || '—',
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
        headers: adminAuthHeaders({
          'Content-Type': 'application/json',
          'x-cco-role': ROLE,
          'x-cco-tenant': TENANT,
        }),
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

  // PR 15 — panel-flikar i modal-headern. Låter användaren byta panel direkt
  // (backdrop:en täcker bottenknapparna, så man kan annars inte öppna resterande).
  function panelTabs(activeKey) {
    return [
      { key: 'svarstudio', label: 'Svarstudio', open: () => openSvarstudioForSelectedThread() },
      { key: 'bokning', label: 'Bokning', open: () => openBokningsyta() },
      { key: 'smart', label: 'Anteckning', open: () => openSmartAnteckning() },
      { key: 'makron', label: 'Makron', open: () => openMakron() },
      { key: 'kalender', label: 'Kalender', open: () => openKalender() },
      { key: 'senare', label: 'Senare', open: () => openSenarePanel() },
      { key: 'notiser', label: 'Notiser', open: () => openNotiser() },
      { key: 'skickat', label: 'Skickat', open: () => openSkickat() },
      { key: 'portalmetrics', label: 'Portal', open: () => openPortalMetrics() },
      { key: 'patienthub', label: 'Dossier', open: () => openPatientHub() },
      { key: 'noshow', label: 'No-show', open: () => openNoShow() },
      { key: 'signaturer', label: 'Signering', open: () => openSignaturer() },
    ].map((t) => ({ key: t.key, label: t.label, open: t.open, active: t.key === activeKey }));
  }

  function openModal({ title, body, footer, wide, workbench, headChips, tabs, onClose } = {}) {
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
    if (tabs && tabs.length) {
      const tabWrap = el('div', { class: 'action-modal-tabs' });
      for (const t of tabs) {
        tabWrap.appendChild(
          el(
            'button',
            {
              type: 'button',
              class: 'action-modal-tab' + (t.active ? ' is-active' : ''),
              onclick: () => {
                if (!t.active && typeof t.open === 'function') t.open();
              },
            },
            t.label
          )
        );
      }
      head.appendChild(tabWrap);
    }
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
      text: 'Bästa hälsningar,\n\nFazli Krasniqi\nHårspecialist | Hårtransplantationer & PRP-injektioner\nHair TP Clinic\n031-88 11 66 · contact@hairtpclinic.com\nVasaplatsen 2, 411 34 Göteborg\nhairtpclinic.com',
    },
    {
      id: 'egzona',
      label: 'Egzona',
      text: 'Bästa hälsningar,\n\nEgzona Krasniqi\nHårspecialist | Hårtransplantationer & PRP-injektioner\nHair TP Clinic\n031-88 11 66 · contact@hairtpclinic.com\nVasaplatsen 2, 411 34 Göteborg\nhairtpclinic.com',
    },
    {
      id: 'contact',
      label: 'Kontakt',
      text: 'Bästa hälsningar,\n\nHair TP Clinic\nHårtransplantationer & PRP-injektioner\n031-88 11 66 · contact@hairtpclinic.com\nVasaplatsen 2, 411 34 Göteborg\nhairtpclinic.com',
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

  // Kundtext får ALDRIG innehålla streck (em/en-dash) och ska inte ha en egen
  // avslutande hälsning — den ligger i signaturen. Körs på allt genererat/förvalt
  // svarsinnehåll innan det hamnar i editorn. Rör inte signatur-dividern (den
  // sätts efteråt av applySignatureToBody och byts mot HTML-signaturen vid send).
  function sanitizeReplyText(text) {
    return String(text || '')
      .replace(/ *[—–] */g, ', ') // streck → komma
      .replace(/\n+\s*(Varma|Vänliga|Bästa|Med\s+vänliga?)\s+häls\w*[\s\S]*$/i, '') // "Varma hälsningar…"
      .replace(/\n+\s*(Vänligen|Mvh|M\.?\s?v\.?\s?h\.?)\b[\s\S]*$/i, '') // "Vänligen/Mvh…"
      .replace(/[ \t]+\n/g, '\n')
      .trimEnd();
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
    // Använd senaste INKOMMANDE meddelandet — hoppa över utgående klinik-svar
    // (annars tackar makrot kunden för klinikens egen text).
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.dir === 'outgoing') continue;
      const snippet = cleanText(message && (message.body || message.snippet));
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
        '. Vi har följande tider lediga, låt oss veta vilken som passar dig bäst:\n\n• \n• \n• ',
      send_pricing:
        greeting +
        '\n\nTack för din förfrågan om ' +
        topic +
        '. Här kommer prisinformationen du efterfrågade. Säg till om du vill boka en kostnadsfri konsultation.',
      ask_more_info:
        greeting +
        '\n\nTack för ditt meddelande om ' +
        topic +
        '. För att kunna hjälpa dig på bästa sätt behöver vi lite mer information:\n\n• \n• ',
    };
    return (
      bodies[templateId] || greeting + '\n\nTack för ditt meddelande. Vi återkommer inom kort.'
    );
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

  // ─── SVARSTUDIO v2 — design-artifacten 1:1 i isolerad shadow-DOM ─────
  // Laddar svarstudio-v2.css/.html, binder trådens riktiga data och kopplar
  // kontrollerna till EXAKT samma sänd-endpoints som klassiska modalen (upp
  // till needs_approval). Live-send förblir serverspärrat.
  const SVARSTUDIO_V2_ASSET_VERSION = '20260708b-dossier';
  let _svarstudioV2Assets = null;
  async function loadSvarstudioV2Assets() {
    if (_svarstudioV2Assets) return _svarstudioV2Assets;
    const cacheBust = '?v=' + SVARSTUDIO_V2_ASSET_VERSION;
    const [cssRes, htmlRes] = await Promise.all([
      fetch('/svarstudio-v2.css' + cacheBust, { cache: 'no-store' }),
      fetch('/svarstudio-v2.html' + cacheBust, { cache: 'no-store' }),
    ]);
    if (!cssRes.ok || !htmlRes.ok) throw new Error('svarstudio-v2 assets saknas');
    _svarstudioV2Assets = { css: await cssRes.text(), html: await htmlRes.text() };
    return _svarstudioV2Assets;
  }

  function railToneFor(name, email) {
    const s = (name + ' ' + email).toLowerCase();
    if (s.includes('fazli')) return 'fazli';
    if (s.includes('egzona')) return 'egzona';
    return 'contact';
  }

  async function mountSvarstudioV2({ ctx, state, mailboxes, recipientEmail, customerId }) {
    const { css, html } = await loadSvarstudioV2Assets();

    // Montera artifacten i STANDARD-panelmodalen — samma ram, flikrad och
    // storlek (wide) som övriga CCO-paneler, så Svarstudio blir enhetlig. Shadow-
    // host isolerar fortfarande artifactens 141 egna klasser från sidan.
    const host = el('div', {
      style: 'display:block;width:100%;height:100%;overflow:hidden',
    });
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + css + '</style>' + html;
    const $ = (sel) => root.querySelector(sel);
    const $$ = (sel) => Array.from(root.querySelectorAll(sel));

    // Artifactens egen rubrik/verktygsrad (hjälte + ov-bar med tabbar/pillar)
    // ersätts av panelmodalens huvud: titel + standard-flikrad + stäng. Det tar
    // bort den extra vita ramen och ger identisk flikrad som övriga paneler.
    ['.ov-bar', '.phead', '.foot'].forEach((sel) => {
      const n = $(sel);
      if (n) n.style.display = 'none';
    });

    openModal({
      title: '★ Svarstudio',
      wide: true,
      tabs: panelTabs('svarstudio'),
      body: host,
    });

    // ── Bind trådens riktiga data ─────────────────────────────────────
    const setText = (sel, val) => {
      const n = $(sel);
      if (n && val != null && val !== '') n.textContent = val;
    };
    setText('.kk-name', ctx.customerName || 'Vald konversation');
    const avatarNode = $('.kk-av');
    if (avatarNode) {
      avatarNode.textContent = (ctx.avatar || (ctx.customerName || 'K').slice(0, 2)).toUpperCase();
    }
    const kkLines = $$('.kk-line');
    if (kkLines[0]) kkLines[0].lastChild.textContent = ' ' + (recipientEmail || ctx.email || '—');
    if (kkLines[1] && ctx.phone) kkLines[1].lastChild.textContent = ' ' + ctx.phone;

    // Kontext-sidebar: bind trådens riktiga värden (annars visas artifactens
    // exempeltext, t.ex. "Egzona K." / "Bekräfta fredag 09:00").
    setText('.do-v', ctx.doNow);
    setText('.block .val.soft', ctx.whyFocusSub || ctx.whyFocus);
    setText('.wb-section .wb-title', ctx.nextStep);
    setText('.wb-section .wb-sub', ctx.nextStepSub);
    const cellMap = {
      agent: ctx.agent,
      status: ctx.status,
      sla: ctx.sla,
      prioritet: ctx.priority,
      churn: ctx.churnRisk,
    };
    $$('.cell').forEach((cell) => {
      const key = (cell.querySelector('.k')?.textContent || '').trim().toLowerCase();
      const v = cellMap[key];
      const vEl = cell.querySelector('.v');
      if (vEl && v != null && v !== '' && v !== '—') vEl.textContent = v;
    });

    // meddelanden i tråden (om live-context har dem, annars artifactens exempel)
    const msgsWrap = $('.msgs');
    const liveMsgs = Array.isArray(ctx.latestMessages) ? ctx.latestMessages : null;
    if (msgsWrap && liveMsgs && liveMsgs.length) {
      msgsWrap.innerHTML = '';
      liveMsgs.slice(-6).forEach((mssg) => {
        const outgoing = mssg.dir === 'outgoing';
        const row = el('div', { class: 'msg' + (outgoing ? ' is-outgoing' : ' is-incoming') });
        const src = el('div', { class: 'msg-src' }, [
          el('span', { class: 'msg-chan chan-mail' }, outgoing ? 'Klinik' : 'Mail'),
          el('div', { class: 'msg-time' }, cleanText(mssg.time || '')),
        ]);
        const body = el('div', { class: 'msg-body' }, cleanText(mssg.body || ''));
        row.appendChild(src);
        row.appendChild(body);
        msgsWrap.appendChild(row);
      });
    } else if (msgsWrap && ctx.threadSnippet) {
      msgsWrap.innerHTML = '';
      const row = el('div', { class: 'msg' }, [
        el('div', { class: 'msg-src' }, [
          el('span', { class: 'msg-chan chan-mail' }, cleanText(ctx.threadVia || 'Mail')),
          el('div', { class: 'msg-time' }, cleanText(ctx.threadDate || '')),
        ]),
        el('div', { class: 'msg-body' }, cleanText(ctx.threadSnippet)),
      ]);
      msgsWrap.appendChild(row);
    }

    // Till-fält (redigerbart, förvalt kundens adress)
    const toInput = $('.frow .field input');
    if (toInput) {
      toInput.removeAttribute('readonly');
      toInput.value = recipientEmail || '';
      if (!recipientEmail) toInput.placeholder = 'Mottagare saknas i vald tråd';
    }

    // Från (mailbox) — bygg om ur trådens tillåtna mailbox-spår (PR6-regeln),
    // med artifactens rail-avatar-stil.
    const picker = $('#mailboxPicker');
    if (picker && mailboxes.length) {
      picker.innerHTML = '';
      mailboxes.forEach((mbx) => {
        const tone = railToneFor(mbx.name, mbx.email);
        const opt = el(
          'button',
          {
            class: 'mailbox-opt',
            type: 'button',
            'aria-pressed': mbx.id === state.mailboxId ? 'true' : 'false',
          },
          [
            el(
              'span',
              { class: 'rail-av rail-av--' + tone },
              (mbx.name || mbx.email || '?').slice(0, 1).toUpperCase()
            ),
            el('span', { class: 'mo-meta' }, [
              el('span', { class: 'mo-name' }, mbx.name || mbx.email),
              el('span', { class: 'mo-mail' }, mbx.email),
            ]),
          ]
        );
        picker.appendChild(opt);
      });
    }

    // ── Signatur (branded) ────────────────────────────────────────────
    const sigTpl = $('#sigTpl');
    const sigRender = $('#sigRender');
    const sigCap = $('#sigCap');
    const sigWho = $('#sigWho');
    const sigRow = $('#sigRow');
    const sigCtrlRow = $('#sigCtrlRow');
    const sigHint = $('#sigHint');
    const SIG_BY_FULLNAME = { 'Fazli Krasniqi': 'fazli', 'Egzona Krasniqi': 'egzona' };
    function renderBrandedSig(fullName) {
      if (!sigRender) return;
      if (!fullName) {
        sigRender.innerHTML = '';
        if (sigCap) sigCap.style.display = 'none';
        return;
      }
      if (sigTpl && sigTpl.firstElementChild) {
        const node = sigTpl.firstElementChild.cloneNode(true);
        const nm = node.querySelector('.sig-name');
        if (nm) nm.textContent = fullName;
        sigRender.innerHTML = '';
        sigRender.appendChild(node);
      }
      if (sigCap) sigCap.style.display = 'flex';
      if (sigWho) sigWho.textContent = fullName.split(' ')[0];
    }

    // ── Redigerare + state-koppling ───────────────────────────────────
    const editor = $('#editor');
    const wc = $('#wc');
    const pvBody = $('#pvBody');
    const pvFrom = $('#pvFrom');
    const pvTo = $('.pv-to');
    const pvHdr = $('.pv-hdr');
    const SIG_DIVIDER = '\n\n— — — — —\n';
    const messageOf = (b) => String(b || '').split(SIG_DIVIDER)[0];
    function syncBodyFromEditor() {
      const msg = editor ? editor.value : '';
      state.body = state.signatureId
        ? applySignatureToBody(msg, state.signatureId)
        : messageOf(msg);
      if (wc) {
        const t = msg.trim();
        wc.textContent = (t ? t.split(/\s+/).length : 0) + ' ord';
      }
      if (pvBody) pvBody.textContent = msg || 'Börja skriva, eller välj ett AI-förslag ovan…';
    }
    if (editor) {
      editor.value = messageOf(state.body);
      editor.addEventListener('input', syncBodyFromEditor);
    }

    // subjekt i preview
    if (pvTo) pvTo.textContent = recipientEmail || '—';
    if (pvHdr) {
      const amneDiv = pvHdr.children[2];
      if (amneDiv) amneDiv.innerHTML = '<b>Ämne</b> ' + (state.subject || '');
    }

    function pressMailbox(opt) {
      $$('#mailboxPicker .mailbox-opt').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      opt.setAttribute('aria-pressed', 'true');
      const nm = opt.querySelector('.mo-name')?.textContent || '';
      const ml = opt.querySelector('.mo-mail')?.textContent || '';
      const match = mailboxes.find((m) => m.email === ml || m.name === nm);
      if (match) state.mailboxId = match.id;
      if (pvFrom) pvFrom.textContent = nm + ' · ' + ml;
      // Signatur-läge: contact@ → fritt val; annars låst till avsändaren.
      const tone = railToneFor(nm, ml);
      if (tone === 'contact') {
        if (sigCtrlRow) sigCtrlRow.classList.remove('is-locked');
        if (sigHint) sigHint.textContent = 'Från contact@ — välj vem som signerar';
      } else {
        const full = tone === 'egzona' ? 'Egzona Krasniqi' : 'Fazli Krasniqi';
        pressSig(full);
        if (sigCtrlRow) sigCtrlRow.classList.add('is-locked');
        if (sigHint) sigHint.textContent = 'Signatur låst till ' + nm;
      }
    }
    function pressSig(fullName) {
      let target = '';
      $$('#sigRow .pill').forEach((b) => {
        const full = b.getAttribute('data-sig');
        const on = fullName ? full === fullName : full === '';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('is-active', on);
        if (on) target = full;
      });
      state.signatureId = SIG_BY_FULLNAME[target] || (target ? 'fazli' : '');
      renderBrandedSig(target);
      syncBodyFromEditor();
    }
    if (picker) {
      picker.addEventListener('click', (e) => {
        const o = e.target.closest('.mailbox-opt');
        if (o) pressMailbox(o);
      });
    }
    if (sigRow) {
      sigRow.addEventListener('click', (e) => {
        const b = e.target.closest('.pill');
        if (!b || (sigCtrlRow && sigCtrlRow.classList.contains('is-locked'))) return;
        pressSig(b.getAttribute('data-sig'));
      });
    }

    // TON/SPÅR-piller → state
    $$('#toneRow .pill').forEach((p) =>
      p.addEventListener('click', () => {
        const was = p.getAttribute('aria-pressed') === 'true';
        $$('#toneRow .pill').forEach((x) => {
          x.setAttribute('aria-pressed', 'false');
          x.classList.remove('is-active');
        });
        if (!was) {
          p.setAttribute('aria-pressed', 'true');
          p.classList.add('is-active');
          state.tone = (p.textContent || '').trim().toLowerCase();
        } else {
          state.tone = null;
        }
      })
    );
    $$('#trackRow .pill').forEach((p) =>
      p.addEventListener('click', () => {
        $$('#trackRow .pill').forEach((x) => {
          x.setAttribute('aria-pressed', 'false');
          x.classList.remove('is-active');
        });
        p.setAttribute('aria-pressed', 'true');
        p.classList.add('is-active');
        state.track = (p.textContent || '').trim().toLowerCase();
      })
    );

    // AI-förslagsvarianter → fyll editorn (trådanpassad text)
    const firstName = (ctx.customerName || '').split(/\s+/)[0] || 'där';
    const variantText = [
      'Hej ' +
        firstName +
        '!\n\nVad roligt att höra från dig. Jag bekräftar gärna nästa steg och återkommer med en tydlig tid och det du behöver inför besöket.\n\nHör av dig om något behöver justeras!',
      'Hej ' +
        firstName +
        '!\n\nTack för ditt meddelande, det ska bli ett nöje att hjälpa dig. Vi tar det i lugn takt och du får ställa alla frågor du vill. Jag återkommer med en bekräftelse.',
      'Hej ' + firstName + '!\n\nKlart, jag ordnar det. Jag återkommer strax med en bekräftelse.',
    ];
    $$('.variant').forEach((b) => {
      const idx = +b.getAttribute('data-v');
      b.addEventListener('click', () => {
        $$('.variant').forEach((x) => x.classList.remove('is-picked'));
        b.classList.add('is-picked');
        if (editor) {
          // Kundtext: strippa ev. streck/avslutshälsning innan den hamnar i editorn.
          editor.value = sanitizeReplyText(variantText[idx] || '');
          syncBodyFromEditor();
        }
        markStep('draft');
      });
    });
    const wbCta = $('#wbCta');
    if (wbCta) {
      wbCta.addEventListener('click', () => {
        const v0 = $('.variant');
        if (v0) v0.click();
      });
    }

    // ── Stepper (speglar draft-status) ────────────────────────────────
    const stepEls = $$('#stepper .sstep');
    function markStep(status) {
      const order = ['draft', 'needs_approval', 'approved', 'sent'];
      let idx = order.indexOf(status);
      if (idx < 0) idx = 0;
      stepEls.forEach((elm, i) => {
        elm.classList.remove('active', 'done');
        if (i < idx) elm.classList.add('done');
        else if (i === idx) elm.classList.add('active');
      });
    }

    // ── Toast i shadow ────────────────────────────────────────────────
    const toastEl = $('#toast');
    let toastTimer = null;
    function say(msg) {
      if (!toastEl) {
        toast(msg);
        return;
      }
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    // ── Kontrollerad sänd-kedja (samma endpoints som klassiska modalen) ─
    function recipientBlock() {
      const v = (toInput?.value || '').trim();
      if (!v) return 'Mottagare saknas i vald tråd.';
      if (/@hairtpclinic\.com$/i.test(v)) return 'Klinikadress kan inte vara mottagare.';
      return null;
    }
    async function saveDraftV2(targetStatus) {
      const blocked = recipientBlock();
      if (blocked) {
        say('✗ ' + blocked);
        return false;
      }
      try {
        if (!state.draftId) {
          const r = await fetch('/api/v1/cco-comm/drafts', {
            method: 'POST',
            headers: adminAuthHeaders({
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            }),
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
          // Endpoints svarar { draft } (ingen ok-flagga) → använd HTTP-status.
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.draft) throw new Error(j.error || 'kunde inte spara utkast');
          state.draftId = j.draft.draftId || j.draft.id;
          auditStudioEvent('studio.draft_created', {
            draftId: state.draftId,
            track: state.track,
            tone: state.tone,
            ui: 'v2',
          });
        } else {
          await fetch('/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId), {
            method: 'PATCH',
            headers: adminAuthHeaders({
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            }),
            body: JSON.stringify({
              subject: state.subject,
              body: state.body,
              signatureId: state.signatureId,
            }),
          });
          auditStudioEvent('studio.draft_edited', { draftId: state.draftId, ui: 'v2' });
        }
        if (targetStatus && targetStatus !== 'draft') {
          const r2 = await fetch(
            '/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId) + '/transition',
            {
              method: 'POST',
              headers: adminAuthHeaders({
                'Content-Type': 'application/json',
                'x-cco-role': ROLE,
                'x-cco-tenant': TENANT,
              }),
              body: JSON.stringify({ status: targetStatus, reason: 'via Svarstudio v2' }),
            }
          );
          const j2 = await r2.json().catch(() => ({}));
          if (!r2.ok || !j2.draft) throw new Error(j2.error || 'kunde inte uppdatera status');
          auditStudioEvent('studio.transitioned', {
            draftId: state.draftId,
            to: targetStatus,
            ui: 'v2',
          });
        }
        markStep(targetStatus || 'draft');
        return true;
      } catch (e) {
        say('✗ ' + e.message);
        return false;
      }
    }

    const btnQueue = $('#btnQueue');
    const btnSave = $('#btnSave');
    const btnPreview = $('#btnPreview');
    if (btnQueue) {
      btnQueue.addEventListener('click', async () => {
        if (!(editor && editor.value.trim())) {
          say('Inget att köa — välj eller skriv ett svar');
          return;
        }
        // "Godkänn & köa" = skicka för godkännande (needs_approval).
        // Live-utskick sker ALDRIG härifrån — det är serverspärrat.
        if (await saveDraftV2('needs_approval'))
          say('▶ Skickat för godkännande · live-utskick låst');
      });
    }
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        if (await saveDraftV2('draft')) say('💾 Utkast sparat');
      });
    }
    if (btnPreview) {
      btnPreview.addEventListener('click', () =>
        say(
          editor && editor.value.trim()
            ? 'Förhandsvisning uppdaterad nedan'
            : 'Skriv ett svar först'
        )
      );
    }
    // ⌘/Ctrl+Enter → köa
    root.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && btnQueue) {
        e.preventDefault();
        btnQueue.click();
      }
    });

    // rollup toggle + kontext-tabbar (presentationsdetaljer)
    const rollup = $('#rollup');
    const rt = $('#rollupToggle');
    const rl = $('#rollupLbl');
    if (rt && rollup) {
      rt.addEventListener('click', () => {
        const collapsed = rollup.classList.toggle('collapsed');
        rt.setAttribute('aria-expanded', String(!collapsed));
        if (rl) rl.textContent = collapsed ? 'Visa alla' : 'Fäll ihop';
      });
    }
    if (ctx.aiSummary) {
      const panel = $('#ctxPanel');
      if (panel) panel.innerHTML = '<b>★ AI-sammanfattning.</b> ' + cleanText(ctx.aiSummary);
    }

    // ── Kundkort/dossier (fas 1, steg 3) ─────────────────────────────────
    // Hämtar "all info om kunden" från RBAC-endpointen. Journalinnehåll finns
    // aldrig i svaret: Svarstudion visar bara metadata som antal + senaste datum.
    function dossierCountLabel(count, singular, plural) {
      const n = Math.max(0, Number(count) || 0);
      return n + ' ' + (n === 1 ? singular : plural);
    }
    function dossierDateLabel(value) {
      const raw = cleanText(value);
      if (!raw) return '';
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw.slice(0, 16);
      return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function renderDossierMini(dossier, note) {
      const box = $('#customerDossier');
      if (!box) return;
      const body = box.querySelector('.dossier-mini__body');
      if (!body) return;
      body.innerHTML = '';
      if (!dossier) {
        body.appendChild(el('p', { class: 'dossier-mini__empty' }, note || 'Kundkort saknas.'));
        return;
      }
      const name = cleanText(dossier.identity?.name);
      const emails = Array.isArray(dossier.contact?.emails) ? dossier.contact.emails : [];
      const phones = Array.isArray(dossier.contact?.phones) ? dossier.contact.phones : [];
      if (name) setText('.kk-name', name);
      if (emails[0] && kkLines[0]) kkLines[0].lastChild.textContent = ' ' + emails[0];
      if (phones[0] && kkLines[1]) kkLines[1].lastChild.textContent = ' ' + phones[0];

      const portalCount = dossier.portal?.count || 0;
      const portalUnread = dossier.portal?.unread || 0;
      const metrics = [
        dossierCountLabel(dossier.bookings?.count, 'bokning', 'bokningar'),
        dossierCountLabel((dossier.cases || []).length, 'ärende', 'ärenden'),
        dossierCountLabel(portalCount, 'portalmeddelande', 'portalmeddelanden') +
          (portalUnread ? ' · ' + portalUnread + ' olästa' : ''),
        dossierCountLabel(dossier.threads?.count, 'tråd', 'trådar'),
        dossierCountLabel(dossier.journal?.count, 'journalpost', 'journalposter'),
      ];
      const latestJournal = dossierDateLabel(dossier.journal?.latestAt);
      body.appendChild(
        el(
          'div',
          { class: 'dossier-mini__metrics' },
          metrics.map((m) => el('span', {}, m))
        )
      );
      body.appendChild(
        el(
          'p',
          { class: 'dossier-mini__safe' },
          latestJournal
            ? 'Journal: endast metadata visas här · senaste ' + latestJournal
            : 'Journal: endast metadata visas här.'
        )
      );
      const nextBooking = Array.isArray(dossier.bookings?.upcoming)
        ? dossier.bookings.upcoming[0]
        : null;
      const openCase = Array.isArray(dossier.cases) ? dossier.cases[0] : null;
      const journey = dossier.journey || null;
      const journeyLabel = journey ? cleanText(journey.stepLabel || journey.step) : '';
      const journeyBit = journeyLabel
        ? 'Resa: ' +
          journeyLabel +
          (journey.sideState ? ' (' + cleanText(journey.sideState) + ')' : '') +
          (journey.totalSteps
            ? ' · ' + (journey.completedCount || 0) + '/' + journey.totalSteps + ' steg'
            : '')
        : '';
      const summaryBits = [
        journeyBit,
        nextBooking
          ? 'Nästa bokning: ' +
            [nextBooking.service, dossierDateLabel(nextBooking.startsAt)]
              .filter(Boolean)
              .join(' · ')
          : '',
        openCase
          ? 'Senaste ärende: ' + [openCase.title, openCase.status].filter(Boolean).join(' · ')
          : '',
        dossier.threads?.needsReply ? dossier.threads.needsReply + ' trådar behöver svar' : '',
      ].filter(Boolean);
      if (summaryBits.length) {
        body.appendChild(
          el(
            'ul',
            { class: 'dossier-mini__list' },
            summaryBits.map((item) => el('li', {}, item))
          )
        );
      }
      const panel = $('#ctxPanel');
      if (panel) {
        panel.innerHTML =
          '<b>Kundkort.</b> ' +
          cleanText(
            [
              name || ctx.customerName || 'Vald kund',
              metrics.join(' · '),
              latestJournal ? 'senaste journalmetadata ' + latestJournal : '',
            ]
              .filter(Boolean)
              .join(' · ')
          );
      }
    }
    async function loadDossierMini() {
      const id = cleanText(customerId || ctx.customerId || recipientEmail || ctx.email);
      if (!id) {
        renderDossierMini(null, 'Välj en kundtråd för att läsa kundkort.');
        return;
      }
      try {
        const params = new URLSearchParams();
        const email = firstCustomerEmailValue(recipientEmail, ctx.email, ctx.customerEmail);
        if (email) params.set('email', email);
        if (ctx.conversationKey) params.set('conversationKey', ctx.conversationKey);
        const qs = params.toString();
        const r = await fetch(
          '/api/v1/cco/runtime/customer/' +
            encodeURIComponent(id) +
            '/dossier' +
            (qs ? '?' + qs : ''),
          {
            cache: 'no-store',
            headers: adminAuthHeaders({ 'x-cco-role': ROLE, 'x-cco-tenant': TENANT }),
          }
        );
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.dossier) throw new Error(j.error || 'kundkort saknas');
        renderDossierMini(j.dossier);
      } catch (_error) {
        renderDossierMini(null, 'Kundkort kunde inte laddas just nu.');
      }
    }
    renderDossierMini(null, 'Hämtar lokalt kundkort…');
    loadDossierMini();

    // ── Portal-chatt (Fas 2, steg 4b): läs + svara inline i den fria kanalen ──
    // Rent tillägg i konversationsytan. Klinik-svar går till outbound-endpointen
    // (mail.send), aldrig via Graph/live-send. Fel får aldrig störa Svarstudion.
    function renderPortalChat(messages) {
      const anchor = $('#rollup') || $('.msgs') || $('.main');
      if (!anchor || !anchor.parentNode) return;
      const esc = (s) =>
        String(s == null ? '' : s).replace(
          /[&<>"]/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );
      let panel = $('#portalChat');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'portalChat';
        panel.className = 'block';
        panel.style.marginTop = '10px';
        anchor.parentNode.insertBefore(panel, anchor.nextSibling);
      }
      const bubbles =
        (messages || [])
          .map((m) => {
            const out = m.direction === 'outbound';
            return (
              '<div style="display:flex;justify-content:' +
              (out ? 'flex-end' : 'flex-start') +
              ';margin:4px 0"><div style="max-width:78%;padding:7px 10px;border-radius:12px;font-size:12px;line-height:1.4;' +
              (out
                ? 'background:var(--rose-grad);color:var(--studio-ink)'
                : 'background:var(--sunken);color:var(--ink)') +
              '">' +
              esc(m.body) +
              '</div></div>'
            );
          })
          .join('') ||
        '<div style="font-size:11px;color:var(--ink-3);padding:4px 0">Inga portal-meddelanden än.</div>';
      panel.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">' +
        '<div class="glabel">★ Portal-chatt (fri kanal)</div>' +
        '<div style="display:flex;gap:6px">' +
        '<button id="portalLinkBtn" type="button" title="Skapa en magisk länk och infoga den i svaret — kunden chattar då gratis i portalen istället för via SMS" ' +
        'style="border:1px solid var(--line-soft);border-radius:8px;padding:4px 9px;font:inherit;font-size:11px;font-weight:600;cursor:pointer;background:var(--field-bg);color:var(--studio)">🔗 Skapa portal-länk</button>' +
        '<button id="portalRotateBtn" type="button" title="Rotera länken (t.ex. vid läck-misstanke) — gamla länken slutar gälla och en ny infogas i svaret" ' +
        'style="border:1px solid var(--line-soft);border-radius:8px;padding:4px 8px;font:inherit;font-size:11px;cursor:pointer;background:var(--field-bg);color:var(--ink-3)">⟳</button>' +
        '<button id="portalRevokeBtn" type="button" title="Återkalla länken — kunden kan inte längre öppna portalen förrän en ny länk skapas" ' +
        'style="border:1px solid var(--line-soft);border-radius:8px;padding:4px 8px;font:inherit;font-size:11px;cursor:pointer;background:var(--field-bg);color:var(--ink-3)">⊘</button>' +
        '</div>' +
        '</div>' +
        '<div style="max-height:180px;overflow:auto">' +
        bubbles +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<input id="portalReplyInput" type="text" placeholder="Svara i portalen…" ' +
        'style="flex:1;min-width:0;border:1px solid var(--line-soft);border-radius:8px;padding:6px 8px;font:inherit;font-size:12px;background:var(--field-bg);color:var(--ink)">' +
        '<button id="portalReplyBtn" type="button" style="border:0;border-radius:8px;padding:6px 12px;' +
        'font:inherit;font-size:12px;font-weight:700;cursor:pointer;background:var(--studio);color:#fff">Skicka</button>' +
        '</div>';
      // "Skapa portal-länk": myntar patientens magiska länk och INFOGAR den i
      // svaret. Leveransen sker alltså i den kontrollerade mailkedjan (staff
      // godkänner som vanligt) — vi skickar aldrig något direkt härifrån.
      const linkBtn = panel.querySelector('#portalLinkBtn');
      if (linkBtn) {
        linkBtn.addEventListener('click', async () => {
          linkBtn.disabled = true;
          const original = linkBtn.textContent;
          try {
            const id = cleanText(customerId || ctx.customerId);
            if (!id) return;
            const r = await fetch(
              '/api/v1/cco/runtime/customer/' + encodeURIComponent(id) + '/portal-access',
              {
                method: 'POST',
                headers: adminAuthHeaders({
                  'Content-Type': 'application/json',
                  'x-cco-role': ROLE,
                  'x-cco-tenant': TENANT,
                }),
              }
            );
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.url) {
              const line =
                'Du kan skriva till oss direkt i din trygga portal (inget SMS behövs): ' + j.url;
              // Infoga i svaret så länken går ut i det godkända mailet.
              if (typeof editor !== 'undefined' && editor) {
                editor.value =
                  (editor.value ? editor.value.replace(/\s*$/, '') + '\n\n' : '') + line;
                syncBodyFromEditor();
              }
              try {
                await navigator.clipboard?.writeText(j.url);
              } catch (_c) {
                /* clipboard valfritt */
              }
              linkBtn.textContent = '✓ Länk infogad';
              setTimeout(() => {
                linkBtn.textContent = original;
              }, 2000);
            }
          } catch (_e) {
            /* tillägg — stör aldrig Svarstudion */
          } finally {
            linkBtn.disabled = false;
          }
        });
      }
      // Infoga en (roterad/ny) länk i svaret + kopiera. Delad med rotera-knappen.
      function insertPortalLink(url) {
        const line = 'Du kan skriva till oss direkt i din trygga portal (inget SMS behövs): ' + url;
        if (typeof editor !== 'undefined' && editor) {
          editor.value = (editor.value ? editor.value.replace(/\s*$/, '') + '\n\n' : '') + line;
          syncBodyFromEditor();
        }
        try {
          navigator.clipboard?.writeText(url);
        } catch (_c) {
          /* clipboard valfritt */
        }
      }
      async function postPortalAccess(suffix) {
        const id = cleanText(customerId || ctx.customerId);
        if (!id) return { ok: false };
        const r = await fetch(
          '/api/v1/cco/runtime/customer/' + encodeURIComponent(id) + '/portal-access' + suffix,
          {
            method: 'POST',
            headers: adminAuthHeaders({
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            }),
          }
        );
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
      }
      // Rotera: återkalla nuvarande + infoga en ny länk i svaret.
      const rotateBtn = panel.querySelector('#portalRotateBtn');
      if (rotateBtn) {
        rotateBtn.addEventListener('click', async () => {
          rotateBtn.disabled = true;
          const original = rotateBtn.textContent;
          try {
            const { ok, j } = await postPortalAccess('/rotate');
            if (ok && j.url) {
              insertPortalLink(j.url);
              rotateBtn.textContent = '✓';
              setTimeout(() => {
                rotateBtn.textContent = original;
              }, 1500);
            }
          } catch (_e) {
            /* tillägg — stör aldrig Svarstudion */
          } finally {
            rotateBtn.disabled = false;
          }
        });
      }
      // Återkalla: stäng av länken (bekräftas först).
      const revokeBtn = panel.querySelector('#portalRevokeBtn');
      if (revokeBtn) {
        revokeBtn.addEventListener('click', async () => {
          if (typeof confirm === 'function' && !confirm('Återkalla kundens portal-länk?')) return;
          revokeBtn.disabled = true;
          const original = revokeBtn.textContent;
          try {
            const { ok, j } = await postPortalAccess('/revoke');
            if (ok && j.revoked) {
              revokeBtn.textContent = '✓ Återkallad';
              setTimeout(() => {
                revokeBtn.textContent = original;
              }, 1800);
            }
          } catch (_e) {
            /* tillägg — stör aldrig Svarstudion */
          } finally {
            revokeBtn.disabled = false;
          }
        });
      }
      const btn = panel.querySelector('#portalReplyBtn');
      const input = panel.querySelector('#portalReplyInput');
      if (btn && input) {
        btn.addEventListener('click', async () => {
          const body = input.value.trim();
          if (!body) return;
          btn.disabled = true;
          try {
            const id = cleanText(customerId || ctx.customerId);
            const r = await fetch(
              '/api/v1/cco/runtime/customer/' + encodeURIComponent(id) + '/portal-message',
              {
                method: 'POST',
                headers: adminAuthHeaders({
                  'Content-Type': 'application/json',
                  'x-cco-role': ROLE,
                  'x-cco-tenant': TENANT,
                }),
                body: JSON.stringify({ body }),
              }
            );
            if (r.ok) {
              input.value = '';
              loadPortalChat();
            }
          } catch (_e) {
            /* tillägg — stör aldrig Svarstudion */
          } finally {
            btn.disabled = false;
          }
        });
      }
    }
    async function loadPortalChat() {
      const id = cleanText(customerId || ctx.customerId);
      if (!id) return;
      try {
        const r = await fetch(
          '/api/v1/cco/runtime/customer/' + encodeURIComponent(id) + '/portal-messages',
          {
            cache: 'no-store',
            headers: adminAuthHeaders({ 'x-cco-role': ROLE, 'x-cco-tenant': TENANT }),
          }
        );
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.messages) renderPortalChat(j.messages);
      } catch (_e) {
        /* portal-chatt är ett tillägg — fel får aldrig störa Svarstudion */
      }
    }
    loadPortalChat();

    const qaDossier = $('.qa--dossier');
    if (qaDossier) qaDossier.addEventListener('click', () => openPatientHub(ctx));
    const qaSign = $('.qa--sign');
    if (qaSign) qaSign.addEventListener('click', () => openSignaturer(ctx));

    // Initial render (modalen är redan monterad av openModal ovan)
    pressSig('Fazli Krasniqi');
    const pressedMbx =
      $$('#mailboxPicker .mailbox-opt').find((o) => o.getAttribute('aria-pressed') === 'true') ||
      $('#mailboxPicker .mailbox-opt');
    if (pressedMbx) pressMailbox(pressedMbx);
    syncBodyFromEditor();
    markStep('draft');
    auditStudioEvent('studio.v2_rendered', { customerId, hasRecipient: !!recipientEmail });
    return true;
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
    // PR 6 — Från begränsas till trådens mailbox-spår (mailboxar kunden faktiskt
    // skrivit till/berör tråden). Ingen bredare adressbok. Dedupe behålls.
    const mailboxes = [...contextMailboxes].reduce((list, mailbox) => {
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
    const recipientClinicMessage =
      'Klinikadress (@hairtpclinic.com) kan inte vara mottagare. Ange kundens e-postadress.';
    // PR 6 — dynamiskt send-lås: Till kan redigeras när kundmail finns, men
    // manuellt inskriven klinikadress (eller tom) håller "Skicka svar" låst.
    let recipientBlockedReason = recipientMissing ? recipientMissingMessage : null;
    function currentRecipientBlock() {
      const value = cleanText(recipientInput.value);
      if (!value) return recipientMissingMessage;
      if (isHairTpMailboxEmail(value)) return recipientClinicMessage;
      return null;
    }

    // Ingen inbäddad SLA/streck i kundtexten (kan vara "—" eller platshållare).
    const initialBody =
      'Hej ' +
      (ctx.customerName || '') +
      ',\n\nTack för ditt meddelande. Jag bekräftar gärna nästa steg och återkommer med en tydlig bekräftelse och det du behöver inför besöket.' +
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

    // Svarstudio v2 (artifacten 1:1 i shadow-DOM). Lyckas mount:en visas den och
    // vi hoppar över den klassiska modalen; annars faller vi igenom.
    if (USE_SVARSTUDIO_V2) {
      try {
        const mounted = await mountSvarstudioV2({
          ctx,
          state,
          mailboxes,
          recipientEmail,
          customerId,
        });
        if (mounted) return;
      } catch (_e) {
        /* assets saknas / mount-fel → klassiska modalen nedan */
      }
    }

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
    // PR 18 — dossier (nivå 2, "vem är detta") öppnas från kund-cardet med vald
    // tråds kund. Kompletterar tråden, inte i svarslinjen, ingen live-send.
    contextPanel.appendChild(
      el(
        'button',
        {
          class: 'wb-cta-btn',
          type: 'button',
          'data-patienthub-open': 'true',
          onclick: () => openPatientHub(ctx),
        },
        '👤 Öppna dossier'
      )
    );
    // PR 20 — signaturer & samtycken (nivå 2) öppnas från kund-cardet med vald
    // tråds kund: vilka dokument väntar patienten på att signera. Ingen live-send.
    contextPanel.appendChild(
      el(
        'button',
        {
          class: 'wb-cta-btn',
          type: 'button',
          'data-signaturer-open': 'true',
          onclick: () => openSignaturer(ctx),
        },
        '✍️ Signaturer & samtycken'
      )
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
    // SKICKAT / KÖ (utgående svarspipeline) — sektion inne i Svarstudio.
    contextPanel.appendChild(
      el('div', { class: 'wb-section' }, [
        el('div', { class: 'wb-section-kicker' }, '📤 Utgående'),
        el(
          'button',
          {
            class: 'wb-cta-btn',
            type: 'button',
            'data-skickat-open': 'true',
            onclick: () => openSkickat(ctx),
          },
          'Skickat / kö'
        ),
      ])
    );
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
    // Nyckelfakta + risk som chips (samma chip-språk som kk-korten) i stället
    // för den gamla spec-grid:en. Ingen ny komponent — återanvänder
    // wb-context-chip med semantiska varianter för churn/engagemang.
    const pillRow = el('div', { class: 'wb-context-chips' });
    const factChip = (label, value, mod) => {
      if (!value) return;
      pillRow.appendChild(
        el('span', { class: 'wb-context-chip' + (mod ? ' wb-context-chip--' + mod : '') }, [
          label,
          el('span', { class: 'ct' }, value),
        ])
      );
    };
    factChip('Agent', ctx.agent);
    factChip('Status', ctx.status);
    factChip('SLA', ctx.sla);
    factChip('Prioritet', ctx.priority);
    factChip('Churn', ctx.churnRisk, 'warn');
    factChip('Engagemang', ctx.engagement, 'info');
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
            renderLivePreview();
            auditStudioEvent('studio.template_selected', { templateId: sm.id });
            toast('★ Mall infogad: ' + sm.label);
          },
        })
      );
    }
    // PR 17 — makronbiblioteket (v3) öppnas från snabbmall-raden med vald
    // tråds kontext. Snabbmallarna ovan är oförändrade; detta är fler makron.
    const makronOpenBtn = el(
      'button',
      {
        class: 'wb-chip',
        type: 'button',
        'data-makron-open': 'true',
        onclick: () => openMakron(ctx),
      },
      '📚 Fler makron'
    );
    snabbRow.appendChild(makronOpenBtn);
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
      oninput: () => {
        evaluateRecipient();
        renderLivePreview();
      },
    });
    const mailboxSelect = el('select', {
      onchange: () => {
        state.mailboxId = mailboxSelect.value;
        auditStudioEvent('studio.mailbox_selected', { mailboxId: state.mailboxId });
        updateMetaLine();
        renderLivePreview();
        renderMailboxAvatar();
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
    // Mailbox-avatar med rälsfärg (Kontakt teal / Fazli lila / Egzona guld).
    const mailboxAvatar = el('span', { class: 'wb-mbx-avatar' }, '');
    function renderMailboxAvatar() {
      const mb = mailboxes.find((m) => m.id === state.mailboxId);
      const label = cleanText((mb && (mb.name || mb.email || mb.id)) || state.mailboxId) || '?';
      mailboxAvatar.textContent = label.slice(0, 1).toUpperCase();
      const l = label.toLowerCase();
      let tone = 'info';
      if (l.includes('fazli')) tone = 'fazli';
      else if (l.includes('egzona')) tone = 'egzona';
      else if (l.includes('contact') || l.includes('kontakt') || l.includes('kons'))
        tone = 'contact';
      mailboxAvatar.className = 'wb-mbx-avatar wb-mbx-avatar--' + tone;
    }
    renderMailboxAvatar();
    replyBlock.appendChild(
      el('div', { class: 'wb-form-row' }, [
        el('label', { class: 'wb-field' }, [
          el('span', { class: 'wb-field-lbl' }, 'Till'),
          recipientInput,
        ]),
        el('label', { class: 'wb-field' }, [
          el('span', { class: 'wb-field-lbl' }, 'Från'),
          el('div', { class: 'wb-mbx-row' }, [mailboxAvatar, mailboxSelect]),
        ]),
      ])
    );
    // Persistent varningsruta — visas när Till är tom eller klinikadress.
    const recipientWarning = el(
      'div',
      {
        style:
          'padding:9px 12px;background:linear-gradient(180deg,rgba(245,214,211,.82),rgba(255,244,219,.82));border:1px solid rgba(185,74,74,.28);border-radius:10px;font-size:11px;color:#8c2626;font-weight:700;display:none',
      },
      ''
    );
    replyBlock.appendChild(recipientWarning);

    // Uppdaterar send-lås + varning utifrån aktuellt Till-värde.
    function evaluateRecipient() {
      recipientBlockedReason = currentRecipientBlock();
      const blocked = Boolean(recipientBlockedReason);
      recipientInput.setAttribute('aria-invalid', blocked ? 'true' : 'false');
      recipientWarning.textContent = blocked ? '⚠ ' + recipientBlockedReason : '';
      recipientWarning.style.display = blocked ? '' : 'none';
      if (sendButton) {
        if (blocked) {
          sendButton.setAttribute('disabled', 'disabled');
          sendButton.setAttribute('aria-disabled', 'true');
          sendButton.setAttribute('title', recipientBlockedReason);
          sendButton.style.opacity = '0.48';
          sendButton.style.cursor = 'not-allowed';
        } else {
          sendButton.removeAttribute('disabled');
          sendButton.setAttribute('aria-disabled', 'false');
          sendButton.removeAttribute('title');
          sendButton.style.opacity = '';
          sendButton.style.cursor = '';
        }
      }
    }

    // Ämne + Body
    const subjectInput = el('input', { type: 'text', value: state.subject });
    subjectInput.addEventListener('input', (e) => {
      state.subject = e.target.value;
      renderLivePreview();
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
      renderLivePreview();
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

    // Inline live-preview "Så här blir mailet" — speglar det som komponeras.
    // Rent presentationslager: läser state/mailbox/mottagare, rör inte sändkedjan.
    const lpTo = el('span', { class: 'wb-lp-val' }, '');
    const lpFrom = el('span', { class: 'wb-lp-val wb-lp-from' }, '');
    const lpSubject = el('span', { class: 'wb-lp-val' }, '');
    const lpBody = el('pre', { class: 'wb-lp-body' }, '');
    function renderLivePreview() {
      const mb = mailboxes.find((m) => m.id === state.mailboxId);
      lpTo.textContent = cleanText(recipientInput.value) || '—';
      lpFrom.textContent = (mb && (mb.email || mb.name)) || state.mailboxId || '—';
      lpSubject.textContent = state.subject || '—';
      lpBody.textContent = state.body || 'Börja skriva, eller infoga en mall ovan…';
    }
    const livePreview = el('div', { class: 'wb-live-preview' }, [
      el('div', { class: 'wb-lp-head' }, [
        el('span', { class: 'wb-lp-title' }, 'Så här blir mailet'),
        el('span', { class: 'wb-lp-live' }, '● Uppdateras live'),
      ]),
      el('div', { class: 'wb-lp-hdr' }, [
        el('div', {}, [el('b', {}, 'Till'), lpTo]),
        el('div', {}, [el('b', {}, 'Från'), lpFrom]),
        el('div', {}, [el('b', {}, 'Ämne'), lpSubject]),
      ]),
      lpBody,
    ]);
    renderLivePreview();
    replyBlock.appendChild(livePreview);

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
        renderLivePreview();
        renderSigPreview();
      },
      'studio.signature_selected'
    );
    // Signatur-live-render: visar vald signatur direkt (v9-uppgifter).
    const sigWhoEl = el('span', { class: 'wb-sig-who' }, '');
    const sigBodyEl = el('pre', { class: 'wb-sig-body' }, '');
    function renderSigPreview() {
      const sig = SIGNATURES.find((s) => s.id === state.signatureId);
      sigWhoEl.textContent = sig ? sig.label : '—';
      sigBodyEl.textContent = sig ? sig.text : 'Ingen signatur vald.';
    }
    renderSigPreview();
    const sigPreview = el('div', { class: 'wb-sig-preview' }, [
      el('div', { class: 'wb-sig-cap' }, [
        el('span', {}, 'Signatur (bifogas i svaret) · '),
        sigWhoEl,
      ]),
      sigBodyEl,
    ]);
    replyBlock.appendChild(
      el('div', { class: 'wb-chip-row-sect', 'data-group': 'signatur' }, [
        el('span', { class: 'wb-section-kicker' }, 'Signatur'),
        sigChips,
        sigPreview,
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
          wordCount.textContent = bodyArea.value.split(/\s+/).filter(Boolean).length + ' ord';
          renderLivePreview();
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
    // PR 19 — no-show-hantering (nivå 2) öppnas från bokningsraden med vald
    // tråds kund. Kompletterar bokning/kalender, inte i svarslinjen.
    const noShowBtn = chipBtn('🚫 No-show', { onclick: () => openNoShow(ctx) });
    noShowBtn.setAttribute('data-noshow-open', 'true');
    smartActions.appendChild(noShowBtn);
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

    // 4-stegs sändstege — visualiserar den kontrollerade sändkedjan.
    // Rent presentationslager: speglar draft-status, ändrar INGEN sändlogik.
    const STEP_DEFS = [
      { key: 'draft', label: 'Utkast', sub: 'du' },
      { key: 'needs_approval', label: 'Granskad', sub: 'operatör' },
      { key: 'approved', label: 'Godkänd', sub: 'owner' },
      { key: 'sent', label: 'Skickad', sub: 'Graph' },
    ];
    const stepEls = STEP_DEFS.map((s) =>
      el('div', { class: 'wb-sstep' }, [
        el('span', { class: 'wb-sdot' }),
        el('span', { class: 'wb-sst' }, s.label),
        el('span', { class: 'wb-sss' }, s.sub),
      ])
    );
    function renderStepper(status) {
      const order = ['draft', 'needs_approval', 'approved', 'sent'];
      let idx = order.indexOf(status);
      if (idx < 0) idx = 0;
      stepEls.forEach((elm, i) => {
        elm.classList.remove('is-done', 'is-active');
        if (i < idx) elm.classList.add('is-done');
        else if (i === idx) elm.classList.add('is-active');
      });
    }
    renderStepper('draft');
    replyBlock.appendChild(
      el('div', { class: 'wb-send-stepper' }, [
        el('div', { class: 'wb-sstep-kicker' }, 'Sändsäkerhet'),
        el('div', { class: 'wb-sstep-row' }, stepEls),
        el(
          'div',
          { class: 'wb-sstep-lock' },
          '🔒 Live-utskick är avstängt. Ett svar går utkast → granskning → owner-godkännande innan något lämnar systemet.'
        ),
      ])
    );

    main.appendChild(replyBlock);

    // ─── Workbench-grid wrapper ──────────────────────────────────────
    const workbenchGrid = el('div', { class: 'workbench-grid' }, [contextPanel, main]);

    // ─── Footer-actions ──────────────────────────────────────────────
    async function saveDraft(targetStatus) {
      if (recipientBlockedReason) {
        toast('✗ ' + recipientBlockedReason, 'err');
        return false;
      }
      try {
        if (!state.draftId) {
          const r = await fetch('/api/v1/cco-comm/drafts', {
            method: 'POST',
            headers: adminAuthHeaders({
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            }),
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
          // Endpoints svarar { draft } (ingen ok-flagga) → använd HTTP-status.
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.draft) throw new Error(j.error || 'kunde inte spara utkast');
          state.draftId = j.draft.draftId || j.draft.id;
          auditStudioEvent('studio.draft_created', {
            draftId: state.draftId,
            track: state.track,
            tone: state.tone,
          });
        } else {
          await fetch('/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId), {
            method: 'PATCH',
            headers: adminAuthHeaders({
              'Content-Type': 'application/json',
              'x-cco-role': ROLE,
              'x-cco-tenant': TENANT,
            }),
            body: JSON.stringify({
              subject: state.subject,
              body: state.body,
              signatureId: state.signatureId,
            }),
          });
          auditStudioEvent('studio.draft_edited', { draftId: state.draftId });
        }
        if (targetStatus && targetStatus !== 'draft') {
          const r2 = await fetch(
            '/api/v1/cco-comm/drafts/' + encodeURIComponent(state.draftId) + '/transition',
            {
              method: 'POST',
              headers: adminAuthHeaders({
                'Content-Type': 'application/json',
                'x-cco-role': ROLE,
                'x-cco-tenant': TENANT,
              }),
              body: JSON.stringify({ status: targetStatus, reason: 'via Svarstudio' }),
            }
          );
          const j2 = await r2.json().catch(() => ({}));
          if (!r2.ok || !j2.draft) throw new Error(j2.error || 'kunde inte uppdatera status');
          auditStudioEvent('studio.transitioned', { draftId: state.draftId, to: targetStatus });
        }
        renderStepper(targetStatus || 'draft');
        return true;
      } catch (e) {
        toast('✗ ' + e.message, 'err');
        return false;
      }
    }

    function showPreview() {
      if (recipientBlockedReason) {
        toast('✗ ' + recipientBlockedReason, 'err');
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
        onclick: async () => {
          if (recipientBlockedReason) {
            toast('✗ ' + recipientBlockedReason, 'err');
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
    // Synka send-lås + varning mot aktuellt Till-värde (tomt/klinik → låst).
    evaluateRecipient();

    const m = openModal({
      title: 'Arbetsyta · Svarstudio',
      tabs: panelTabs('svarstudio'),
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

  // ─── SMART ANTECKNING → v3 ───────────────────────────────────────────
  // Bygg vald live-tråds kontext (kund, tråd, ämne, senaste meddelanden,
  // mailbox, status/SLA) och skicka den till Smart anteckning v3.
  function buildSmartAnteckningContext() {
    const ctx = getLiveConversationContext() || getVisibleConversationContext() || {};
    const customerName = cleanText(ctx.customerName) || 'Vald kund';
    const subject = cleanText(ctx.subject)
      .replace(/^re:\s*/i, '')
      .trim();
    const messages = Array.isArray(ctx.latestMessages) ? ctx.latestMessages : [];
    const context = {
      source: cleanText(ctx.source) || 'konversationer',
      conversationKey: cleanText(ctx.conversationKey),
      customerName,
      customerSub: cleanText(ctx.customerSub) || cleanText(ctx.engagement),
      avatar: cleanText(ctx.avatar) || customerName.slice(0, 1).toUpperCase(),
      subject,
      email: firstCustomerEmailValue(ctx.email),
      mailboxId: canonicalHairTpMailbox(ctx.mailboxId),
      status: cleanText(ctx.status),
      sla: cleanText(ctx.sla),
      latestMessages: messages.slice(-8).map((m) => ({
        dir: m && m.dir === 'outgoing' ? 'outgoing' : 'incoming',
        from: cleanText(m && m.from),
        time: cleanText(m && m.time),
        body: cleanText(m && (m.body || m.snippet)).slice(0, 400),
      })),
    };
    if (typeof ctx.needsReply === 'boolean') context.needsReply = ctx.needsReply;
    return context;
  }

  function openSmartAnteckning() {
    const context = buildSmartAnteckningContext();
    // Små fält i query för direkt render; full payload (inkl. senaste
    // meddelanden) skickas via postMessage när v3-ramen laddats.
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    const query = params.toString();
    const src = SMART_ANTECKNING_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Smart anteckning v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:smart-anteckning:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({
      title: 'Smart anteckning',
      wide: true,
      tabs: panelTabs('smart'),
      headChips: context.conversationKey ? [{ label: context.customerName, kind: 'neutral' }] : [],
      body: frame,
    });
  }

  // ─── BOKNING → full Bokningsguide v3 ─────────────────────────────────
  function openBokningsyta() {
    // Återanvänder samma live-tråds-kontext som Smart anteckning (kund,
    // conversationKey, ämne, senaste meddelanden, mailbox, e-post).
    const context = buildSmartAnteckningContext();
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    const query = params.toString();
    const src = BOOKING_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Ny bokning',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:booking:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({
      title: 'Öppna bokning',
      wide: true,
      tabs: panelTabs('bokning'),
      headChips: context.conversationKey ? [{ label: context.customerName, kind: 'neutral' }] : [],
      body: frame,
    });
  }

  // ─── KALENDER → riktig CCO-kalenderyta ───────────────────────────────
  function openKalender() {
    // Samma live-tråds-kontext som bokning (kund, conversationKey, ämne,
    // mailbox, e-post, senaste meddelanden) → kalendern scopas till vald kund.
    const context = buildSmartAnteckningContext();
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    const query = params.toString();
    const src = KALENDER_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'CCO Kalender',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:kalender:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({
      title: 'Öppna kalender',
      wide: true,
      tabs: panelTabs('kalender'),
      headChips: context.conversationKey ? [{ label: context.customerName, kind: 'neutral' }] : [],
      body: frame,
    });
  }

  // ─── LÄGG SENARE → Senare v3 (snooza vid Bekräfta) ───────────────────
  // Öppnar Senare-panelen med vald tråd; backend-action reply_later körs FÖRST
  // när användaren bekräftar snooze-tiden inne i panelen. Ingen ett-kliks-snooze.
  function openSenarePanel() {
    if (window.location.protocol === 'file:') {
      toast('Lägg senare kräver inloggad admin#cco (inte lokal fil).', 'err');
      return;
    }
    const live = getLiveConversationContext();
    const context = buildSmartAnteckningContext();
    // Samma kundidentitet som backend förväntar sig (#540/#6) så panelens
    // reply_later inte ger 409 customer_mismatch.
    const customerId =
      live && live.conversationKey && live.conversationKey !== 'visible-thread'
        ? resolveThreadCustomerEmail(live)
        : '';
    const canConfirm = Boolean(
      live && live.conversationKey && live.conversationKey !== 'visible-thread' && customerId
    );
    context.customerId = customerId || '';
    context.canConfirm = canConfirm;
    context.confirmDisabledReason = canConfirm
      ? ''
      : 'Välj en riktig live-tråd med kundmail innan snooze kan bekräftas.';
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    if (customerId) params.set('cid', customerId);
    if (!canConfirm) params.set('readonly', '1');
    const query = params.toString();
    const src = SENARE_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Lägg senare v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:senare:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({
      title: 'Lägg senare',
      wide: true,
      tabs: panelTabs('senare'),
      headChips: context.conversationKey ? [{ label: context.customerName, kind: 'neutral' }] : [],
      body: frame,
    });
  }

  // ─── KLAR / SENARE / REOPEN ──────────────────────────────────────────
  // Muterar delad trådstatus via befintlig backend-action
  // (POST /cco/runtime/conversation/:key/action, mail.write). Påverkar bara
  // vald LIVE-tråd (aldrig demo/visible-fallback). Ingen live-send.
  const CONVERSATION_ACTION_LABEL = {
    handled: 'Markerad som klar',
    reply_later: 'Snoozad till senare',
    reopen: 'Återöppnad',
  };

  async function runConversationAction(action) {
    if (!CONVERSATION_ACTION_LABEL[action]) return;
    if (window.location.protocol === 'file:') {
      toast('Klar/Senare/Återöppna kräver inloggad admin#cco (inte lokal fil).', 'err');
      return;
    }
    // Endast riktig live-tråd — inte demo/visible-fallback.
    const ctx = getLiveConversationContext();
    if (!ctx || !ctx.conversationKey || ctx.conversationKey === 'visible-thread') {
      toast('Ingen live-tråd vald — välj en tråd i live-inkorgen.', 'err');
      return;
    }
    // customerId (backend-guard mot fel kund) = trådens inkommande kundmail;
    // aldrig klinikmail. Samma källa som backend → undviker 409 customer_mismatch.
    const customerId = resolveThreadCustomerEmail(ctx);
    if (!customerId) {
      toast('Kundadress saknas i tråden — kan inte utföra åtgärden säkert.', 'err');
      return;
    }
    try {
      const response = await fetch(
        '/api/v1/cco/runtime/conversation/' + encodeURIComponent(ctx.conversationKey) + '/action',
        {
          method: 'POST',
          credentials: 'include',
          headers: adminAuthHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-cco-role': ROLE,
            'x-cco-tenant': TENANT,
          }),
          body: JSON.stringify({ action, customerId }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload || payload.ok === false) {
        const detail = (payload && (payload.detail || payload.error)) || response.status;
        toast('Åtgärden misslyckades: ' + detail, 'err');
        return;
      }
      window.CCOConversationActions?.applyThreadAction?.(action);
      toast(CONVERSATION_ACTION_LABEL[action], 'ok');
    } catch (err) {
      toast('Åtgärden misslyckades: ' + String((err && err.message) || err), 'err');
    }
  }

  // ─── NOTISER → notiscenter (panel) ───────────────────────────────────
  // Öppnar Notiser v3. Notiscenter, inte trådaction → kräver ingen vald tråd,
  // men tar med kontext om en live-tråd är vald (scopar notiser till kunden).
  function openNotiser() {
    const context = buildSmartAnteckningContext();
    const params = new URLSearchParams();
    const live = getLiveConversationContext();
    if (live && live.conversationKey) {
      if (context.customerName) params.set('kund', context.customerName);
      if (context.email) params.set('email', context.email);
      if (context.conversationKey) params.set('trad', context.conversationKey);
      if (context.subject) params.set('amne', context.subject);
      if (context.mailboxId) params.set('mailbox', context.mailboxId);
    }
    const query = params.toString();
    const src = NOTISER_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Notiser v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:notiser:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'Notiser', wide: true, tabs: panelTabs('notiser'), body: frame });
  }

  // ─── PORTAL — adoptionsmätning ───────────────────────────────────────
  // Visar hur väl den fria portal-kanalen ersätter SMS/mail: volym, engagemang,
  // nudge-konvertering, aktiva länkar. Läser /portal-metrics (analytics.read_team).
  function openPortalMetrics() {
    const body = el('div', {
      style: 'padding:16px;overflow:auto;height:100%;background:#fff;border-radius:14px',
    });
    body.appendChild(
      el('div', { style: 'font-size:12px;color:#8a8174' }, 'Hämtar portal-statistik…')
    );
    openModal({ title: '★ Portal — adoption', wide: true, tabs: panelTabs('portalmetrics'), body });

    const card = (label, value, sub) =>
      el(
        'div',
        {
          style:
            'flex:1;min-width:140px;border:1px solid rgba(120,100,90,.16);border-radius:12px;padding:12px 14px;background:#faf6f2',
        },
        [
          el('div', { style: 'font-size:22px;font-weight:800;color:#2b251f' }, String(value)),
          el('div', { style: 'font-size:11px;color:#8a8174;margin-top:2px' }, label),
          sub ? el('div', { style: 'font-size:10.5px;color:#a89f92;margin-top:2px' }, sub) : null,
        ].filter(Boolean)
      );

    (async () => {
      try {
        const r = await fetch('/api/v1/cco/runtime/portal-metrics', {
          cache: 'no-store',
          headers: adminAuthHeaders({ 'x-cco-role': ROLE, 'x-cco-tenant': TENANT }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.metrics) throw new Error(j.error || 'kunde inte läsa statistik');
        const m = j.metrics;
        const conv =
          m.derived?.nudgeConversion == null
            ? '—'
            : Math.round(m.derived.nudgeConversion * 100) + '%';
        body.innerHTML = '';
        const row = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, [
          card('Sparade SMS', m.derived?.estimatedSmsAvoided || 0, 'portalmeddelanden totalt'),
          card(
            'Portal-meddelanden',
            m.messages?.total || 0,
            (m.messages?.inbound || 0) + ' in · ' + (m.messages?.outbound || 0) + ' ut'
          ),
          card('Engagerade patienter', m.messages?.patientsEngaged || 0, 'skrev själva i portalen'),
          card('Nudge-konvertering', conv, (m.nudges?.prepared || 0) + ' nudgar förberedda'),
          card(
            'Aktiva länkar',
            m.access?.active || 0,
            (m.access?.total || 0) + ' utfärdade · ' + (m.access?.revoked || 0) + ' återkallade'
          ),
        ]);
        body.appendChild(row);
        body.appendChild(
          el(
            'p',
            { style: 'font-size:11px;color:#a89f92;margin-top:14px' },
            'Varje portal-meddelande är ett meddelande som annars kunde ha gått som SMS. ' +
              'Uppdaterad ' +
              (m.generatedAt ? new Date(m.generatedAt).toLocaleString('sv-SE') : 'nyss') +
              '.'
          )
        );
        // Aktiveringsstatus (go-live-spegel): visar vilka utskick som är skarpa.
        try {
          const rr = await fetch('/api/v1/cco/runtime/portal-readiness', {
            cache: 'no-store',
            headers: adminAuthHeaders({ 'x-cco-role': ROLE, 'x-cco-tenant': TENANT }),
          });
          const rj = await rr.json().catch(() => ({}));
          if (rr.ok && rj.readiness) {
            const r = rj.readiness;
            const chip = (label, state) => {
              const live = state === 'live' || state === 'active';
              const warn = state === 'live_unverified';
              const text = state === 'live_unverified' ? 'live · domän ej verifierad' : state;
              const style = warn
                ? 'background:rgba(200,130,30,.16);color:#c8821e'
                : live
                  ? 'background:rgba(74,130,104,.14);color:#4a8268'
                  : 'background:#f2ece6;color:#8a8174';
              return el(
                'span',
                {
                  style:
                    'display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:4px 9px;border-radius:999px;margin:3px 6px 3px 0;' +
                    style,
                },
                (warn ? '▲ ' : live ? '● ' : '○ ') + label + ': ' + text
              );
            };
            body.appendChild(
              el(
                'div',
                { style: 'font-size:12px;font-weight:700;margin-top:16px;color:#2b251f' },
                'Aktivering'
              )
            );
            body.appendChild(
              el('div', { style: 'margin-top:6px' }, [
                chip('Patient-notis', r.patientNotify),
                chip('SMS-nudge', r.smsNudge),
                chip('Inbound-SMS', r.inboundSms),
              ])
            );
          }
        } catch (_r) {
          /* readiness är ett tillägg — fel får inte störa panelen */
        }
      } catch (e) {
        body.innerHTML = '';
        body.appendChild(
          el(
            'div',
            { style: 'font-size:12px;color:#b94a4a' },
            'Kunde inte läsa portal-statistik just nu.'
          )
        );
      }
    })();
  }

  // ─── SKICKAT / KÖ → sektion inne i Svarstudio ────────────────────────
  // Öppnar Skickat/utkast/kö-pipelinen. Anropas från Svarstudios kontextpanel
  // (utgående svarspipeline). Tar med Svarstudios kontext.
  function openSkickat(presetContext) {
    const context = presetContext || buildSmartAnteckningContext();
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    const query = params.toString();
    const src = SKICKAT_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Skickat v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:skickat:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'Skickat / kö', wide: true, tabs: panelTabs('skickat'), body: frame });
  }

  // ─── MAKRON → Makron v3 (snabbsvar) ──────────────────────────────────
  // Öppnar makronbiblioteket med vald tråds kontext (kund, ämne, senaste
  // meddelanden, mailbox). Anropas från Svarstudios snabbmall-rad eller flik-
  // raden. Makrot infogas i Svarstudio-svaret, inget skickas externt.
  function openMakron(presetContext) {
    const context = presetContext || buildSmartAnteckningContext();
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    const query = params.toString();
    const src = MAKRON_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Makron v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:makron:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'Makron', wide: true, tabs: panelTabs('makron'), body: frame });
  }

  // ─── PATIENT-HUB → dossier (nivå 2, kundkontext) ─────────────────────
  // Öppnar patient-/kunddossiern scopad på vald tråds kund ("vem är detta").
  // Kompletterar tråden — inte i svarslinjen, ingen live-send. Anropas från
  // Svarstudios kontextpanel (kund-cardet) eller flik-raden.
  function openPatientHub(presetContext) {
    const context = presetContext || buildSmartAnteckningContext();
    // Kundidentitet (samma källa som backend-actions) för att scopa dossiern.
    const customerId = resolveThreadCustomerEmail(context) || context.email || '';
    if (customerId) context.customerId = customerId;
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    if (customerId) params.set('cid', customerId);
    const query = params.toString();
    const src = PATIENT_HUB_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Patient-dossier v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:patienthub:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'Dossier', wide: true, tabs: panelTabs('patienthub'), body: frame });
  }

  // ─── SIGNATURER → BankID-signeringscentral (nivå 2, kundkontext) ─────
  // Öppnar Signaturer & samtycken scopad på vald tråds kund (vilka dokument
  // patienten väntar på att signera). Anropas från Svarstudios kund-card eller
  // flik-raden. Ingen live-send.
  function openSignaturer(presetContext) {
    const context = presetContext || buildSmartAnteckningContext();
    const customerId = resolveThreadCustomerEmail(context) || context.email || '';
    if (customerId) context.customerId = customerId;
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    if (customerId) params.set('cid', customerId);
    const query = params.toString();
    const src = SIGNATURER_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'Signaturer & samtycken v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:signaturer:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'Signaturer', wide: true, tabs: panelTabs('signaturer'), body: frame });
  }

  // ─── NO-SHOW → hantering (nivå 2, bokningskontext) ───────────────────
  // Öppnar no-show-hanteringen scopad på vald tråds kund. Relevant när en
  // bokningstråd hanteras; kopplar mot bokning/kalender. Anropas från
  // Svarstudios smart-actions (bokningsraden) eller flik-raden. Ingen live-send.
  function openNoShow(presetContext) {
    const context = presetContext || buildSmartAnteckningContext();
    const customerId = resolveThreadCustomerEmail(context) || context.email || '';
    if (customerId) context.customerId = customerId;
    const params = new URLSearchParams();
    if (context.customerName) params.set('kund', context.customerName);
    if (context.email) params.set('email', context.email);
    if (context.conversationKey) params.set('trad', context.conversationKey);
    if (context.subject) params.set('amne', context.subject);
    if (context.mailboxId) params.set('mailbox', context.mailboxId);
    if (customerId) params.set('cid', customerId);
    const query = params.toString();
    const src = NO_SHOW_V3_SRC + (query ? '?' + query : '');
    const frame = el('iframe', {
      src,
      title: 'No-show v3',
      style: 'width:100%;height:100%;border:0;border-radius:14px;background:#fff;display:block',
    });
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.postMessage(
          { type: 'cco:noshow:context', context },
          window.location.origin
        );
      } catch {
        /* ignore cross-frame errors */
      }
    });
    openModal({ title: 'No-show', wide: true, tabs: panelTabs('noshow'), body: frame });
  }

  function runCcoAction(action) {
    if (action === 'svarstudio') openSvarstudioForSelectedThread();
    else if (action === 'smart-anteckning') openSmartAnteckning();
    else if (action === 'bokningsyta') openBokningsyta();
    else if (action === 'kalender') openKalender();
    else if (action === 'klar') runConversationAction('handled');
    else if (action === 'senare') openSenarePanel();
    else if (action === 'reopen') runConversationAction('reopen');
    else if (action === 'notiser') openNotiser();
    else if (action === 'patienthub') openPatientHub();
    else if (action === 'signaturer') openSignaturer();
    else return false;
    return true;
  }

  function actionButtonFromEvent(event) {
    const node = event.target?.closest?.('[data-action]');
    if (!node) return null;
    if (
      !node.closest('.thread-bottom-actions') &&
      !node.closest('.risk-badge-row') &&
      !node.classList.contains('nav-btn')
    ) {
      return null;
    }
    return node;
  }

  // ─── Wire bottom-bar + keyboard ──────────────────────────────────────
  function wireActions() {
    document.addEventListener(
      'click',
      (e) => {
        const btn = actionButtonFromEvent(e);
        if (!btn) return;
        const action = btn.dataset.action;
        if (!runCcoAction(action)) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        runCcoAction('svarstudio');
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        runCcoAction('smart-anteckning');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        runCcoAction('bokningsyta');
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        runCcoAction('kalender');
      } else if (e.key === 'Escape')
        document.querySelectorAll('.action-modal-backdrop').forEach((n) => n.remove());
    });
    // Bottom action-bar inne i en embeddad v3-panel (t.ex. Senare) postMess:ar
    // sitt data-action hit; kör samma CCO-action som bottenknapparna/flik-raden.
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'cco:panel:action') return;
      runCcoAction(data.action);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireActions);
  else wireActions();
})();
