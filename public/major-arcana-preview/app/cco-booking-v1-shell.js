'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-booking-v1-shell.js — facit-trogen MOBIL bokningsvy (v1).
 * window.ArcanaBookingV1.render(ctx) monterar app-shell + bottom-nav +
 * detalj-sheet under #cco-book-v1-root, kör facitens interaktions-JS och
 * byter demo → RIKTIGA bokningar via det DELADE datalagret
 * (ArcanaBookingCalendarShared) — samma källa som kalendern. Bokade slots =
 * bokningar, lediga slots = luckor, conflicts = konflikter. Brytpunkt: ≤834px.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  var MARKUP = `<div class="mockup-label">v1 · BOKNING MOBIL</div>

<div class="phone-frame">
<div class="phone-screen">
<div class="app-shell">

  <div class="top-bar">
    <span class="top-brand">CCO</span>
    <label class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" placeholder="Sök tid, kund, tjänst…" />
    </label>
    <button class="top-icon-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></svg></button>
  </div>

  <div class="page-head">
    <div class="page-kicker">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg></span>
      Bokning
    </div>
    <div class="page-title-row">
      <h1 class="page-title">14 bokningar</h1>
      <span class="page-subtitle">· tis 26 maj · vecka 22</span>
    </div>
    <div class="status-row">
      <span class="status-pill status-pill--success"><span class="dot"></span>11 bekräftade</span>
      <span class="status-pill status-pill--warning"><span class="dot"></span>2 tentativa</span>
      <span class="status-pill status-pill--info"><span class="dot"></span>3 lediga luckor</span>
      <span class="status-pill"><span class="dot" style="background:var(--conflict-red)"></span>1 konflikt</span>
    </div>
  </div>

  <!-- AI-aggregat (swipeable) -->
  <div class="agg-strip">
    <div class="agg-card" data-kind="risk">
      <div class="agg-card-kicker">★ Konflikt</div>
      <div class="agg-card-body"><strong>14:30 dubbelbokad</strong> — Erik (PRP) krockar med Sofie (microneedling) hos Fazli</div>
      <span class="agg-card-cta">→ Lös konflikt</span>
    </div>
    <div class="agg-card" data-kind="action">
      <div class="agg-card-kicker">★ Ledig lucka</div>
      <div class="agg-card-body"><strong>11:15 hos Egzona</strong> matchar 3 på väntelistan — Sofie 92%</div>
      <span class="agg-card-cta">→ Fyll luckan</span>
    </div>
    <div class="agg-card" data-kind="opp">
      <div class="agg-card-kicker">★ Saknar formulär</div>
      <div class="agg-card-body"><strong>Eva 10:30</strong> saknar friskförsäkran inför behandling</div>
      <span class="agg-card-cta">→ Skicka påminnelse</span>
    </div>
    <div class="agg-card" data-kind="trend">
      <div class="agg-card-kicker">★ Beläggning</div>
      <div class="agg-card-body">Dagen är <strong>86% fylld</strong>. 3 luckor kvar att boka denna vecka.</div>
      <span class="agg-card-cta">→ Se vecka</span>
    </div>
  </div>

  <!-- Filter-chips -->
  <div class="filter-row">
    <button class="filter-chip active">Idag <span class="count">14</span></button>
    <button class="filter-chip">Imorgon <span class="count">12</span></button>
    <button class="filter-chip">Vecka <span class="count">63</span></button>
    <button class="filter-chip">Tentativa <span class="count">2</span></button>
    <button class="filter-chip">⚠ Konflikt <span class="count">1</span></button>
    <button class="filter-chip">Lediga <span class="count">3</span></button>
    <button class="filter-chip">Per resurs</button>
  </div>

  <div class="customers-list" id="bookingList"></div>

</div>
</div>
</div>

<!-- Bottom-nav -->
<div class="bottom-nav">
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    Inkorg
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
    Kunder
  </button>
  <button class="nav-fab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
  <button class="nav-item is-active">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
    Bokning
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    Mer
  </button>
</div>

<!-- Detalj-sheet -->
<div class="sheet-backdrop" id="sheetBackdrop"></div>
<div class="dossier-sheet" id="dossierSheet">
  <div class="ds-handle"></div>
  <div id="dossierContent" style="display:flex;flex-direction:column;flex:1;overflow:hidden"></div>
</div>`;

  function bEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function bInitials(name) {
    return (
      String(name || '')
        .split(/\s+/)
        .map(function (w) {
          return w[0] || '';
        })
        .join('')
        .slice(0, 2)
        .toUpperCase() || '–'
    );
  }
  var B_BGS = [
    'linear-gradient(180deg,#d8c1f0,#b48ad6)',
    'linear-gradient(180deg,#c5d8a8,#92b86e)',
    'linear-gradient(180deg,#ffe3b8,#e8a04e)',
    'linear-gradient(180deg,#b8d4e8,#7aa8d4)',
    'linear-gradient(180deg,#f4d4f0,#d48ac8)',
    'linear-gradient(180deg,#f4e8c8,#d4b870)',
    'linear-gradient(180deg,#d0c8f0,#9a8ad8)',
    'linear-gradient(180deg,#c8e8e0,#88c8b8)',
  ];
  function bBg(name) {
    var s = 0,
      str = String(name || '');
    for (var i = 0; i < str.length; i++) s = (s + str.charCodeAt(i)) % 997;
    return B_BGS[s % B_BGS.length];
  }
  function bIso(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  function bIsoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
    var f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
  }

  function initBookingInteractions() {
    try {
      /* Data-holder: shell kan sätta __ARCANA_BOOKING_V1__.list till RIKTIGA bokningar
       * före/efter init och anropa .render() för att byta demo → riktig data. Utan
       * shell (standalone-facit) används DEMO nedan. */
      var ST = (window.__ARCANA_BOOKING_V1__ = window.__ARCANA_BOOKING_V1__ || {});
      var DEMO = [
        {
          id: 'b1',
          time: '08:00',
          dur: '45 min',
          customer: 'Anna Karlsson',
          init: 'AK',
          bg: 'linear-gradient(180deg,#d8c1f0,#b48ad6)',
          service: 'PRP 4/6',
          resource: 'Egzona',
          state: 'confirmed',
          stateLabel: 'Bekräftad',
          ai: 'Friskförsäkran inkommen · ✓ Redo att starta',
          tags: [
            { kind: 'time', label: '08:00' },
            { kind: 'cycle', label: 'PRP 4/6' },
            { kind: 'ready', label: '✓ Redo' },
          ],
        },
        {
          id: 'b2',
          time: '09:00',
          dur: '90 min',
          customer: 'Karl Lindberg',
          init: 'KL',
          bg: 'linear-gradient(180deg,#c5d8a8,#92b86e)',
          service: 'DHI ögonbryn',
          resource: 'Fazli',
          state: 'confirmed',
          stateLabel: 'Bekräftad',
          ai: 'Lång session — blockera 09:00–10:30 hos Fazli',
          tags: [
            { kind: 'time', label: '09:00' },
            { kind: 'cycle', label: 'DHI' },
            { kind: 'resource', label: 'Fazli' },
          ],
        },
        {
          id: 'b3',
          time: '10:30',
          dur: '30 min',
          customer: 'Eva Karlsson',
          init: 'EK',
          bg: 'linear-gradient(180deg,#f4d4f0,#d48ac8)',
          service: 'Konsultation',
          resource: 'Egzona',
          state: 'tentative',
          stateLabel: 'Tentativ',
          ai: 'Saknar friskförsäkran — skicka påminnelse innan 10:30',
          tags: [
            { kind: 'time', label: '10:30' },
            { kind: 'risk', label: '⚠ Friskförs.' },
          ],
        },
        {
          id: 'slot1',
          openSlot: true,
          time: '11:15',
          dur: '45 min',
          customer: 'Ledig lucka',
          init: '+',
          bg: '',
          service: 'Egzona · 45 min ledigt',
          resource: 'Egzona',
          state: 'new',
          stateLabel: 'Ledig',
          ai: 'Matchar Sofie på väntelistan (92%) — ring och fyll luckan',
          tags: [
            { kind: 'time', label: '11:15' },
            { kind: 'new', label: 'Ledig' },
          ],
        },
        {
          id: 'b4',
          time: '13:00',
          dur: '45 min',
          customer: 'Marcus Berg',
          init: 'MB',
          bg: 'linear-gradient(180deg,#b8d4e8,#7aa8d4)',
          service: 'PRP 3/6',
          resource: 'Egzona',
          state: 'confirmed',
          stateLabel: 'Bekräftad',
          ai: 'PRP 3/6 — boka redan 4/6 om ~3 veckor',
          tags: [
            { kind: 'time', label: '13:00' },
            { kind: 'cycle', label: 'PRP 3/6' },
          ],
        },
        {
          id: 'b5',
          time: '14:00',
          dur: '60 min',
          customer: 'Sofie Andersson',
          init: 'SA',
          bg: 'linear-gradient(180deg,#ffe3b8,#e8a04e)',
          service: 'Microneedling',
          resource: 'Fazli',
          state: 'tentative',
          stateLabel: 'Tentativ',
          ai: 'Väntar bekräftelse — påminn via SMS',
          tags: [
            { kind: 'time', label: '14:00' },
            { kind: 'cycle', label: 'Microneedling' },
          ],
        },
        {
          id: 'b6',
          time: '14:30',
          dur: '45 min',
          customer: 'Erik Nordström',
          init: 'EN',
          bg: 'linear-gradient(180deg,#f4e8c8,#d4b870)',
          service: 'PRP-återbesök',
          resource: 'Fazli',
          state: 'conflict',
          stateLabel: 'Konflikt',
          ai: 'Krockar med Sofie 14:00 hos Fazli — flytta till 15:30?',
          tags: [
            { kind: 'time', label: '14:30' },
            { kind: 'risk', label: '!! Dubbelbokad' },
          ],
        },
        {
          id: 'b7',
          time: '16:00',
          dur: '30 min',
          customer: 'Petter Gustafsson',
          init: 'PG',
          bg: 'linear-gradient(180deg,#d0c8f0,#9a8ad8)',
          service: 'Årsuppföljning',
          resource: 'Fazli',
          state: 'confirmed',
          stateLabel: 'Bekräftad',
          ai: 'Årsuppföljning DHI — föreslå check-in + foto i journal',
          tags: [
            { kind: 'time', label: '16:00' },
            { kind: 'resource', label: 'Fazli' },
          ],
        },
      ];

      function cardHtml(b) {
        return `
    <div class="customer-card" data-id="${bEsc(b.id)}"${b.openSlot ? ' data-open-slot' : ''}>
      <div class="cc-top">
        <span class="cc-avatar" style="${b.bg ? 'background:' + bEsc(b.bg) : ''}">${bEsc(b.init)}</span>
        <div class="cc-meta">
          <div class="cc-name">${bEsc(b.customer)}</div>
          <div class="cc-sub">${bEsc(b.service)} · ${bEsc(b.resource)}</div>
        </div>
        <span class="cc-status" data-state="${bEsc(b.state)}"><span class="dot"></span>${bEsc(b.stateLabel)}</span>
      </div>
      ${b.tags.length ? `<div class="cc-tags">${b.tags.map((t) => `<span class="cc-tag cc-tag--${bEsc(t.kind)}">${bEsc(t.label)}</span>`).join('')}</div>` : ''}
      <div class="cc-stats">
        <div class="cc-stat"><div class="cc-stat-label">Tid</div><div class="cc-stat-value">${bEsc(b.time)}</div><div class="cc-stat-trend">${bEsc(b.dur)}</div></div>
        <div class="cc-stat"><div class="cc-stat-label">Resurs</div><div class="cc-stat-value">${bEsc(b.resource)}</div><div class="cc-stat-trend">${bEsc(b.service)}</div></div>
      </div>
      <div class="cc-ai">${bEsc(b.ai)}</div>
    </div>
  `;
      }

      if (!ST.list || !ST.list.length) ST.list = DEMO;
      function renderBookingList() {
        document.getElementById('bookingList').innerHTML = ST.list.map(cardHtml).join('');
        document.querySelectorAll('.customer-card').forEach((card) => {
          card.addEventListener('click', () => openDossier(card.dataset.id));
        });
      }
      ST.render = renderBookingList; // shell anropar denna efter att riktig data satts
      ST.toast = toast; // exponera så shell kan binda om AI-strippen mot riktig data
      renderBookingList();
      document.querySelectorAll('.filter-chip').forEach((c) => {
        c.addEventListener('click', () => {
          document.querySelectorAll('.filter-chip').forEach((o) => o.classList.remove('active'));
          c.classList.add('active');
        });
      });
      document.querySelectorAll('.agg-card').forEach((card) => {
        card.addEventListener('click', () => toast('✓ AI-åtgärd startad — väntar på godkännande'));
      });

      const sheet = document.getElementById('dossierSheet');
      const backdrop = document.getElementById('sheetBackdrop');
      const content = document.getElementById('dossierContent');

      function openDossier(id) {
        const b = ST.list.find((x) => x.id === id);
        if (!b) return;
        const tMatch = b.time.split(':');
        const endMin = parseInt(tMatch[0], 10) * 60 + parseInt(tMatch[1], 10) + parseInt(b.dur, 10);
        const endStr =
          String(Math.floor(endMin / 60)).padStart(2, '0') +
          ':' +
          String(endMin % 60).padStart(2, '0');
        content.innerHTML = `
    <div class="ds-head">
      <div class="ds-avatar" style="${b.bg ? 'background:' + bEsc(b.bg) : 'background:rgba(200,130,30,.14);color:var(--calendar-accent)'}">${bEsc(b.init)}</div>
      <div class="ds-head-body">
        <div class="ds-kicker">★ Bokning</div>
        <div class="ds-name">${bEsc(b.customer)}</div>
        <div class="ds-contact">${bEsc(b.service)} · ${bEsc(b.resource)}</div>
        <div class="ds-tags">${b.tags.map((t) => `<span class="ds-tag ds-tag--${bEsc(t.kind)}">${bEsc(t.label)}</span>`).join('')}</div>
      </div>
      <button class="ds-close" id="dsClose">×</button>
    </div>

    <div class="ds-stats">
      <div class="ds-stat"><div class="ds-stat-label">Tid</div><div class="ds-stat-value">${bEsc(b.time)}</div><div class="ds-stat-trend">→ ${bEsc(endStr)}</div></div>
      <div class="ds-stat"><div class="ds-stat-label">Längd</div><div class="ds-stat-value">${bEsc(b.dur)}</div><div class="ds-stat-trend">${bEsc(b.resource)}</div></div>
      <div class="ds-stat"><div class="ds-stat-label">Status</div><div class="ds-stat-value">${bEsc(b.stateLabel)}</div><div class="ds-stat-trend">${b.state === 'confirmed' ? 'Klar' : b.state === 'conflict' ? 'Åtgärd krävs' : 'Väntar'}</div></div>
    </div>

    <div class="ds-tabs">
      <button class="ds-tab active" data-tab="overview">Översikt</button>
      <button class="ds-tab" data-tab="customer">Kund</button>
      <button class="ds-tab" data-tab="history">Historik</button>
      <button class="ds-tab" data-tab="notes">Anteckn.</button>
    </div>

    <div class="ds-scroll" id="dsScroll">
      <div class="ds-section-title">★ AI-rekommendation</div>
      <div class="ds-insight">${b.ai}</div>

      <div class="ds-section-title">Tid &amp; resurs</div>
      <div class="ds-booking" data-source="${b.resource === 'Fazli' ? 'fazli' : b.resource === 'Egzona' ? 'egzona' : 'contact'}">
        <div class="ds-date"><div class="day">${bEsc((ST.dateParts && ST.dateParts.day) || 'TIS')}</div><div class="num">${bEsc((ST.dateParts && ST.dateParts.num) || '26')}</div><div class="mon">${bEsc((ST.dateParts && ST.dateParts.mon) || 'MAJ')}</div></div>
        <div class="ds-booking-meta"><div class="ds-booking-title">${b.service}</div><div class="ds-booking-sub">${b.time} · ${b.dur} · ${b.resource}</div></div>
        <span class="ds-booking-state" data-state="${b.state === 'confirmed' ? 'ready' : b.state === 'conflict' ? 'conflict' : 'warn'}">${b.state === 'confirmed' ? '✓ Redo' : b.state === 'conflict' ? '!! Konflikt' : '⚠ Tentativ'}</span>
      </div>

      <div class="ds-section-title">Senaste anteckningar</div>
      <div class="ds-note">Eftervård enligt plan. Inga biverkningar noterade.<div class="ds-note-meta">${b.resource} · 12 maj 2026</div></div>
      <div class="ds-note">Kund bekräftade tid via SMS.<div class="ds-note-meta">System · 22 maj 2026</div></div>
    </div>

    <div class="ds-actions">
      ${b.state === 'conflict' ? '<button class="ds-cta ds-cta--ai full">★ AI Lös konflikt · föreslå ny tid</button>' : b.openSlot ? '<button class="ds-cta ds-cta--ai full">★ AI Fyll luckan från väntelista</button>' : '<button class="ds-cta ds-cta--ai full">★ AI Skicka påminnelse</button>'}
      <button class="ds-cta">↻ Boka om</button>
      <button class="ds-cta">✉ Kontakta kund</button>
      <button class="ds-cta ds-cta--success full">✓ Bekräfta bokning</button>
      <button class="ds-cta full" style="color:var(--conflict-red)">✕ Avboka</button>
    </div>
  `;
        sheet.classList.add('is-visible');
        backdrop.classList.add('is-visible');

        document.getElementById('dsClose').addEventListener('click', closeDossier);
        document.querySelectorAll('.ds-tab').forEach((t) =>
          t.addEventListener('click', () => {
            document.querySelectorAll('.ds-tab').forEach((o) => o.classList.remove('active'));
            t.classList.add('active');
          })
        );
        document.querySelectorAll('.ds-actions .ds-cta').forEach((cta) =>
          cta.addEventListener('click', () => {
            closeDossier();
            toast('✓ ' + cta.textContent.replace(/^[★↻✉✓✕]\s*/, ''));
          })
        );
      }

      function closeDossier() {
        sheet.classList.remove('is-visible');
        backdrop.classList.remove('is-visible');
      }
      backdrop.addEventListener('click', closeDossier);

      function toast(msg) {
        const t = document.createElement('div');
        t.className = 'ai-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('is-visible'));
        setTimeout(() => {
          t.classList.remove('is-visible');
          setTimeout(() => t.remove(), 320);
        }, 2400);
      }
    } catch (e) {
      if (window.console) console.warn('[cco-book-v1] interaktion:', e && e.message);
    }
  }

  // Bygg facit-formade boknings-objekt ur RIKTIGA slots (booked + available).
  // Klassificera på RÅ workflow-status (caseStatus), inte den formaterade
  // etiketten slot.status ("Erbjuden" m.fl.) — annars räknas offered/slots_ready
  // som bekräftade istället för tentativa (Bugbot #264 High).
  function bRawStatus(slot) {
    return String((slot && (slot.caseStatus || slot.status)) || '').toLowerCase();
  }
  // Tentativa råstatusar (väntar åtgärd/bekräftelse) ur boknings-motorns vokabulär.
  var B_TENTATIVE_RE =
    /(needs_triage|slots_ready|offered|waiting_customer|tentat|pending|hold|await|propos)/;
  function bIsTentative(slot) {
    return slot && slot.kind === 'booked' && B_TENTATIVE_RE.test(bRawStatus(slot));
  }

  function slotToBooking(S, slot, idx, conflict) {
    var booked = slot.kind === 'booked';
    var name = booked
      ? slot.title || slot.customer || slot.customerName || 'Bokning'
      : 'Ledig lucka';
    var time = '';
    try {
      var r = S.formatTimeRange(slot) || '';
      time = r.split(/[–-]/)[0].trim() || r;
    } catch (e) {}
    var dur = (slot.durationMinutes || 30) + ' min';
    var rawStatus = bRawStatus(slot);
    var state, stateLabel;
    if (!booked) {
      state = 'new';
      stateLabel = 'Ledig';
    } else if (conflict || /(conflict|konflikt|krock|double)/.test(rawStatus)) {
      // Konflikt = överlapp beräknat ur delade datalagret (findConflictKeys),
      // inte bara om status-strängen råkar nämna "konflikt".
      state = 'conflict';
      stateLabel = 'Konflikt';
    } else if (bIsTentative(slot)) {
      state = 'tentative';
      stateLabel = 'Tentativ';
    } else {
      state = 'confirmed';
      stateLabel = 'Bekräftad';
    }
    var service = slot.serviceLabel || slot.service || (booked ? 'Bokning' : 'Ledig tid');
    var resource = slot.resourceLabel || slot.resource || '';
    var tags = [{ kind: 'time', label: time || '–' }];
    if (service) tags.push({ kind: booked ? 'cycle' : 'new', label: service });
    if (resource) tags.push({ kind: 'resource', label: resource });
    return {
      id: 'real-' + idx,
      time: time || '–',
      dur: dur,
      customer: name,
      init: booked ? bInitials(name) : '+',
      bg: booked ? bBg(name) : '',
      openSlot: !booked,
      service: service,
      resource: resource,
      state: state,
      stateLabel: stateLabel,
      ai: booked
        ? state === 'conflict'
          ? 'Tidskonflikt — föreslå ny tid'
          : state === 'tentative'
            ? 'Väntar bekräftelse — påminn kunden'
            : 'Bekräftad · klar att genomföra'
        : 'Ledig lucka — matcha mot väntelista',
      tags: tags,
    };
  }

  async function populateBookingReal(root) {
    try {
      if (typeof window.__ARCANA_ENSURE_BOOKING_SCRIPTS__ === 'function') {
        await window.__ARCANA_ENSURE_BOOKING_SCRIPTS__();
      }
      var S = window.ArcanaBookingCalendarShared;
      if (!S || typeof S.fetchCalendarRange !== 'function') return;
      var today = S.todayIso ? S.todayIso() : bIso(new Date());
      var range = await S.fetchCalendarRange(today, today);
      if (!range) return;
      var sbd = range.slotsByDate;
      var slots = (sbd instanceof Map ? sbd.get(today) : sbd && sbd[today]) || [];
      var visible = slots
        .filter(function (s) {
          return s && (s.kind === 'booked' || s.kind === 'available');
        })
        .sort(function (a, b) {
          return S.slotStartMinutes(a) - S.slotStartMinutes(b);
        });
      // Obs: tom dag = riktig tom data, INTE facit-demo (Bugbot #264). Vi
      // fortsätter och renderar ett tomt läge istället för att lämna demo kvar.

      // Konflikter beräknas ur delade datalagret (samma resurs + överlappande
      // tid); fetchCalendarRange exponerar dem inte själv (Bugbot #264).
      var conflictKeys = null;
      try {
        if (typeof S.findConflictKeys === 'function') conflictKeys = S.findConflictKeys(visible);
      } catch (e) {
        conflictKeys = null;
      }
      var inConflict = function (s) {
        if (!conflictKeys || typeof S.eventKey !== 'function') return false;
        try {
          return conflictKeys.has(S.eventKey(s));
        } catch (e) {
          return false;
        }
      };

      // Riktigt datum för dossier-arket (idag) — ersätter facitens TIS/26/MAJ.
      var nowD = new Date(today + 'T12:00:00');
      var up3 = function (d) {
        return String(d || '')
          .replace('.', '')
          .slice(0, 3)
          .toUpperCase();
      };

      // Byt demo → riktig data och re-rendera via facitens exponerade render.
      var ST = window.__ARCANA_BOOKING_V1__ || (window.__ARCANA_BOOKING_V1__ = {});
      ST.dateParts = {
        day: up3(nowD.toLocaleDateString('sv-SE', { weekday: 'short' })),
        num: String(nowD.getDate()),
        mon: up3(nowD.toLocaleDateString('sv-SE', { month: 'short' })),
      };
      ST.list = visible.map(function (s, i) {
        return slotToBooking(S, s, i, inConflict(s));
      });
      if (typeof ST.render === 'function') ST.render();
      // Tomt läge: visa riktig tom-state istället för demo-kort.
      if (!visible.length) {
        var emptyList = root.querySelector('#bookingList');
        if (emptyList) {
          emptyList.innerHTML =
            '<div class="customer-card" data-empty style="text-align:center;cursor:default">' +
            '<div class="cc-name" style="opacity:.7">Inga bokningar idag</div>' +
            '<div class="cc-sub">Skapa en ny tid med + nedan</div></div>';
        }
      }

      // Header-räknare ur riktig data.
      var bookedCount = visible.filter(function (s) {
        return s.kind === 'booked';
      }).length;
      var openCount = visible.filter(function (s) {
        return s.kind === 'available';
      }).length;
      var conflictCount = visible.filter(function (s) {
        return s.kind === 'booked' && inConflict(s);
      }).length;
      var tentativeCount = visible.filter(function (s) {
        return s.kind === 'booked' && !inConflict(s) && bIsTentative(s);
      }).length;
      var confirmedCount = visible.filter(function (s) {
        return s.kind === 'booked' && !inConflict(s) && !bIsTentative(s);
      }).length;

      var title = root.querySelector('.page-title');
      if (title) title.textContent = bookedCount + ' bokning' + (bookedCount === 1 ? '' : 'ar');
      var sub = root.querySelector('.page-subtitle');
      if (sub)
        sub.textContent =
          '· ' +
          nowD.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }) +
          ' · vecka ' +
          bIsoWeek(nowD);

      var setPill = function (cls, n, label) {
        var pill = root.querySelector('.status-pill--' + cls);
        if (!pill) return;
        var dot = pill.querySelector('.dot');
        pill.innerHTML = (dot ? dot.outerHTML : '') + n + ' ' + label;
      };
      setPill('success', confirmedCount, 'bekräftade');
      setPill('warning', tentativeCount, 'tentativa');
      setPill('info', openCount, openCount === 1 ? 'ledig lucka' : 'lediga luckor');
      // konflikt-pillen saknar modifier-klass — uppdatera via text-match
      root.querySelectorAll('.status-pill').forEach(function (p) {
        if (/konflikt/i.test(p.textContent || '')) {
          var dot = p.querySelector('.dot');
          p.innerHTML = (dot ? dot.outerHTML : '') + conflictCount + ' konflikt';
        }
      });

      // Filter-chip-räknare (Idag/Lediga/Tentativa/Konflikt).
      root.querySelectorAll('.filter-chip').forEach(function (chip) {
        var txt = (chip.textContent || '').toLowerCase();
        var cnt = chip.querySelector('.count');
        if (!cnt) return;
        if (/idag/.test(txt)) cnt.textContent = String(bookedCount);
        else if (/ledig/.test(txt)) cnt.textContent = String(openCount);
        else if (/tentativ/.test(txt)) cnt.textContent = String(tentativeCount);
        else if (/konflikt/.test(txt)) cnt.textContent = String(conflictCount);
      });

      // AI-aggregat-strippen ur RIKTIG data — annars ligger facitens statiska
      // Erik/Sofie-konflikt kvar bredvid riktiga bokningar (Bugbot #264).
      var aggStrip = root.querySelector('.agg-strip');
      if (aggStrip) {
        var aggCards = [];
        if (conflictCount > 0) {
          aggCards.push({
            kind: 'risk',
            kicker: '★ Konflikt',
            body:
              '<strong>' +
              conflictCount +
              ' dubbelbokning' +
              (conflictCount === 1 ? '' : 'ar') +
              '</strong> idag — samma resurs överlappar i tid',
            cta: '→ Lös konflikt',
          });
        }
        if (openCount > 0) {
          aggCards.push({
            kind: 'action',
            kicker: '★ Lediga luckor',
            body:
              '<strong>' +
              openCount +
              ' ledig' +
              (openCount === 1 ? ' lucka' : 'a luckor') +
              '</strong> idag — matcha mot väntelistan',
            cta: '→ Fyll luckor',
          });
        }
        if (tentativeCount > 0) {
          aggCards.push({
            kind: 'opp',
            kicker: '★ Tentativa',
            body:
              '<strong>' +
              tentativeCount +
              ' tentativ' +
              (tentativeCount === 1 ? ' bokning' : 'a bokningar') +
              '</strong> väntar bekräftelse — påminn kunderna',
            cta: '→ Skicka påminnelser',
          });
        }
        aggCards.push({
          kind: 'trend',
          kicker: '★ Dagens beläggning',
          body:
            '<strong>' +
            bookedCount +
            ' bokning' +
            (bookedCount === 1 ? '' : 'ar') +
            '</strong> · ' +
            confirmedCount +
            ' bekräftade · ' +
            openCount +
            ' luckor kvar',
          cta: '→ Se vecka',
        });
        aggStrip.innerHTML = aggCards
          .map(function (c) {
            return (
              '<div class="agg-card" data-kind="' +
              bEsc(c.kind) +
              '"><div class="agg-card-kicker">' +
              bEsc(c.kicker) +
              '</div><div class="agg-card-body">' +
              c.body +
              '</div><span class="agg-card-cta">' +
              bEsc(c.cta) +
              '</span></div>'
            );
          })
          .join('');
        var aggToast = (window.__ARCANA_BOOKING_V1__ && window.__ARCANA_BOOKING_V1__.toast) || null;
        aggStrip.querySelectorAll('.agg-card').forEach(function (card) {
          card.addEventListener('click', function () {
            if (aggToast) aggToast('✓ AI-åtgärd startad — väntar på godkännande');
          });
        });
      }
    } catch (e) {
      if (window.console) console.warn('[cco-book-v1] data:', e && e.message);
    }
  }

  function mountPoint() {
    return (
      document.querySelector(
        '.preview-canvas[data-app-shell-view="calendar"] .preview-workspace'
      ) || document.querySelector('.preview-workspace')
    );
  }

  function render(ctx) {
    var host = mountPoint();
    if (!host) return null;
    var root = document.getElementById('cco-book-v1-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cco-book-v1-root';
      host.appendChild(root);
    }
    // nollställ ev. tidigare data-holder så demo renderas först
    if (window.__ARCANA_BOOKING_V1__) window.__ARCANA_BOOKING_V1__.list = null;
    root.innerHTML = MARKUP;
    initBookingInteractions();
    populateBookingReal(root);
    return root;
  }

  window.ArcanaBookingV1 = { render: render };

  // ── Self-mount boot ────────────────────────────────────────────────────
  function flagOn() {
    return document.documentElement.getAttribute('data-booking-v1') === 'on';
  }
  function maybeMount() {
    var root = document.getElementById('cco-book-v1-root');
    var active =
      flagOn() &&
      !!document.querySelector('.preview-canvas[data-app-shell-view="calendar"]') &&
      window.innerWidth <= 834;
    if (!active) {
      // Göm (men behåll) den fasta overlayn när vi inte är på kalender-vyn på
      // mobil — annars ligger #cco-book-v1-root (position:fixed) kvar och
      // blockerar andra vyer efter att man lämnat kalendern (Bugbot #264).
      if (root) root.style.display = 'none';
      return;
    }
    if (root) {
      // Återvisa overlayn OCH hämta om datan — annars fryses den första
      // hämtningen och nya/ändrade bokningar syns inte vid retur till
      // kalendern på mobil (Bugbot #264).
      root.style.display = '';
      populateBookingReal(root);
      return;
    }
    render({});
  }
  function boot() {
    maybeMount();
    var target = document.querySelector('.preview-canvas') || document.body;
    try {
      new MutationObserver(maybeMount).observe(target, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-app-shell-view'],
      });
    } catch (e) {
      /* ignore */
    }
    var lastMobile = window.innerWidth <= 834;
    window.addEventListener('resize', function () {
      var m = window.innerWidth <= 834;
      if (m !== lastMobile) {
        lastMobile = m;
        maybeMount();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
