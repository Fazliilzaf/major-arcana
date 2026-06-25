'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-customers-v10-shell.js — facit-trogen MOBIL kund-vy (v10).
 * window.ArcanaCustomersV10.render(ctx) monterar app-shell + bottom-nav +
 * dossier-sheet under #cco-cust-v10-root, kör facitens interaktions-JS (kort,
 * filter, AI-aggregat, dossier-sheet, kamera) och uppgraderar räknarna mot
 * riktig kund-data (/api/v1/cco/customers/state) där den är nåbar — annars
 * visas facit-demo. Brytpunkt: monteras ≤834px (mobil + iPad stående).
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  var MARKUP = `<div class="app-shell">

  <div class="top-bar">
    <span class="top-brand">CCO</span>
    <label class="search-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="search" placeholder="Sök kund…" />
    </label>
    <button class="top-icon-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></svg></button>
  </div>

  <div class="page-head">
    <div class="page-kicker">
      <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg></span>
      Kunder
    </div>
    <div class="page-title-row">
      <h1 class="page-title">1 247</h1>
      <span class="page-subtitle">· 87 aktiva i maj · ★ 234 VIP</span>
    </div>
    <div class="status-row">
      <span class="status-pill status-pill--success"><span class="dot"></span>87 aktiva</span>
      <span class="status-pill status-pill--vip"><span class="dot"></span>234 VIP</span>
      <span class="status-pill status-pill--warning"><span class="dot"></span>12 risk</span>
      <span class="status-pill status-pill--info"><span class="dot"></span>89 nya</span>
      <span class="status-pill"><span class="dot" style="background:var(--cco-text-tertiary)"></span>456 dormant</span>
    </div>
  </div>

  <!-- AI-aggregat (swipeable) -->
  <div class="agg-strip">
    <div class="agg-card" data-kind="action">
      <div class="agg-card-kicker">★ Idag</div>
      <div class="agg-card-body"><strong>3 kunder</strong> behöver kontakt: Anna (friskförs.), Karl (betalt halvt), Eva (no-show-risk)</div>
      <span class="agg-card-cta">→ Visa alla</span>
    </div>
    <div class="agg-card" data-kind="opp">
      <div class="agg-card-kicker">★ Möjlighet</div>
      <div class="agg-card-body"><strong>5 VIP</strong> har inte bokat på 60+ dagar — föreslå outreach</div>
      <span class="agg-card-cta">→ Skapa kampanj</span>
    </div>
    <div class="agg-card" data-kind="risk">
      <div class="agg-card-kicker">★ Risk</div>
      <div class="agg-card-body"><strong>28 kunder</strong> har bokningar inom 3 dagar men saknar formulär</div>
      <span class="agg-card-cta">→ Mass-påminnelse</span>
    </div>
    <div class="agg-card" data-kind="trend">
      <div class="agg-card-kicker">★ Trend</div>
      <div class="agg-card-body">Snittbesök-värde upp <strong>+8% Q2</strong>. Mest p.g.a. fler kompletta PRP-kurer.</div>
      <span class="agg-card-cta">→ Se analys</span>
    </div>
  </div>

  <!-- Filter-chips -->
  <div class="filter-row">
    <button class="filter-chip active">Alla <span class="count">1 247</span></button>
    <button class="filter-chip">Aktiva <span class="count">87</span></button>
    <button class="filter-chip" data-kind="vip">★ VIP <span class="count">234</span></button>
    <button class="filter-chip">⚠ Risk <span class="count">12</span></button>
    <button class="filter-chip">Nya <span class="count">89</span></button>
    <button class="filter-chip">Dormant <span class="count">456</span></button>
    <button class="filter-chip">Saknar formulär <span class="count">28</span></button>
  </div>

  <div class="customers-list" id="customerList"></div>
</div>
<!-- Bottom-nav -->
<div class="bottom-nav">
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
    Kalender
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4zm0 0l8 8 8-8"/></svg>
    Inkorg
  </button>
  <button class="nav-fab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg></button>
  <button class="nav-item is-active">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
    Kunder
  </button>
  <button class="nav-item">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    Mer
  </button>
</div>

<!-- Dossier sheet -->
<div class="sheet-backdrop" id="sheetBackdrop"></div>
<div class="dossier-sheet" id="dossierSheet">
  <div class="ds-handle"></div>
  <div id="dossierContent" style="display:flex;flex-direction:column;flex:1;overflow:hidden"></div>
</div>`;

  function initV10Interactions() {
    try {
      const CUSTOMERS = [
        {
          name: 'Anna Karlsson',
          init: 'AK',
          bg: 'linear-gradient(180deg,#d8c1f0,#b48ad6)',
          phone: '0704-12 34 56',
          email: 'contact@hairtpclinic',
          state: 'vip',
          stateLabel: 'VIP',
          lastVisit: '5 maj',
          lastSub: 'PRP 3/6 · Egzona',
          revenue: '38 400',
          trend: '+18% YTD',
          trendUp: true,
          visits: '12',
          noshow: '0',
          ai: 'Boka 5:e PRP omkring 12 jun · friskförsäkran saknas inför imorgon',
          tags: [
            { kind: 'vip', label: 'VIP' },
            { kind: 'cycle', label: 'PRP 4/6' },
            { kind: 'risk', label: '⚠ Friskförs.' },
          ],
        },
        {
          name: 'Karl Lindberg',
          init: 'KL',
          bg: 'linear-gradient(180deg,#c5d8a8,#92b86e)',
          phone: '0708-55 12 33',
          email: 'info@hairtpclinic',
          state: 'active',
          stateLabel: 'Aktiv',
          lastVisit: '12 apr',
          lastSub: 'Konsultation',
          revenue: '14 200',
          trend: '+ny',
          trendUp: true,
          visits: '3',
          noshow: '0',
          ai: 'DHI ögonbryn imorgon 09:00 · ✓ Redo',
          tags: [
            { kind: 'cycle', label: 'DHI-track' },
            { kind: 'ready', label: '✓ Redo' },
          ],
        },
        {
          name: 'Eva Karlsson',
          init: 'EK',
          bg: 'linear-gradient(180deg,#f4d4f0,#d48ac8)',
          phone: '0709-44 22 11',
          email: 'egzona@hairtpclinic',
          state: 'risk',
          stateLabel: 'Risk',
          lastVisit: '14 mar',
          lastSub: 'No-show (3:e)',
          revenue: '4 800',
          trend: '−2 besök',
          trendUp: false,
          visits: '6',
          noshow: '3',
          ai: 'Begär 50% deposition vid nästa bokning',
          tags: [{ kind: 'risk', label: '!! No-show ×3' }],
        },
        {
          name: 'Sofie Andersson',
          init: 'SA',
          bg: 'linear-gradient(180deg,#ffe3b8,#e8a04e)',
          phone: '0707-89 22 14',
          email: 'contact@hairtpclinic',
          state: 'new',
          stateLabel: 'Ny',
          lastVisit: '—',
          lastSub: 'På väntelistan',
          revenue: '0',
          trend: 'Ny denna v.',
          trendUp: true,
          visits: '0',
          noshow: '0',
          ai: 'Matchar Maria-luckan 14:30 idag → ring nu (92% match)',
          tags: [
            { kind: 'new', label: 'Ny' },
            { kind: 'ready', label: '★ Match 92%' },
          ],
        },
        {
          name: 'Marcus Berg',
          init: 'MB',
          bg: 'linear-gradient(180deg,#b8d4e8,#7aa8d4)',
          phone: '0703-15 88 92',
          email: 'info@hairtpclinic',
          state: 'active',
          stateLabel: 'Aktiv',
          lastVisit: '8 feb',
          lastSub: 'PRP-paus',
          revenue: '18 600',
          trend: '+3%',
          trendUp: true,
          visits: '7',
          noshow: '0',
          ai: 'PRP återbesök väntar — föreslå tis 09:00',
          tags: [{ kind: 'cycle', label: 'PRP 3/6' }],
        },
        {
          name: 'Anna Larsson',
          init: 'AL',
          bg: 'linear-gradient(180deg,#e8d4ff,#b894e8)',
          phone: '0705-90 14 23',
          email: 'fazli@hairtpclinic',
          state: 'vip',
          stateLabel: 'VIP',
          lastVisit: '23 jan',
          lastSub: 'DHI konsultation',
          revenue: '52 800',
          trend: '+22%',
          trendUp: true,
          visits: '9',
          noshow: '0',
          ai: 'Tystnad 65 dagar — outreach via Svarstudio?',
          tags: [
            { kind: 'vip', label: 'VIP' },
            { kind: 'risk', label: 'Tyst 65d' },
          ],
        },
        {
          name: 'Erik Nordström',
          init: 'EN',
          bg: 'linear-gradient(180deg,#f4e8c8,#d4b870)',
          phone: '0706-22 18 14',
          email: 'contact@hairtpclinic',
          state: 'active',
          stateLabel: 'Aktiv',
          lastVisit: '2 maj',
          lastSub: 'PRP 4/6',
          revenue: '24 400',
          trend: '+stabilt',
          trendUp: true,
          visits: '5',
          noshow: '0',
          ai: 'PRP 5/6 om ~3v · boka tis 14:00?',
          tags: [
            { kind: 'cycle', label: 'PRP 4/6' },
            { kind: 'ready', label: '✓ Redo' },
          ],
        },
        {
          name: 'Eva Johansson',
          init: 'EJ',
          bg: 'linear-gradient(180deg,#ffd4b5,#f0a070)',
          phone: '0706-77 31 09',
          email: 'egzona@hairtpclinic',
          state: 'new',
          stateLabel: 'Ny',
          lastVisit: '—',
          lastSub: 'Microneedling-förfrågan',
          revenue: '0',
          trend: 'Ny idag',
          trendUp: true,
          visits: '0',
          noshow: '0',
          ai: 'Boka konsultation · uppgrad → microneedling-paket?',
          tags: [{ kind: 'new', label: 'Ny' }],
        },
        {
          name: 'Petter Gustafsson',
          init: 'PG',
          bg: 'linear-gradient(180deg,#d0c8f0,#9a8ad8)',
          phone: '0705-66 19 44',
          email: 'fazli@hairtpclinic',
          state: 'dormant',
          stateLabel: 'Dormant',
          lastVisit: '14 nov',
          lastSub: 'DHI komplett',
          revenue: '42 800',
          trend: '−6m tystnad',
          trendUp: false,
          visits: '4',
          noshow: '0',
          ai: 'Skicka årsuppföljning + check-in?',
          tags: [{ kind: 'vip', label: 'VIP' }],
        },
      ];

      function cardHtml(c) {
        return `
    <div class="customer-card" data-name="${c.name}">
      <div class="cc-top">
        <span class="cc-avatar" style="background:${c.bg}">${c.init}</span>
        <div class="cc-meta">
          <div class="cc-name">${c.name}</div>
          <div class="cc-sub">${c.phone}</div>
        </div>
        <span class="cc-status" data-state="${c.state}"><span class="dot"></span>${c.stateLabel}</span>
      </div>
      ${c.tags.length ? `<div class="cc-tags">${c.tags.map((t) => `<span class="cc-tag cc-tag--${t.kind}">${t.label}</span>`).join('')}</div>` : ''}
      <div class="cc-stats">
        <div class="cc-stat"><div class="cc-stat-label">Senaste</div><div class="cc-stat-value">${c.lastVisit}</div><div class="cc-stat-trend">${c.lastSub}</div></div>
        <div class="cc-stat"><div class="cc-stat-label">LTV</div><div class="cc-stat-value">${c.revenue} kr</div><div class="cc-stat-trend ${c.trendUp ? 'up' : 'down'}">${c.trend}</div></div>
      </div>
      <div class="cc-ai">${c.ai}</div>
    </div>
  `;
      }

      document.getElementById('customerList').innerHTML = CUSTOMERS.map(cardHtml).join('');

      document.querySelectorAll('.customer-card').forEach((card) => {
        card.addEventListener('click', () => openDossier(card.dataset.name));
      });

      // Filter
      document.querySelectorAll('.filter-chip').forEach((c) => {
        c.addEventListener('click', () => {
          document.querySelectorAll('.filter-chip').forEach((o) => o.classList.remove('active'));
          c.classList.add('active');
        });
      });

      // Aggregat
      document.querySelectorAll('.agg-card').forEach((card) => {
        card.addEventListener('click', () => toast('✓ AI-åtgärd startad — väntar på godkännande'));
      });

      /* ───── DOSSIER SHEET ───── */
      const sheet = document.getElementById('dossierSheet');
      const backdrop = document.getElementById('sheetBackdrop');
      const content = document.getElementById('dossierContent');

      function openDossier(name) {
        const c = CUSTOMERS.find((x) => x.name === name);
        if (!c) return;

        content.innerHTML = `
    <div class="ds-head">
      <div class="ds-avatar" style="background:${c.bg}">${c.init}</div>
      <div class="ds-head-body">
        <div class="ds-kicker">★ Kunddossiér</div>
        <div class="ds-name">${c.name}</div>
        <div class="ds-contact">${c.email} · ${c.phone}</div>
        <div class="ds-tags">${c.tags.map((t) => `<span class="ds-tag ds-tag--${t.kind}">${t.label}</span>`).join('')}</div>
      </div>
      <button class="ds-close" id="dsClose">×</button>
    </div>

    <div class="ds-stats">
      <div class="ds-stat"><div class="ds-stat-label">Besök</div><div class="ds-stat-value">${c.visits}</div><div class="ds-stat-trend">+stabilt</div></div>
      <div class="ds-stat"><div class="ds-stat-label">Intäkt</div><div class="ds-stat-value">${c.revenue} kr</div><div class="ds-stat-trend">${c.trend}</div></div>
      <div class="ds-stat"><div class="ds-stat-label">No-show</div><div class="ds-stat-value">${c.noshow}</div><div class="ds-stat-trend">${c.noshow === '0' ? 'Klockren' : 'Risk'}</div></div>
    </div>

    <div class="ds-tabs">
      <button class="ds-tab active" data-tab="overview">Översikt</button>
      <button class="ds-tab" data-tab="history">Historik</button>
      <button class="ds-tab" data-tab="files">Filer</button>
      <button class="ds-tab" data-tab="comm">Komm</button>
    </div>

    <div class="ds-scroll" id="dsScroll">
      <div class="ds-section-title">★ AI-rekommendation</div>
      <div class="ds-insight">${c.ai}</div>

      <div class="ds-section-title">Kommande bokningar</div>
      <div class="ds-booking" data-source="${c.state === 'risk' ? 'egzona' : 'contact'}">
        <div class="ds-date"><div class="day">TOR</div><div class="num">28</div><div class="mon">MAJ</div></div>
        <div class="ds-booking-meta"><div class="ds-booking-title">${c.lastSub.split(' · ')[0] || 'PRP'}</div><div class="ds-booking-sub">08:00 · 45 min</div></div>
        <span class="ds-booking-state" data-state="${c.state === 'risk' ? 'warn' : 'ready'}">${c.state === 'risk' ? '⚠ Risk' : '✓ Redo'}</span>
      </div>

      <div class="ds-section-title">Senaste anteckningar</div>
      <div class="ds-note">Bra svar på behandling 3, fortsätt med 4. Inga biverkningar.<div class="ds-note-meta">Egzona · 5 maj 2026</div></div>
      <div class="ds-note">Kund är väldigt motiverad och följer eftervård exakt.<div class="ds-note-meta">Egzona · 14 apr 2026</div></div>
    </div>

    <div class="ds-actions">
      <button class="ds-cta ds-cta--ai full">★ AI Skicka friskförsäkran</button>
      <button class="ds-cta">✎ Anteckna</button>
      <button class="ds-cta">✉ Svarstudio</button>
      <button class="ds-cta ds-cta--camera full" data-camera-open data-name="${c.name}" data-init="${c.init}" data-bg="${c.bg.replace(/"/g, '&quot;')}">📷 Ta bild · spara i journal</button>
      <button class="ds-cta ds-cta--success full">✓ Boka nästa tid</button>
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
            toast(
              '✓ ' +
                cta.textContent
                  .replace(/^★ /, '')
                  .replace(/^✎ /, '')
                  .replace(/^✉ /, '')
                  .replace(/^✓ /, '')
            );
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

      /* ═══════════════════════════════════════════════════════════════
   KAMERA (mobil) — fota, annotera, spara i journal
   ═══════════════════════════════════════════════════════════════ */
      (function buildCamOverlay() {
        if (document.getElementById('camOverlay')) return;
        const ov = document.createElement('div');
        ov.className = 'cam-overlay';
        ov.id = 'camOverlay';
        ov.innerHTML = `
    <div class="cam-head">
      <div class="cam-head-info">
        <div class="cam-head-avatar" id="camAvatar"></div>
        <div class="cam-head-meta"><div class="name" id="camName">—</div><div class="sub" id="camSub">CCO journal</div></div>
      </div>
      <button class="cam-close" id="camClose">×</button>
    </div>
    <div class="cam-stage" id="camStage" data-mode="loading">
      <div class="cam-canvas-wrap" id="camCanvasWrap">
        <span class="cam-badge">REC · LIVE</span>
        <span class="cam-meta-stamp" id="camStamp"></span>
        <video class="cam-video" id="camVideo" autoplay playsinline muted></video>
        <canvas class="cam-photo" id="camPhoto" hidden></canvas>
        <canvas class="cam-annot" id="camAnnot" hidden></canvas>
      </div>
    </div>
    <div class="cam-toolbar" id="camToolbar"></div>
  `;
        document.body.appendChild(ov);
      })();

      let camState = { stream: null, customer: null, tool: 'pen', color: '#d8526b', strokes: [] };

      function openCamera(name, init, bgRaw) {
        const bg = bgRaw.replace(/&quot;/g, '"');
        document.getElementById('camAvatar').style.background = bg;
        document.getElementById('camAvatar').textContent = init;
        document.getElementById('camName').textContent = name;
        document.getElementById('camStamp').textContent =
          `${name} · ${new Date().toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' })}`;
        document.getElementById('camOverlay').classList.add('is-visible');
        camState.customer = { name, init, bg };
        startCamera();
      }

      function startCamera() {
        const video = document.getElementById('camVideo');
        const photo = document.getElementById('camPhoto');
        const annot = document.getElementById('camAnnot');
        const stage = document.getElementById('camStage');
        photo.hidden = true;
        annot.hidden = true;
        video.hidden = false;
        stage.dataset.mode = 'loading';
        camState.strokes = [];
        renderCamToolbar('loading');

        navigator.mediaDevices
          .getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
            audio: false,
          })
          .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
          .then((stream) => {
            camState.stream = stream;
            video.srcObject = stream;
            stage.dataset.mode = 'live';
            renderCamToolbar('live');
          })
          .catch((err) => {
            stage.dataset.mode = 'error';
            stage.innerHTML = `<div class="cam-error"><h3>Kameran kunde inte startas</h3><p>${err.name === 'NotAllowedError' ? 'Tillåt kamera-åtkomst i webbläsaren och försök igen.' : err.message || 'Okänt fel.'}</p></div>`;
            renderCamToolbar('error');
          });
      }

      function capturePhoto() {
        const video = document.getElementById('camVideo');
        const photo = document.getElementById('camPhoto');
        const annot = document.getElementById('camAnnot');
        const stage = document.getElementById('camStage');
        if (!video.videoWidth) return;
        photo.width = video.videoWidth;
        photo.height = video.videoHeight;
        photo.getContext('2d').drawImage(video, 0, 0);
        if (camState.stream) {
          camState.stream.getTracks().forEach((t) => t.stop());
          camState.stream = null;
        }
        video.hidden = true;
        photo.hidden = false;
        annot.hidden = false;
        annot.width = photo.width;
        annot.height = photo.height;
        annot.style.width = photo.offsetWidth + 'px';
        annot.style.height = photo.offsetHeight + 'px';
        stage.dataset.mode = 'captured';
        camState.strokes = [];
        renderCamToolbar('captured');
      }

      function renderCamToolbar(mode) {
        const tb = document.getElementById('camToolbar');
        if (mode === 'live') {
          tb.innerHTML = `<button class="cam-capture" id="camCapture"></button>`;
          document.getElementById('camCapture').addEventListener('click', capturePhoto);
        } else if (mode === 'captured') {
          tb.innerHTML = `
      <div class="cam-tool-row">
        <button class="cam-tool ${camState.tool === 'pen' ? 'is-active' : ''}" data-tool="pen">✎ Penna</button>
        <button class="cam-tool ${camState.tool === 'circle' ? 'is-active' : ''}" data-tool="circle">○ Cirkel</button>
        <button class="cam-tool ${camState.tool === 'arrow' ? 'is-active' : ''}" data-tool="arrow">↗ Pil</button>
        <button class="cam-tool" data-color style="--swatch:#d8526b" data-c="#d8526b"></button>
        <button class="cam-tool" data-color style="--swatch:#c8821e" data-c="#c8821e"></button>
        <button class="cam-tool" data-color style="--swatch:#4a8268" data-c="#4a8268"></button>
        <button class="cam-tool" data-color style="--swatch:#ffffff" data-c="#ffffff"></button>
        <button class="cam-tool" id="camUndo">↶ Ångra</button>
      </div>
      <div class="cam-save-row">
        <button class="cam-save cam-save--delete" id="camDelete">🗑 Radera</button>
        <button class="cam-save cam-save--retake" id="camRetake">↻ Ny</button>
        <button class="cam-save cam-save--primary" id="camSave">✓ Spara</button>
      </div>
    `;
          tb.querySelectorAll('[data-color]').forEach((b) => {
            if (b.dataset.c === camState.color) b.classList.add('is-active');
            b.addEventListener('click', () => {
              camState.color = b.dataset.c;
              tb.querySelectorAll('[data-color]').forEach((o) => o.classList.remove('is-active'));
              b.classList.add('is-active');
            });
          });
          tb.querySelectorAll('[data-tool]').forEach((b) =>
            b.addEventListener('click', () => {
              camState.tool = b.dataset.tool;
              tb.querySelectorAll('[data-tool]').forEach((o) => o.classList.remove('is-active'));
              b.classList.add('is-active');
            })
          );
          document.getElementById('camUndo').addEventListener('click', () => {
            camState.strokes.pop();
            redrawStrokes();
          });
          document.getElementById('camDelete').addEventListener('click', () => {
            if (confirm('Radera bilden?')) closeCamera();
          });
          document.getElementById('camRetake').addEventListener('click', startCamera);
          document.getElementById('camSave').addEventListener('click', savePhoto);
          setupAnnotation();
        } else if (mode === 'loading') {
          tb.innerHTML = `<div class="cam-loading"><div class="cam-loading-spinner"></div>Startar kameran…</div>`;
        } else if (mode === 'error') {
          tb.innerHTML = `
      <div class="cam-save-row">
        <button class="cam-save cam-save--retake" onclick="document.getElementById('camStage').innerHTML='';startCamera();">Försök igen</button>
        <button class="cam-save cam-save--delete" onclick="closeCamera()">Stäng</button>
      </div>`;
        }
      }

      function setupAnnotation() {
        const annot = document.getElementById('camAnnot');
        let drawing = false,
          currentStroke = null;
        function getPos(e) {
          const r = annot.getBoundingClientRect();
          const t = e.touches ? e.touches[0] : e;
          return {
            x: (t.clientX - r.left) * (annot.width / r.width),
            y: (t.clientY - r.top) * (annot.height / r.height),
          };
        }
        annot.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          drawing = true;
          currentStroke = { tool: camState.tool, color: camState.color, points: [getPos(e)] };
          camState.strokes.push(currentStroke);
        });
        annot.addEventListener('pointermove', (e) => {
          if (!drawing) return;
          e.preventDefault();
          currentStroke.points.push(getPos(e));
          redrawStrokes();
        });
        annot.addEventListener('pointerup', () => {
          drawing = false;
        });
        annot.addEventListener('pointerleave', () => {
          drawing = false;
        });
      }

      function redrawStrokes() {
        const annot = document.getElementById('camAnnot');
        const ctx = annot.getContext('2d');
        ctx.clearRect(0, 0, annot.width, annot.height);
        camState.strokes.forEach((s) => {
          ctx.strokeStyle = s.color;
          ctx.fillStyle = s.color;
          ctx.lineWidth = Math.max(3, annot.width * 0.006);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (s.tool === 'pen') {
            ctx.beginPath();
            s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
          } else if (s.tool === 'circle' && s.points.length >= 2) {
            const a = s.points[0],
              b = s.points[s.points.length - 1];
            const r = Math.hypot(b.x - a.x, b.y - a.y);
            ctx.beginPath();
            ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (s.tool === 'arrow' && s.points.length >= 2) {
            const a = s.points[0],
              b = s.points[s.points.length - 1];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const ah = Math.max(14, annot.width * 0.022);
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - ah * Math.cos(ang - 0.4), b.y - ah * Math.sin(ang - 0.4));
            ctx.lineTo(b.x - ah * Math.cos(ang + 0.4), b.y - ah * Math.sin(ang + 0.4));
            ctx.closePath();
            ctx.fill();
          }
        });
      }

      function savePhoto() {
        const photo = document.getElementById('camPhoto');
        const annot = document.getElementById('camAnnot');
        const out = document.createElement('canvas');
        out.width = photo.width;
        out.height = photo.height;
        const ctx = out.getContext('2d');
        ctx.drawImage(photo, 0, 0);
        ctx.drawImage(annot, 0, 0);
        const dataUrl = out.toDataURL('image/jpeg', 0.88);
        closeCamera();
        toast(`✓ Bild sparad i ${camState.customer?.name}s journal`);
      }

      function closeCamera() {
        document.getElementById('camOverlay').classList.remove('is-visible');
        if (camState.stream) {
          camState.stream.getTracks().forEach((t) => t.stop());
          camState.stream = null;
        }
        setTimeout(() => {
          const stage = document.getElementById('camStage');
          if (stage && !stage.querySelector('#camCanvasWrap')) {
            stage.innerHTML = `<div class="cam-canvas-wrap" id="camCanvasWrap"><span class="cam-badge">REC · LIVE</span><span class="cam-meta-stamp" id="camStamp"></span><video class="cam-video" id="camVideo" autoplay playsinline muted></video><canvas class="cam-photo" id="camPhoto" hidden></canvas><canvas class="cam-annot" id="camAnnot" hidden></canvas></div>`;
          }
        }, 400);
      }

      document.getElementById('camClose').addEventListener('click', closeCamera);

      document.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-camera-open]');
        if (!btn) return;
        ev.preventDefault();
        openCamera(
          btn.dataset.name || 'Kund',
          btn.dataset.init || '?',
          btn.dataset.bg || 'linear-gradient(180deg,#d4d4d4,#a8a8a8)'
        );
      });
      document.addEventListener('keydown', (ev) => {
        if (
          ev.key === 'Escape' &&
          document.getElementById('camOverlay').classList.contains('is-visible')
        )
          closeCamera();
      });
    } catch (e) {
      if (window.console) console.warn('[cco-cust-v10] interaktion:', e && e.message);
    }
  }

  function v10Num(s) {
    var n = parseInt(String(s == null ? '' : s).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  function v10Group(n) {
    // 1247 -> "1 247" (svensk tusentalsavgränsare med hårt mellanslag i facit)
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Uppgradera räknarna mot riktig kund-data där den finns. Allt är best-effort:
  // i offline/oautentiserat läge (404/501) faller vi tyst tillbaka på facit-demo.
  async function populateV10Real(root) {
    try {
      var res = await fetch('/api/v1/cco/customers/state', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res || !res.ok) return;
      var payload = await res.json().catch(function () {
        return null;
      });
      if (!payload) return;
      var overview =
        (payload.portalRuntime && payload.portalRuntime.ownerOverview) ||
        payload.ownerOverview ||
        null;
      var list =
        (overview && Array.isArray(overview.customers) && overview.customers) ||
        (Array.isArray(payload.customers) && payload.customers) ||
        [];
      var total = v10Num(overview && overview.customerCount) || list.length;
      if (total > 0) {
        var title = root.querySelector('.page-title');
        if (title) title.textContent = v10Group(total);
        var allChip = root.querySelector('.filter-chip.active .count');
        if (allChip) allChip.textContent = v10Group(total);
      }
    } catch (e) {
      if (window.console) console.warn('[cco-cust-v10] data:', e && e.message);
    }
  }

  function mountPoint() {
    return (
      document.querySelector(
        '.preview-canvas[data-app-shell-view="customers"] .preview-workspace'
      ) || document.querySelector('.preview-workspace')
    );
  }

  function render(ctx) {
    var host = mountPoint();
    if (!host) return null;
    var root = document.getElementById('cco-cust-v10-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cco-cust-v10-root';
      host.appendChild(root);
    }
    root.innerHTML = MARKUP;
    initV10Interactions();
    populateV10Real(root);
    return root;
  }

  window.ArcanaCustomersV10 = { render: render };

  // ── Self-mount boot ────────────────────────────────────────────────────
  function flagOn() {
    return document.documentElement.getAttribute('data-customers-v10') === 'on';
  }
  function maybeMount() {
    if (!flagOn()) return;
    if (!document.querySelector('.preview-canvas[data-app-shell-view="customers"]')) return;
    if (window.innerWidth > 834) return; // bara mobil/iPad-stående; desktop = legacy-kundvy
    if (document.getElementById('cco-cust-v10-root')) return;
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
