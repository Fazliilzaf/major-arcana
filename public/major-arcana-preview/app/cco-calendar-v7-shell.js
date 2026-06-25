'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-calendar-v7-shell.js — facit-trogen MOBIL kalender (v7).
 * window.ArcanaCalendarV7.render(ctx) monterar app-shell under #cco-cal-v7-root,
 * kör facitens interaktions-JS och wirar timeline/day-swiper/status mot det
 * DELADE datalagret (ArcanaBookingCalendarShared) — samma källa som desktop-v8.
 * Brytpunkt: monteras på ≤1024px (mobil + iPad), v8 på >1024px.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  var MARKUP = `<div class="app-shell">

  <!-- ═══ TOP-BAR med sök ═══ -->
  <div class="top-bar">
    <span class="top-brand">CCO</span>
    <label class="search-box" id="searchBox">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" placeholder="Sök kund eller bokning…" id="searchInput" />
    </label>
    <button class="top-icon-btn" title="Mer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>
      </svg>
    </button>
  </div>

  <!-- ═══ PAGE-HEADER ═══ -->
  <div class="page-head">
    <div class="page-kicker">
      <span class="mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/>
        </svg>
      </span>
      Kalender
    </div>
    <div class="page-title-row">
      <h1 class="page-title">Tor 28 maj</h1>
      <span class="page-subtitle">· vecka 22 · 🔆 strålande</span>
    </div>
    <div class="status-row">
      <span class="status-pill status-pill--week">Vecka <span class="num">22</span></span>
      <span class="status-pill status-pill--success"><span class="dot"></span>8 bekräftade</span>
      <span class="status-pill status-pill--warning"><span class="dot"></span>2 tentativa</span>
      <span class="status-pill status-pill--conflict"><span class="dot"></span>1 konflikt</span>
      <span class="status-pill status-pill--info"><span class="dot"></span>3 återbesök</span>
    </div>
  </div>

  <!-- ═══ SEGMENT TABS ═══ -->
  <div class="segment-row">
    <div class="segment-group">
      <button class="segment-tab segment-tab--morgon" data-mode="morgon">☼ Morgon</button>
      <button class="segment-tab active" data-mode="dag">Dag</button>
      <button class="segment-tab" data-mode="vecka">Lista</button>
    </div>
  </div>

  <!-- ═══ DAGSWIPE med vibe-väder integrerad ═══ -->
  <div class="dayswipe" id="dayswipe">
    <div class="dayswipe-day"><span class="dayswipe-vibe">☀️</span><span class="dayswipe-label">Mån</span><span class="dayswipe-date">25</span><span class="dayswipe-count">6</span></div>
    <div class="dayswipe-day"><span class="dayswipe-vibe">🌤️</span><span class="dayswipe-label">Tis</span><span class="dayswipe-date">26</span><span class="dayswipe-count">8</span></div>
    <div class="dayswipe-day"><span class="dayswipe-vibe">⛅</span><span class="dayswipe-label">Ons</span><span class="dayswipe-date">27</span><span class="dayswipe-count">5</span></div>
    <div class="dayswipe-day is-active"><span class="dayswipe-vibe">🔆</span><span class="dayswipe-label">Tor</span><span class="dayswipe-date">28</span><span class="dayswipe-count">12</span></div>
    <div class="dayswipe-day"><span class="dayswipe-vibe">🌧️</span><span class="dayswipe-label">Fre</span><span class="dayswipe-date">29</span><span class="dayswipe-count">15</span></div>
    <div class="dayswipe-day"><span class="dayswipe-vibe">🌫️</span><span class="dayswipe-label">Lör</span><span class="dayswipe-date">30</span><span class="dayswipe-count">0</span></div>
    <div class="dayswipe-day"><span class="dayswipe-vibe">🌙</span><span class="dayswipe-label">Sön</span><span class="dayswipe-date">31</span><span class="dayswipe-count">0</span></div>
  </div>

  <!-- ═══ MORGON-STANDUP (visas när Morgon-läget) ═══ -->
  <div class="standup" id="standup" hidden>
    <div class="standup-greet">
      <div class="standup-sun"></div>
      <div>
        <h1>God morgon, <span>Fazli</span></h1>
        <p>Tor 28 maj · vecka 22 · klockan är 07:32</p>
      </div>
    </div>
    <div class="standup-stat-grid">
      <div class="standup-stat" data-kind="idag"><div class="kicker">Idag</div><div class="num">12 bokn.</div></div>
      <div class="standup-stat" data-kind="risker"><div class="kicker">3 risker</div><div class="num">Anna +2</div></div>
      <div class="standup-stat" data-kind="mojligheter"><div class="kicker">2 möjligh.</div><div class="num">Maria-luckan</div></div>
      <div class="standup-stat" data-kind="klart"><div class="kicker">Prognos</div><div class="num">Klar 17:00</div></div>
    </div>
    <div class="standup-quick">
      <button class="quick-pill quick-pill--ai">★ Skicka påminnelser (3)</button>
      <button class="quick-pill">★ Bekräfta (2)</button>
      <button class="quick-pill" data-jump-mode="dag">→ Dagens schema</button>
    </div>
  </div>

  <!-- ═══ DAGSTIDLINJE ═══ -->
  <div class="timeline" id="timeline">
    <!-- Hour rows -->
    <div class="hour-row" style="top:0"><span class="hour-label">07</span></div>
    <div class="hour-row" style="top:72px"><span class="hour-label">08</span></div>
    <div class="hour-row" style="top:144px"><span class="hour-label">09</span></div>
    <div class="hour-row" style="top:216px"><span class="hour-label">10</span></div>
    <div class="hour-row" style="top:288px"><span class="hour-label">11</span></div>
    <div class="hour-row" style="top:360px"><span class="hour-label">12</span></div>
    <div class="hour-row" style="top:432px"><span class="hour-label">13</span></div>
    <div class="hour-row" style="top:504px"><span class="hour-label">14</span></div>
    <div class="hour-row" style="top:576px"><span class="hour-label">15</span></div>
    <div class="hour-row" style="top:648px"><span class="hour-label">16</span></div>
    <div class="hour-row" style="top:720px"><span class="hour-label">17</span></div>
    <div class="hour-row" style="top:792px"><span class="hour-label">18</span></div>

    <!-- Bokningar -->
    <div class="booking" data-source="contact" data-status="confirmed" style="top:72px;height:54px" data-customer="Anna Karlsson" data-init="AK" data-treatment="PRP för hår" data-time="08:00 – 08:45" data-resource="Egzona">
      <span class="avatar" data-init="AK">AK</span>
      <div class="booking-time">08:00 – 08:45</div>
      <div class="booking-title">PRP för hår</div>
      <div class="booking-sub">Anna Karlsson · Egzona</div>
      <span class="booking-ai-badge">★ Friskförs. saknas</span>
    </div>

    <div class="booking" data-source="fazli" data-status="confirmed" style="top:144px;height:284px" data-customer="Karl Lindberg" data-init="KL" data-treatment="DHI ögonbryn" data-time="09:00 – 13:00" data-resource="Dr. Arya Emami">
      <span class="avatar" data-init="KL">KL</span>
      <div class="booking-time">09:00 – 13:00</div>
      <div class="booking-title">DHI ögonbryn</div>
      <div class="booking-sub">Karl Lindberg · Arya</div>
    </div>

    <div class="lunch-block" style="top:360px;height:62px">⌣ Lunch 12:00 – 13:00</div>

    <div class="booking" data-source="egzona" data-status="tentative" style="top:504px;height:54px" data-customer="Eva Karlsson" data-init="EK" data-treatment="Konsultation" data-time="14:30 – 15:15" data-resource="Egzona">
      <span class="avatar" data-init="EK">EK</span>
      <div class="booking-time">14:30 – 15:15</div>
      <div class="booking-title">Konsultation</div>
      <div class="booking-sub">Eva K. · Egzona</div>
      <span class="booking-ai-badge">★ Påminn nu</span>
    </div>

    <div class="empty-slot" data-predictive style="top:576px;height:54px">+ AI: ring Sofie · 15:00</div>

    <div class="booking" data-source="info" data-status="followup" style="top:648px;height:40px" data-customer="Johan Svensson" data-init="JS" data-treatment="Återbesök" data-time="16:00 – 16:30" data-resource="Clara">
      <span class="avatar" data-init="JS">JS</span>
      <div class="booking-time">16:00 – 16:30</div>
      <div class="booking-title">Återbesök</div>
      <div class="booking-sub">Johan Svensson · Clara</div>
    </div>

    <!-- NU-linje vid 14:23 → top = (14.383-7)*72 = 531 -->
    <div class="now-line" style="top:531px"><span class="now-label">NU 14:23</span></div>
  </div>

</div>
</div>
</div>

<!-- ═══ SEARCH RESULTS OVERLAY ═══ -->
<div class="search-results" id="searchResults">
  <div class="search-results-kicker">Kunder · 1 247 totalt</div>
  <div id="searchList"></div>
</div>

<!-- ═══ BOTTOM-NAV ═══ -->
<div class="bottom-nav">
  <button class="nav-item is-active">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
    Kalender
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4zm0 0l8 8 8-8"/></svg>
    Inkorg
  </button>
  <button class="nav-fab" id="micFab" title="Voice booking">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
    Kunder
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    Mer
  </button>
</div>

<!-- ═══ BOTTOM-SHEET (bokningsdetalj) ═══ -->
<div class="sheet-backdrop" id="sheetBackdrop"></div>
<div class="bottom-sheet" id="sheet">
  <div class="sheet-handle"></div>
  <div class="sheet-body" id="sheetBody"></div>
  <div class="sheet-sticky-action" id="sheetSticky"></div>
</div>

<!-- ═══ VOICE OVERLAY ═══ -->
<div class="voice-overlay" id="voiceOverlay">
  <div class="voice-orb"></div>
  <div class="voice-text" id="voiceText"></div>
  <div class="voice-hint">Säg vad du vill boka</div>
  <button class="voice-cancel" id="voiceCancel">Avbryt</button>
</div>`;
  var V7_PX_HOUR = 72; // facit: 07:00 = 0px, 72px/timme (top:72 = 08:00).
  var V7_BASE_HOUR = 7;

  function v7Esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function v7Top(min) {
    return Math.max(0, ((min - V7_BASE_HOUR * 60) / 60) * V7_PX_HOUR);
  }
  function v7Iso(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }
  function v7Monday(iso) {
    var d = new Date(iso + 'T12:00:00');
    var wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return d;
  }
  var V7_DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
  function v7Initials(name) {
    return (
      String(name || '')
        .split(/\s+/)
        .map(function (w) {
          return w[0] || '';
        })
        .join('')
        .slice(0, 2)
        .toUpperCase() || '—'
    );
  }

  function initV7Interactions() {
    try {
      /* ═══════════════════════════════════════════════════════════════
   CUSTOMER SEARCH
   ═══════════════════════════════════════════════════════════════ */

      const CUSTOMERS = [
        {
          name: 'Anna Karlsson',
          init: 'AK',
          bg: 'linear-gradient(180deg, #d8c1f0, #b48ad6)',
          sub: 'Återkommande · PRP återbesök tor 28 · 92%',
          badges: [
            { kind: 'risk', label: '⚠ Friskförs.' },
            { kind: 'upcoming', label: 'Tor 28 maj' },
          ],
        },
        {
          name: 'Karl Lindberg',
          init: 'KL',
          bg: 'linear-gradient(180deg, #c5d8a8, #92b86e)',
          sub: 'DHI ögonbryn tor 28 · 09:00–13:00',
          badges: [
            { kind: 'upcoming', label: 'Tor 28 maj' },
            { kind: 'ready', label: '✓ Redo' },
          ],
        },
        {
          name: 'Eva Karlsson',
          init: 'EK',
          bg: 'linear-gradient(180deg, #f4d4f0, #d48ac8)',
          sub: 'Tentativ tor 28 · 14:30 · 3 no-shows',
          badges: [{ kind: 'risk', label: '!! No-show-risk' }],
        },
        {
          name: 'Sofie Andersson',
          init: 'SA',
          bg: 'linear-gradient(180deg, #ffe3b8, #e8a04e)',
          sub: 'På väntelistan · vill boka konsultation',
          badges: [{ kind: 'vip', label: 'VIP' }],
        },
        {
          name: 'Marcus Berg',
          init: 'MB',
          bg: 'linear-gradient(180deg, #b8d4e8, #7aa8d4)',
          sub: 'PRP återbesök väntar · senast feb',
          badges: [{ kind: 'upcoming', label: 'Föreslå tis' }],
        },
        {
          name: 'Eva Johansson',
          init: 'EJ',
          bg: 'linear-gradient(180deg, #ffd4b5, #f0a070)',
          sub: 'Microneedling · obokad förfrågan',
          badges: [],
        },
        {
          name: 'Maria Larsson',
          init: 'ML',
          bg: 'linear-gradient(180deg, #f0c8c8, #d48484)',
          sub: 'Avbokade 14:30 · slot ledig',
          badges: [],
        },
        {
          name: 'Sara Pettersson',
          init: 'SP',
          bg: 'linear-gradient(180deg, #f0c8c8, #d48484)',
          sub: 'PRP för hår ons 27 · 10:00',
          badges: [{ kind: 'ready', label: '✓ Redo' }],
        },
        {
          name: 'Johan Svensson',
          init: 'JS',
          bg: 'linear-gradient(180deg, #d4d4d4, #a8a8a8)',
          sub: 'Återbesök tor 28 · 16:00',
          badges: [{ kind: 'upcoming', label: 'Idag' }],
        },
        {
          name: 'Lisa Holm',
          init: 'LH',
          bg: 'linear-gradient(180deg, #c8e8e0, #88c8b8)',
          sub: 'Ny kund · väntar bekräftelse',
          badges: [{ kind: 'risk', label: 'Ny' }],
        },
        {
          name: 'Erik Nordström',
          init: 'EN',
          bg: 'linear-gradient(180deg, #f4e8c8, #d4b870)',
          sub: 'PRP-kur 4/6 · nästa om 3 v',
          badges: [],
        },
        {
          name: 'Anna Larsson',
          init: 'AL',
          bg: 'linear-gradient(180deg, #e8d4ff, #b894e8)',
          sub: 'VIP · DHI nästa månad',
          badges: [{ kind: 'vip', label: 'VIP' }],
        },
      ];

      const searchInput = document.getElementById('searchInput');
      const searchBox = document.getElementById('searchBox');
      const searchResults = document.getElementById('searchResults');
      const searchList = document.getElementById('searchList');

      function renderSearch(q = '') {
        const ql = q.toLowerCase().trim();
        const filtered = ql
          ? CUSTOMERS.filter(
              (c) => c.name.toLowerCase().includes(ql) || c.sub.toLowerCase().includes(ql)
            )
          : CUSTOMERS;
        searchList.innerHTML =
          filtered
            .map(
              (c) => `
    <div class="search-result" data-name="${c.name}" data-init="${c.init}">
      <span class="search-avatar" style="background:${c.bg}">${c.init}</span>
      <div class="search-result-meta">
        <div class="search-result-name">${c.name}</div>
        <div class="search-result-sub">${c.sub}</div>
        ${c.badges.length ? `<div class="search-result-badges">${c.badges.map((b) => `<span class="search-badge search-badge--${b.kind}">${b.label}</span>`).join('')}</div>` : ''}
      </div>
      <span class="search-result-arrow">›</span>
    </div>
  `
            )
            .join('') ||
          `<div style="padding:24px;text-align:center;color:var(--cco-text-tertiary);font-size:12px">Ingen kund matchar "${q}"</div>`;
      }

      searchInput.addEventListener('focus', () => {
        searchBox.classList.add('is-focused');
        searchResults.classList.add('is-visible');
        renderSearch(searchInput.value);
      });
      searchInput.addEventListener('input', () => renderSearch(searchInput.value));
      searchInput.addEventListener('blur', () => {
        setTimeout(() => {
          searchBox.classList.remove('is-focused');
          if (!searchInput.value) searchResults.classList.remove('is-visible');
        }, 200);
      });

      // Klick på result → stäng + toast
      searchResults.addEventListener('click', (ev) => {
        const result = ev.target.closest('.search-result');
        if (!result) return;
        searchResults.classList.remove('is-visible');
        searchInput.blur();
        searchInput.value = '';
        toast(`✓ Öppnar ${result.dataset.name}`, 'success');
      });

      renderSearch();

      /* ═══════════════════════════════════════════════════════════════
   SEGMENT MODES (Morgon / Dag / Lista)
   ═══════════════════════════════════════════════════════════════ */
      const tabs = document.querySelectorAll('.segment-tab');
      const standup = document.getElementById('standup');
      const timeline = document.getElementById('timeline');
      const dayswipe = document.getElementById('dayswipe');

      tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
      document
        .querySelectorAll('[data-jump-mode]')
        .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.jumpMode)));

      function setMode(mode) {
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
        standup.hidden = mode !== 'morgon';
        timeline.style.display = mode === 'morgon' ? 'none' : '';
        dayswipe.style.display = mode === 'morgon' ? 'none' : '';
      }

      /* ═══════════════════════════════════════════════════════════════
   DAGSWIPE
   ═══════════════════════════════════════════════════════════════ */
      dayswipe.querySelectorAll('.dayswipe-day').forEach((day) => {
        day.addEventListener('click', () => {
          dayswipe
            .querySelectorAll('.dayswipe-day')
            .forEach((d) => d.classList.remove('is-active'));
          day.classList.add('is-active');
          const label = day.querySelector('.dayswipe-label').textContent;
          const date = day.querySelector('.dayswipe-date').textContent;
          document.querySelector('.page-title').textContent = `${label} ${date} maj`;
        });
      });

      /* ═══════════════════════════════════════════════════════════════
   BOOKING TAP → BOTTOM SHEET
   ═══════════════════════════════════════════════════════════════ */
      const sheet = document.getElementById('sheet');
      const sheetBackdrop = document.getElementById('sheetBackdrop');
      const sheetBody = document.getElementById('sheetBody');
      const sheetSticky = document.getElementById('sheetSticky');

      document
        .querySelectorAll('.booking')
        .forEach((b) => b.addEventListener('click', () => openSheet(b)));

      function openSheet(booking) {
        const d = booking.dataset;
        const avatarColor =
          booking.querySelector('.avatar').style.getPropertyValue('--av-bg') || '';
        sheetBody.innerHTML = `
    <div class="sheet-head">
      <span class="sheet-avatar" data-init="${d.init}" style="background: var(--av-bg, linear-gradient(180deg, #d8c1f0, #b48ad6))">${d.init}</span>
      <div>
        <div class="sheet-name">${d.customer}</div>
        <div class="sheet-meta">Återkommande · 92% engagemang</div>
      </div>
    </div>
    <div class="sheet-kicker">Bokning</div>
    <dl class="sheet-grid">
      <dt>Behandling</dt> <dd>${d.treatment}</dd>
      <dt>Tid</dt>        <dd>${d.time}</dd>
      <dt>Behandlare</dt> <dd>${d.resource}</dd>
      <dt>Källa</dt>      <dd><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--rail-${d.source});box-shadow:0 0 4px var(--rail-${d.source});vertical-align:middle;margin-right:4px"></span>${d.source}@hairtpclinic</dd>
      <dt>Status</dt>     <dd class="warn">${d.init === 'AK' ? 'Friskförsäkran saknas' : 'Bekräftad'}</dd>
    </dl>
    ${
      d.init === 'AK'
        ? `
      <div class="sheet-kicker">Redo för behandling</div>
      <div class="sheet-ready">
        <span class="ready-pill" data-state="success">✓ Hälsodekl.</span>
        <span class="ready-pill" data-state="success">✓ Samtycke</span>
        <span class="ready-pill" data-state="success">✓ Avtal</span>
        <span class="ready-pill" data-state="warning">⚠ Friskförs.</span>
        <span class="ready-pill" data-state="success">✓ ID</span>
        <span class="ready-pill" data-state="success">✓ Betalning</span>
      </div>
      <div class="ai-reason">
        Kunden är <strong>inte redo</strong>. Saknar friskförsäkran och bokningen är imorgon kl 08:00. Skicka påminnelse nu.
      </div>
    `
        : ''
    }
    <div class="sheet-tabs">
      <button class="sheet-tab active">Detalj</button>
      <button class="sheet-tab">Intel</button>
      <button class="sheet-tab">Note</button>
      <button class="sheet-tab">Svar</button>
    </div>
  `;
        sheetSticky.innerHTML = `
    <div class="sheet-cta-row">
      ${d.init === 'AK' ? '<button class="sheet-cta sheet-cta--ai">★ AI Skicka friskförsäkran</button>' : ''}
      <button class="sheet-cta">✎ Anteckna</button>
    </div>
    <div class="sheet-cta-row">
      <button class="sheet-cta">✉ Svarstudio</button>
      <button class="sheet-cta sheet-cta--primary">✓ Markera ankommen</button>
    </div>
  `;
        // Färga avataren rätt
        setTimeout(() => {
          const av = sheetBody.querySelector('.sheet-avatar');
          if (av) {
            const init = av.dataset.init;
            const customer = CUSTOMERS.find((c) => c.init === init);
            if (customer) av.style.background = customer.bg;
          }
        }, 0);
        sheet.classList.add('is-visible');
        sheetBackdrop.classList.add('is-visible');
      }

      function closeSheet() {
        sheet.classList.remove('is-visible');
        sheetBackdrop.classList.remove('is-visible');
      }
      sheetBackdrop.addEventListener('click', closeSheet);

      // AI-action i sheet → toast
      sheetSticky.addEventListener('click', (ev) => {
        const cta = ev.target.closest('.sheet-cta');
        if (!cta) return;
        closeSheet();
        const isAi = cta.classList.contains('sheet-cta--ai');
        const isPrim = cta.classList.contains('sheet-cta--primary');
        toast(
          isAi
            ? '✓ Friskförsäkran skickad'
            : isPrim
              ? '✓ Markerad ankommen'
              : `✓ ${cta.textContent.trim()}`,
          isPrim || isAi ? 'success' : 'default'
        );
      });

      /* ═══════════════════════════════════════════════════════════════
   VOICE BOOKING via FAB
   ═══════════════════════════════════════════════════════════════ */
      const fab = document.getElementById('micFab');
      const overlay = document.getElementById('voiceOverlay');
      const voiceText = document.getElementById('voiceText');
      const voiceCancel = document.getElementById('voiceCancel');
      const PHRASE = ['Boka', 'Anna', 'PRP', 'nästa', 'tisdag', 'fjorton', 'hos', 'Egzona'];
      let voiceTimers = [];

      fab.addEventListener('click', () => {
        if (fab.classList.contains('is-listening')) return stopVoice();
        startVoice();
      });
      voiceCancel.addEventListener('click', stopVoice);

      function startVoice() {
        fab.classList.add('is-listening');
        overlay.classList.add('is-active');
        voiceText.innerHTML = PHRASE.map(
          (w, i) => `<span class="word">${i === 0 ? '' : ' '}${w}</span>`
        ).join('');
        voiceTimers = [
          ...PHRASE.map((_, i) =>
            setTimeout(() => voiceText.children[i]?.classList.add('is-visible'), 300 + i * 280)
          ),
          setTimeout(
            () => {
              stopVoice();
              toast(
                '✓ Tolkat: Anna · PRP · tis 2 juni 14:00 · Egzona — sheet öppnar för bekräftelse',
                'success'
              );
            },
            300 + PHRASE.length * 280 + 600
          ),
        ];
      }
      function stopVoice() {
        fab.classList.remove('is-listening');
        overlay.classList.remove('is-active');
        voiceTimers.forEach((t) => clearTimeout(t));
        voiceTimers = [];
      }

      /* ═══════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════ */
      function toast(msg, kind = 'default') {
        const t = document.createElement('div');
        t.className = 'ai-toast' + (kind === 'success' ? ' ai-toast--success' : '');
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('is-visible'));
        setTimeout(() => {
          t.classList.remove('is-visible');
          setTimeout(() => t.remove(), 320);
        }, 2400);
      }

      /* Predictive empty slot click */
      document
        .querySelectorAll('.empty-slot')
        .forEach((s) =>
          s.addEventListener('click', () =>
            toast('✓ Förslag skickat till Svarstudio som utkast', 'success')
          )
        );

      /* Standup quick-actions */
      document.querySelectorAll('.standup-quick .quick-pill').forEach((b) => {
        if (b.dataset.jumpMode) return;
        b.addEventListener('click', () =>
          toast('✓ ' + b.textContent.replace(/^★ /, ''), 'success')
        );
      });
    } catch (e) {
      if (window.console) console.warn('[cco-cal-v7] interaktion:', e && e.message);
    }
  }

  async function populateV7Real(root) {
    try {
      if (typeof window.__ARCANA_ENSURE_BOOKING_SCRIPTS__ === 'function') {
        await window.__ARCANA_ENSURE_BOOKING_SCRIPTS__();
      }
      var S = window.ArcanaBookingCalendarShared;
      if (!S || typeof S.fetchCalendarRange !== 'function') return;
      var today = S.todayIso ? S.todayIso() : v7Iso(new Date());
      var monday = v7Monday(today);
      var week = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(monday);
        d.setDate(d.getDate() + i);
        week.push(v7Iso(d));
      }
      var range = await S.fetchCalendarRange(week[0], week[6]);
      var sbd = range && range.slotsByDate;
      var getDay = function (iso) {
        return (sbd instanceof Map ? sbd.get(iso) : sbd && sbd[iso]) || [];
      };
      var bookedOn = function (iso) {
        return getDay(iso).filter(function (s) {
          return s && s.kind === 'booked';
        });
      };

      // DAY-SWIPER — 7 dagar, riktig räknare
      var cells = root.querySelectorAll('.dayswipe-day');
      for (var c = 0; c < cells.length && c < 7; c++) {
        var dd = new Date(week[c] + 'T12:00:00');
        var lab = cells[c].querySelector('.dayswipe-label');
        var dat = cells[c].querySelector('.dayswipe-date');
        var cnt = cells[c].querySelector('.dayswipe-count');
        if (lab) lab.textContent = V7_DAYS[c];
        if (dat) dat.textContent = String(dd.getDate());
        if (cnt) cnt.textContent = String(bookedOn(week[c]).length);
        cells[c].classList.toggle('is-active', week[c] === today);
      }

      // TITEL + SUBTITEL — riktigt datum/vecka
      var nowD = new Date(today + 'T12:00:00');
      var isoWeek = function (d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
        var f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
        return 1 + Math.round(((t - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
      };
      var wk = isoWeek(nowD);
      var ttl = root.querySelector('.page-title');
      if (ttl)
        ttl.textContent = nowD.toLocaleDateString('sv-SE', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
        });
      var sub = root.querySelector('.page-subtitle');
      if (sub) sub.textContent = '· vecka ' + wk;

      // STATUS-PILLS — riktiga räknare (behåll dot, byt text)
      var wkBooked0 = week.reduce(function (a, iso) {
        return a.concat(bookedOn(iso));
      }, []);
      var sc0 = function (re) {
        return wkBooked0.filter(function (s) {
          return re.test(String(s.status || ''));
        }).length;
      };
      var setPill = function (cls, n, label) {
        var pill = root.querySelector('.status-pill--' + cls);
        if (!pill) return;
        var dot = pill.querySelector('.dot');
        pill.innerHTML = (dot ? dot.outerHTML : '') + n + ' ' + label;
      };
      var wkNum = root.querySelector('.status-pill--week .num');
      if (wkNum) wkNum.textContent = String(wk);
      setPill('success', sc0(/(confirm|bekräft|bekraft|planer)/i), 'bekräftade');
      setPill('warning', sc0(/(tentat|pending|väntar|vantar)/i), 'tentativa');
      setPill('conflict', (range && range.conflicts && range.conflicts.length) || 0, 'konflikt');

      // TIMELINE — dagens slots (booked = kort m. avatar, available = empty-slot)
      var tl = root.querySelector('#timeline') || root.querySelector('.timeline');
      if (tl) {
        // behåll hour-rows + now-line, ersätt bara boknings-/slot-korten
        tl.querySelectorAll('.booking, .empty-slot, .lunch-block').forEach(function (el) {
          el.remove();
        });
        var slots = getDay(today)
          .slice()
          .sort(function (a, b) {
            return S.slotStartMinutes(a) - S.slotStartMinutes(b);
          });
        var html = slots
          .map(function (s) {
            var booked = s.kind === 'booked';
            var startMin = S.slotStartMinutes(s);
            var dur = s.durationMinutes || 30;
            var top = Math.round(v7Top(startMin));
            var h = Math.max(40, Math.round((dur / 60) * V7_PX_HOUR));
            var range2 = S.formatTimeRange(s) || '';
            if (!booked) {
              return (
                '<div class="empty-slot" style="top:' +
                top +
                'px;height:' +
                h +
                'px"><span>Ledig · ' +
                v7Esc(s.resourceLabel || '') +
                ' · ' +
                v7Esc(range2) +
                '</span></div>'
              );
            }
            var name = s.title || s.customer || 'Bokning';
            return (
              '<div class="booking" data-source="info" data-status="confirmed" style="top:' +
              top +
              'px;height:' +
              h +
              'px"><span class="avatar">' +
              v7Esc(v7Initials(name)) +
              '</span><div class="booking-time">' +
              v7Esc(range2) +
              '</div><div class="booking-title">' +
              v7Esc(s.serviceLabel || name) +
              '</div><div class="booking-sub">' +
              v7Esc(s.resourceLabel || '') +
              '</div></div>'
            );
          })
          .join('');
        tl.insertAdjacentHTML('beforeend', html);
      }

      // STATUS-ROW — veckans riktiga räknare
      var weekBooked = week.reduce(function (a, iso) {
        return a.concat(bookedOn(iso));
      }, []);
      var sc = function (re) {
        return weekBooked.filter(function (s) {
          return re.test(String(s.status || ''));
        }).length;
      };
      var setStat = function (re, n) {
        var els = root.querySelectorAll('.status-row *, .status-pill, .standup-stat');
        for (var k = 0; k < els.length; k++) {
          if (re.test(els[k].textContent || '')) {
            var num = els[k].querySelector('.count, .standup-stat-value, b, strong');
            if (num) {
              num.textContent = String(n);
              return;
            }
          }
        }
      };
      setStat(/bekräftade/i, sc(/(confirm|bekräft|bekraft|planer)/i));
      setStat(/tentativa/i, sc(/(tentat|pending|väntar|vantar)/i));
      setStat(/konflikt/i, (range && range.conflicts && range.conflicts.length) || 0);
    } catch (e) {
      if (window.console) console.warn('[cco-cal-v7] data:', e && e.message);
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
    var root = document.getElementById('cco-cal-v7-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cco-cal-v7-root';
      host.appendChild(root);
    }
    root.innerHTML = MARKUP;
    initV7Interactions();
    populateV7Real(root);
    return root;
  }
  window.ArcanaCalendarV7 = { render: render };
})();
