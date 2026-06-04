/* eslint-env browser */
/**
 * v9 Kunder mockdata — 1:1 från uploads/CCO-Kunder-Mockup-v9-DESKTOP.html
 * Används av cco-kunder-real.js när ingen API-session (demo / sid-vid-sida mot :8765).
 */
(function (global) {
  'use strict';

  const CUSTOMER_ROWS = [
    {
      name: 'Anna Karlsson',
      init: 'AK',
      bg: 'linear-gradient(180deg,#d8c1f0,#b48ad6)',
      email: 'contact@…',
      source: 'contact',
      phone: '0704-12 34 56',
      state: 'vip',
      stateLabel: 'VIP',
      lastVisit: '5 maj 2026',
      lastSub: 'PRP 3/6 · Egzona',
      revenue: '38 400 kr',
      trend: '+18% YTD',
      trendUp: true,
      ai: 'Boka 5:e PRP ~12 jun · friskförs. saknas',
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
      email: 'info@…',
      source: 'info',
      phone: '0708-55 12 33',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '12 apr 2026',
      lastSub: 'Konsultation · Fazli',
      revenue: '14 200 kr',
      trend: '+ny',
      trendUp: true,
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
      email: 'egzona@…',
      source: 'egzona',
      phone: '0709-44 22 11',
      state: 'risk',
      stateLabel: 'Risk',
      lastVisit: '14 mar 2026',
      lastSub: 'No-show (3:e)',
      revenue: '4 800 kr',
      trend: '−2 besök',
      trendUp: false,
      ai: 'Begär 50% deposition vid nästa bokning',
      tags: [{ kind: 'risk', label: '!! No-show ×3' }],
    },
    {
      name: 'Sofie Andersson',
      init: 'SA',
      bg: 'linear-gradient(180deg,#ffe3b8,#e8a04e)',
      email: 'contact@…',
      source: 'contact',
      phone: '0707-89 22 14',
      state: 'new',
      stateLabel: 'Ny',
      lastVisit: '—',
      lastSub: 'På väntelistan',
      revenue: '0 kr',
      trend: 'Ny denna v.',
      trendUp: true,
      ai: 'Matchar Maria-luckan 14:30 idag → ring nu',
      tags: [
        { kind: 'new', label: 'Ny' },
        { kind: 'ready', label: '★ Match 92%' },
      ],
    },
    {
      name: 'Marcus Berg',
      init: 'MB',
      bg: 'linear-gradient(180deg,#b8d4e8,#7aa8d4)',
      email: 'info@…',
      source: 'info',
      phone: '0703-15 88 92',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '8 feb 2026',
      lastSub: 'PRP-paus',
      revenue: '18 600 kr',
      trend: '+3%',
      trendUp: true,
      ai: 'PRP återbesök väntar — föreslå tis 09:00',
      tags: [{ kind: 'cycle', label: 'PRP 3/6' }],
    },
    {
      name: 'Eva Johansson',
      init: 'EJ',
      bg: 'linear-gradient(180deg,#ffd4b5,#f0a070)',
      email: 'egzona@…',
      source: 'egzona',
      phone: '0706-77 31 09',
      state: 'new',
      stateLabel: 'Ny',
      lastVisit: '—',
      lastSub: 'Microneedling-förfrågan',
      revenue: '0 kr',
      trend: 'Ny idag',
      trendUp: true,
      ai: 'Boka konsultation · uppgrad → microneedling-paket?',
      tags: [{ kind: 'new', label: 'Ny' }],
    },
    {
      name: 'Anna Larsson',
      init: 'AL',
      bg: 'linear-gradient(180deg,#e8d4ff,#b894e8)',
      email: 'fazli@…',
      source: 'fazli',
      phone: '0705-90 14 23',
      state: 'vip',
      stateLabel: 'VIP',
      lastVisit: '23 jan 2026',
      lastSub: 'DHI konsultation',
      revenue: '52 800 kr',
      trend: '+22%',
      trendUp: true,
      ai: 'Tystnad 60+ dagar — outreach via Svarstudio?',
      tags: [
        { kind: 'vip', label: 'VIP' },
        { kind: 'risk', label: 'Tyst 65d' },
      ],
    },
    {
      name: 'Erik Nordström',
      init: 'EN',
      bg: 'linear-gradient(180deg,#f4e8c8,#d4b870)',
      email: 'contact@…',
      source: 'contact',
      phone: '0706-22 18 14',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '2 maj 2026',
      lastSub: 'PRP 4/6 · Egzona',
      revenue: '24 400 kr',
      trend: '+stabilt',
      trendUp: true,
      ai: 'PRP 5/6 om ~3v · boka tis 14:00?',
      tags: [
        { kind: 'cycle', label: 'PRP 4/6' },
        { kind: 'ready', label: '✓ Redo' },
      ],
    },
    {
      name: 'Lisa Holm',
      init: 'LH',
      bg: 'linear-gradient(180deg,#c8e8e0,#88c8b8)',
      email: 'info@…',
      source: 'info',
      phone: '0708-44 19 67',
      state: 'new',
      stateLabel: 'Ny',
      lastVisit: '—',
      lastSub: 'Väntar bekräftelse',
      revenue: '0 kr',
      trend: 'Ny i v.21',
      trendUp: true,
      ai: 'Skicka välkomstmejl + boka konsultation',
      tags: [{ kind: 'new', label: 'Ny' }],
    },
    {
      name: 'Maria Larsson',
      init: 'ML',
      bg: 'linear-gradient(180deg,#f0c8c8,#d48484)',
      email: 'contact@…',
      source: 'contact',
      phone: '0707-32 91 02',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '18 apr 2026',
      lastSub: 'Avbokade tor 28',
      revenue: '8 600 kr',
      trend: 'Stabilt',
      trendUp: true,
      ai: 'Föreslå ny tid — fre 14:00 ledig',
      tags: [],
    },
    {
      name: 'Sara Pettersson',
      init: 'SP',
      bg: 'linear-gradient(180deg,#f0c8c8,#d48484)',
      email: 'egzona@…',
      source: 'egzona',
      phone: '0703-67 22 89',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '17 maj 2026',
      lastSub: 'PRP 2/6',
      revenue: '12 800 kr',
      trend: '+10%',
      trendUp: true,
      ai: 'Saknar samtycke inför ons 27 — påminn nu',
      tags: [
        { kind: 'cycle', label: 'PRP 2/6' },
        { kind: 'risk', label: '⚠ Samtycke' },
      ],
    },
    {
      name: 'Johan Svensson',
      init: 'JS',
      bg: 'linear-gradient(180deg,#d4d4d4,#a8a8a8)',
      email: 'info@…',
      source: 'info',
      phone: '0702-19 84 55',
      state: 'active',
      stateLabel: 'Aktiv',
      lastVisit: '14 maj 2026',
      lastSub: 'Återbesök · Clara',
      revenue: '6 200 kr',
      trend: '+ny',
      trendUp: true,
      ai: 'Återbesök idag 16:00 · ✓ Redo',
      tags: [{ kind: 'ready', label: 'Idag 16:00' }],
    },
    {
      name: 'Petter Gustafsson',
      init: 'PG',
      bg: 'linear-gradient(180deg,#d0c8f0,#9a8ad8)',
      email: 'fazli@…',
      source: 'fazli',
      phone: '0705-66 19 44',
      state: 'dormant',
      stateLabel: 'Dormant',
      lastVisit: '14 nov 2025',
      lastSub: 'DHI komplett',
      revenue: '42 800 kr',
      trend: '−6m tystnad',
      trendUp: false,
      ai: 'Skicka årsuppföljning + check-in?',
      tags: [{ kind: 'vip', label: 'VIP' }],
    },
  ];

  const SEARCH_CUSTOMERS = [
    {
      name: 'Anna Karlsson',
      init: 'AK',
      bg: 'linear-gradient(180deg, #d8c1f0, #b48ad6)',
      sub: 'Återkommande · PRP återbesök tor 28 · 92%',
      badges: [
        { kind: 'risk', label: '⚠ Friskförs.' },
        { kind: 'upcoming', label: 'Tor 28' },
      ],
    },
    {
      name: 'Karl Lindberg',
      init: 'KL',
      bg: 'linear-gradient(180deg, #c5d8a8, #92b86e)',
      sub: 'DHI ögonbryn tor 28 · 09:00–13:00',
      badges: [
        { kind: 'upcoming', label: 'Tor 28' },
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

  const DOSSIER_BY_NAME = {
    'Anna Karlsson': {
      init: 'AK',
      bg: 'linear-gradient(180deg, #d8c1f0, #b48ad6)',
      contact: 'contact@hairtpclinic · 0704-12 34 56',
      tags: [
        { kind: 'vip', label: '★ VIP' },
        { kind: 'lifecycle', label: 'PRP-kur 4/6' },
        { kind: 'engagement', label: '92% engagement' },
        { kind: 'risk', label: '⚠ Friskförs. saknas' },
      ],
      stats: [
        { label: 'Besök', value: '12', trend: '+3 i år' },
        { label: 'Intäkt', value: '38 400 kr', trend: '+18% YTD' },
        { label: 'No-shows', value: '0', trend: 'Klockren' },
      ],
      upcoming: [
        {
          source: 'contact',
          day: 'TOR',
          num: '28',
          mon: 'MAJ',
          title: 'PRP för hår',
          sub: '08:00 · 45 min · Egzona',
          state: 'warn',
          stateLabel: '⚠ Friskförs.',
        },
        {
          source: 'contact',
          day: 'TIS',
          num: '18',
          mon: 'JUN',
          title: 'PRP för hår',
          sub: '14:30 · 45 min · Egzona',
          state: 'ready',
          stateLabel: '✓ Redo',
        },
      ],
      history: [
        {
          source: 'contact',
          day: 'TIS',
          num: '5',
          mon: 'MAJ',
          title: 'PRP 3/6',
          sub: 'Egzona · 45 min',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -3,
        },
        {
          source: 'contact',
          day: 'TIS',
          num: '14',
          mon: 'APR',
          title: 'PRP 2/6',
          sub: 'Egzona · 45 min',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -6,
        },
        {
          source: 'contact',
          day: 'TIS',
          num: '24',
          mon: 'MAR',
          title: 'PRP 1/6',
          sub: 'Egzona · 45 min',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -7,
        },
        {
          source: 'info',
          day: 'ONS',
          num: '11',
          mon: 'FEB',
          title: 'Konsultation',
          sub: 'Egzona · 30 min',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -7,
        },
        {
          source: 'contact',
          day: 'TIS',
          num: '14',
          mon: 'JAN',
          title: 'Provkonsult',
          sub: 'Fazli · 60 min',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -7,
        },
      ],
      files: [
        { icon: '📋', name: 'Hälsodekl', badge: '2026' },
        { icon: '✍️', name: 'Samtycke', badge: 'OK' },
        { icon: '📄', name: 'Avtal' },
        { icon: '🖼️', name: 'Före-bild', badge: '4' },
        { icon: '🖼️', name: 'Efter-bild', badge: '2' },
        { icon: '📝', name: 'Protokoll' },
      ],
      notes: [
        {
          text: 'Bra svar på behandling 3, fortsätt med 4. Inga biverkningar.',
          meta: 'Egzona · 5 maj 2026',
        },
        {
          text: 'Kund är väldigt motiverad och följer eftervård exakt.',
          meta: 'Egzona · 14 apr 2026',
        },
        { text: 'Pratade om VIP+ uppgradering — låter intresserad.', meta: 'Fazli · 11 feb 2026' },
      ],
      comm: [
        {
          type: 'mail',
          text: 'Re: PRP-bekräftelse fre 28 maj',
          meta: 'contact-tråden · 2 dagar sedan · ✓ läst',
        },
        {
          type: 'sms',
          text: 'Påminnelse skickad: PRP idag kl 08',
          meta: '5 maj 07:00 · ✓ läst 07:14',
        },
        {
          type: 'call',
          text: 'Bekräftade nästa tid över telefon',
          meta: 'Fazli · 12 mar · 15 min',
        },
        {
          type: 'mail',
          text: 'Frågor om eftervård efter PRP 2',
          meta: 'contact-tråden · 17 apr · ✓ besvarad',
        },
      ],
      economy: [
        { label: 'Total intäkt', value: '38 400 kr' },
        { label: 'Utestående', value: '0 kr' },
        { label: 'Snitt/besök', value: '6 400 kr' },
        { label: 'Livstidsvärde', value: '~58 000 kr' },
      ],
      insights: [
        {
          text: 'Kund är på <strong>4/6 i PRP-kur</strong> — föreslå 5:e ~3 veckor från 5 maj (omkring <strong>12 juni</strong>).',
          action: 'suggestPRPSlot',
        },
        {
          text: 'Bokar <strong>oftast tor 08:00</strong> (4 av senaste 5) — denna slot träffar perfekt om du vill boka in extra.',
          action: null,
        },
        {
          text: 'Engagemang sjunker svagt (96% → 92% på 3 mån). <strong>Skicka personligt mejl?</strong>',
          action: null,
        },
        {
          text: 'Värd att uppgradera till <strong>VIP+</strong> — total omsättning passerar 35 000 kr-tröskeln.',
          action: null,
        },
      ],
    },
  };

  const segmentTotals = {
    all: 1247,
    mine: 186,
    today_visits: 12,
    this_week: 47,
    waitlist: 23,
    treatment_dhi: 142,
    treatment_prp: 389,
    treatment_microneedling: 98,
    treatment_consultation: 618,
    vip: 234,
    needs_review: 12,
    risk: 12,
    new: 89,
    dormant: 456,
    active: 87,
    missing_health_declaration: 28,
    alla: 1247,
    aktiva: 87,
    nya: 89,
    'saknar-hd': 28,
  };

  const aggInsights = {
    idag: '<strong>3 kunder</strong> behöver kontakt: Anna (friskförs.), Karl (betalt halvt), Eva (no-show-risk)',
    opp: '<strong>5 VIP-kunder</strong> har inte bokat på 60+ dagar — föreslå outreach via Svarstudio',
    trend: 'Snittbesök-värde upp <strong>+8% Q2</strong>. Mest p.g.a. fler kompletta PRP-kurer.',
    risk: '<strong>28 kunder</strong> har bokningar inom 3 dagar men saknar formulär',
  };

  const statusBarHtml = `
        <span class="status-pill status-pill--success"><span class="dot"></span>87 aktiva i maj</span>
        <span class="status-pill" style="color:var(--accent-studio);background:linear-gradient(180deg, var(--rose-pill-top), var(--rose-pill-bottom));border-color:rgba(187,71,121,.32)"><span class="dot" style="background:var(--accent-studio)"></span>234 VIP</span>
        <span class="status-pill status-pill--warning"><span class="dot"></span>12 risk</span>
        <span class="status-pill status-pill--info"><span class="dot"></span>89 nya / 30 dagar</span>
        <span class="status-pill"><span class="dot" style="background:var(--cco-text-tertiary)"></span>456 dormant</span>
        <span class="spacer"></span>
        <span class="status-pill" style="color:var(--cco-text-tertiary)">Snitt LTV: 24 800 kr</span>`;

  const rightPanelHtml = `
    <div class="agg-shell">
      <div>
        <div class="agg-kicker">Översikt</div>
        <h3 class="agg-title">Kundpopulation</h3>
      </div>
      <div class="agg-stat-grid">
        <div class="agg-stat">
          <div class="agg-stat-label">Totalt</div>
          <div class="agg-stat-value">1 247</div>
          <div class="agg-stat-trend">+89 / 30 dagar</div>
        </div>
        <div class="agg-stat">
          <div class="agg-stat-label">Aktiva</div>
          <div class="agg-stat-value">87</div>
          <div class="agg-stat-trend">+12% MoM</div>
        </div>
        <div class="agg-stat">
          <div class="agg-stat-label">VIP</div>
          <div class="agg-stat-value">234</div>
          <div class="agg-stat-trend">+5 i månaden</div>
        </div>
        <div class="agg-stat">
          <div class="agg-stat-label">Snitt LTV</div>
          <div class="agg-stat-value">24,8k</div>
          <div class="agg-stat-trend">+8% Q2</div>
        </div>
      </div>
      <div class="agg-chart">
        <div class="agg-chart-head">
          <span class="agg-chart-title">Intäkt / vecka</span>
          <span class="agg-chart-value">485 200 kr</span>
        </div>
        <div class="agg-chart-bars">
          <div class="agg-chart-bar" style="height:45%"></div>
          <div class="agg-chart-bar" style="height:62%"></div>
          <div class="agg-chart-bar" style="height:78%"></div>
          <div class="agg-chart-bar" style="height:55%"></div>
          <div class="agg-chart-bar" style="height:88%"></div>
          <div class="agg-chart-bar" style="height:72%"></div>
          <div class="agg-chart-bar" style="height:94%"></div>
          <div class="agg-chart-bar" style="height:68%"></div>
          <div class="agg-chart-bar" style="height:82%"></div>
          <div class="agg-chart-bar" style="height:76%"></div>
          <div class="agg-chart-bar" style="height:91%"></div>
          <div class="agg-chart-bar current" style="height:86%"></div>
        </div>
        <div class="agg-chart-x"><span>v.10</span><span>v.15</span><span>v.22</span></div>
      </div>
      <div>
        <div class="agg-kicker">★ AI · Veckans insikter</div>
      </div>
      <div class="agg-ai-list">
        <div class="agg-ai-row"><strong>5 VIP</strong> har inte bokat på 60+ dagar — Anna L., Erik N., Sofia W., Petter G., Marie B.</div>
        <div class="agg-ai-row"><strong>28 kunder</strong> har bokningar inom 3 dagar men saknar formulär. <strong>Anna K.</strong> är högst prio.</div>
        <div class="agg-ai-row">PRP-kurer ger nu <strong>+34% återbesök</strong> vs konsultationer.</div>
        <div class="agg-ai-row"><strong>89 nya kunder</strong> senaste 30 dagarna. <strong>contact@</strong> är toppkanal (62%).</div>
        <div class="agg-ai-row"><strong>Eva K.</strong> har 3 no-shows — AI föreslår 50% deposition vid nästa bokning.</div>
        <div class="agg-ai-row">Genomsnittsbesök-värde <strong>upp 8%</strong> Q2. Drivare: fler kompletta PRP-kurer.</div>
      </div>
      <div class="agg-actions">
        <button type="button" class="quick-pill quick-pill--ai" disabled title="Demo · ej kopplat">★ Skicka mass-påminnelse (28)</button>
        <button type="button" class="quick-pill" disabled title="Demo · ej kopplat">↓ Exportera urval</button>
      </div>
    </div>`;

  function slug(name) {
    return 'mock-' + String(name).toLowerCase().replace(/\s+/g, '-');
  }

  function rowHtml(c) {
    const pid = slug(c.name);
    return `
    <div class="customer-row" data-patient-id="${pid}" data-mock-name="${c.name}">
      <span class="cr-avatar" style="background:${c.bg}">${c.init}</span>
      <div>
        <div class="cr-name">${c.name}</div>
        ${c.tags.length ? `<div class="cr-name-tags">${c.tags.map((t) => `<span class="cr-tag cr-tag--${t.kind}">${t.label}</span>`).join('')}</div>` : ''}
      </div>
      <div class="cr-meta">
        <div>${c.email}</div>
        <div class="cr-meta-sub">${c.phone}</div>
      </div>
      <div><span class="cr-status" data-state="${c.state}"><span class="dot"></span>${c.stateLabel}</span></div>
      <div class="cr-meta">
        <div class="cr-meta-strong">${c.lastVisit}</div>
        <div class="cr-meta-sub">${c.lastSub}</div>
      </div>
      <div>
        <div class="cr-revenue">${c.revenue}</div>
        <div class="cr-revenue-trend ${c.trendUp ? 'up' : 'down'}">${c.trend}</div>
      </div>
      <div><div class="cr-ai">${c.ai}</div></div>
      <div class="cr-arrow">›</div>
    </div>`;
  }

  function getDossier(name) {
    if (DOSSIER_BY_NAME[name]) return DOSSIER_BY_NAME[name];
    const customer =
      SEARCH_CUSTOMERS.find((c) => c.name === name) || CUSTOMER_ROWS.find((c) => c.name === name);
    const init = customer?.init || '??';
    const bg = customer?.bg || 'linear-gradient(180deg, #d4d4d4, #a8a8a8)';
    return {
      init,
      bg,
      contact: `${String(name).toLowerCase().replace(/\s/g, '.')}@email.se · 070-XXX XX XX`,
      tags: [
        { kind: 'lifecycle', label: 'Återkommande' },
        { kind: 'engagement', label: '88%' },
      ],
      stats: [
        { label: 'Besök', value: '3', trend: 'Pågående' },
        { label: 'Intäkt', value: '11 200 kr', trend: '+stabilt' },
        { label: 'No-shows', value: '0', trend: 'OK' },
      ],
      upcoming: [],
      history: [
        {
          source: 'info',
          day: 'TIS',
          num: '5',
          mon: 'MAJ',
          title: 'Senaste besök',
          sub: 'Konsultation',
          state: 'done',
          stateLabel: 'Klar',
          historyWeek: -3,
        },
      ],
      files: [
        { icon: '📋', name: 'Hälsodekl', badge: 'OK' },
        { icon: '📄', name: 'Avtal' },
      ],
      notes: [
        {
          text: 'Begränsad info i mockup. I produktion: alla anteckningar härifrån.',
          meta: 'System',
        },
      ],
      comm: [{ type: 'mail', text: 'Senaste mejl', meta: 'för 3 dagar sedan' }],
      economy: [
        { label: 'Total intäkt', value: '11 200 kr' },
        { label: 'Utestående', value: '0 kr' },
      ],
      insights: [{ text: 'Föreslå nästa besök inom 2–4 veckor.', action: null }],
    };
  }

  function buildDossierHtml(name) {
    const d = getDossier(name);
    return `
    <div class="dossier-head">
      <div class="dossier-avatar" style="background:${d.bg}">${d.init}</div>
      <div class="dossier-head-body">
        <div class="dossier-kicker">★ Kunddossiér</div>
        <div class="dossier-name">${name}</div>
        <div class="dossier-contact">${d.contact}</div>
        <div class="dossier-tags">
          ${d.tags.map((t) => `<span class="dossier-tag dossier-tag--${t.kind}">${t.label}</span>`).join('')}
        </div>
      </div>
      <button type="button" class="dossier-close" id="dossierClose" title="Stäng dossiér">×</button>
    </div>
    <div class="dossier-stats">
      ${d.stats.map((s) => `<div class="dossier-stat"><div class="dossier-stat-label">${s.label}</div><div class="dossier-stat-value">${s.value}</div><div class="dossier-stat-trend">${s.trend}</div></div>`).join('')}
    </div>
    <div class="dossier-scroll">
      ${d.upcoming.length ? `<details class="dossier-section" open><summary>Kommande bokningar <span class="count">${d.upcoming.length}</span></summary>${d.upcoming.map((b) => `<div class="dossier-booking" data-source="${b.source}"><div class="db-date"><div class="day">${b.day}</div><div class="num">${b.num}</div><div class="mon">${b.mon}</div></div><div class="db-meta"><div class="db-title">${b.title}</div><div class="db-sub">${b.sub}</div></div><span class="db-status" data-state="${b.state}">${b.stateLabel}</span></div>`).join('')}</details>` : ''}
      <details class="dossier-section"><summary>Historik <span class="count">${d.history.length}</span></summary>${d.history.map((b) => `<div class="dossier-booking" data-source="${b.source}"><div class="db-date"><div class="day">${b.day}</div><div class="num">${b.num}</div><div class="mon">${b.mon}</div></div><div class="db-meta"><div class="db-title">${b.title}</div><div class="db-sub">${b.sub}</div></div><span class="db-status" data-state="${b.state}">${b.stateLabel}</span></div>`).join('')}</details>
      <details class="dossier-section"><summary>Filer <span class="count">${d.files.length}</span></summary><div class="dossier-files">${d.files.map((f) => `<div class="dossier-file"><div class="dossier-file-icon">${f.icon}</div><div class="dossier-file-name">${f.name}</div>${f.badge ? `<span class="dossier-file-badge">${f.badge}</span>` : ''}</div>`).join('')}</div></details>
      <details class="dossier-section"><summary>Anteckningar <span class="count">${d.notes.length}</span></summary>${d.notes.map((n) => `<div class="dossier-note">${n.text}<div class="dossier-note-meta">${n.meta}</div></div>`).join('')}</details>
      <details class="dossier-section"><summary>Kommunikation <span class="count">${d.comm.length}</span></summary>${d.comm.map((c) => `<div class="dossier-comm"><div class="dossier-comm-icon" data-type="${c.type}">${c.type === 'mail' ? '✉' : c.type === 'sms' ? '💬' : '📞'}</div><div class="dossier-comm-body"><div class="dossier-comm-text">${c.text}</div><div class="dossier-comm-meta">${c.meta}</div></div></div>`).join('')}</details>
      <details class="dossier-section"><summary>Ekonomi <span class="count">${d.economy.length}</span></summary><div class="dossier-economy">${d.economy.map((m) => `<div class="dossier-money"><div class="dossier-money-label">${m.label}</div><div class="dossier-money-value">${m.value}</div></div>`).join('')}</div></details>
      <details class="dossier-section" open><summary>AI-insikter <span class="count">${d.insights.length}</span></summary>${d.insights.map((ins) => `<div class="dossier-insight">${ins.text}</div>`).join('')}</details>
    </div>
    <div class="dossier-actions">
      <button type="button" class="quick-pill quick-pill--ai full" disabled title="Demo">★ Boka nästa PRP</button>
      <button type="button" class="quick-pill" disabled title="Demo">✎ Anteckna</button>
      <button type="button" class="quick-pill" disabled title="Demo">✉ Svarstudio</button>
    </div>
    <p class="kunder-data-missing" style="padding:8px 14px;font-size:10px">Demo · v9 mockdossiér — logga in för live journal/API.</p>`;
  }

  function patientFromRow(row) {
    return {
      patientId: slug(row.name),
      displayName: row.name,
      primaryEmail: row.email,
      primaryPhone: row.phone,
      matchStatus: 'matched',
      _mockSeed: true,
      _mockName: row.name,
      _seedRow: row,
      isVip: row.state === 'vip',
      flags: row.state === 'risk' ? ['needs_review'] : [],
    };
  }

  global.CcoKunderV9MockSeed = {
    source: 'uploads/CCO-Kunder-Mockup-v9-DESKTOP.html',
    totalPatients: 1247,
    segmentTotals,
    aggInsights,
    statusBarHtml,
    rightPanelHtml,
    customerRows: CUSTOMER_ROWS,
    searchCustomers: SEARCH_CUSTOMERS,
    rowHtml,
    buildDossierHtml,
    patientFromRow,
    slug,
  };
})(globalThis);
