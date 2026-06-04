/**
 * P0.4 — Kunder + kalender/bokning (customers-shell booking enrichment)
 */
(function (global) {
  'use strict';

  const PAGE_SIZE = 60;
  const SEARCH_PAGE_SIZE = 40;
  const TENANT_ID = 'hairtpclinic';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const LOGIN_HREF = '/major-arcana-preview/index.html';

  const MATCH_LABELS = {
    matched: 'Kopplad',
    cliento_only: 'Cliento',
    drive_only: 'Drive',
    needs_review: 'Granska',
    web_booking: 'Webbokning',
    unmatched: 'Ny i Arcana',
  };

  /** UI placement; enable/disable comes from API segmentStats. */
  const SEGMENT_UI = [
    { id: 'all', side: true, chip: 'alla' },
    { id: 'mine', side: true },
    { id: 'today_visits', side: true },
    { id: 'this_week', side: true },
    { id: 'waitlist', side: true },
    { id: 'treatment_fue', side: true, treatment: true },
    { id: 'treatment_dhi', side: true, treatment: true },
    { id: 'treatment_prp', side: true, treatment: true },
    { id: 'treatment_microneedling', side: true, treatment: true },
    { id: 'treatment_consultation', side: true, treatment: true },
    { id: 'treatment_followup', side: true, treatment: true },
    { id: 'treatment_curatiio', side: true, treatment: true },
    { id: 'active', chip: 'aktiva' },
    { id: 'vip', chip: 'vip' },
    { id: 'risk', chip: 'risk' },
    { id: 'new', chip: 'nya' },
    { id: 'dormant', chip: 'dormant' },
    { id: 'missing_health_declaration', chip: 'saknar-hd', side: true },
    { id: 'missing_journal', side: true },
    { id: 'missing_encounter' },
    { id: 'needs_review', side: true },
    { id: 'has_drive', side: true },
    { id: 'has_drive_journal' },
    { id: 'has_drive_document' },
    { id: 'drive_only', side: true },
    { id: 'cliento_only', side: true },
    { id: 'duplicate_email', side: true },
    { id: 'getaccept' },
    { id: 'halso' },
    { id: 'photos_review' },
    { id: 'has_images' },
    { id: 'import_review' },
  ];
  const SEGMENT_UI_BY_ID = Object.fromEntries(SEGMENT_UI.map((s) => [s.id, s]));

  function mergeSegmentsFromApi(apiSegments) {
    const list = Array.isArray(apiSegments) ? apiSegments : [];
    return list.map((seg) => {
      const ui = SEGMENT_UI_BY_ID[seg.id] || {};
      const fq = seg.filterQuery || {};
      const disabled = seg.status === 'disabled' || seg.status === 'missing';
      return {
        id: seg.id,
        label: seg.label || seg.id,
        flags: fq.flags || '',
        segment: fq.segment || '',
        disabled,
        disabledReason: seg.reason || (disabled ? 'Data saknas' : ''),
        side: Boolean(ui.side),
        chip: ui.chip,
        count: seg.count,
        status: seg.status,
      };
    });
  }

  let SEGMENTS = mergeSegmentsFromApi([]);
  let SEGMENT_BY_ID = {};

  const state = {
    query: '',
    flagFilter: '',
    activeSegmentId: 'all',
    offset: 0,
    total: 0,
    patients: [],
    stats: null,
    segmentStats: null,
    segmentTotals: {},
    loading: false,
    loaded: false,
    authRequired: false,
    error: '',
    selectedPatientId: '',
    staffOwnership: null,
    mockupSeed: false,
  };

  function isKunderPage() {
    return /\/kunder\.html$/i.test(location.pathname || '');
  }

  /** Default on /kunder.html = same v9 chrome + mockdata as :8765/CCO-Kunder-Mockup-v9-DESKTOP.html */
  function shouldUseMockupSeed() {
    const seed = global.CcoKunderV9MockSeed;
    if (!seed) return false;
    const q = new URLSearchParams(location.search);
    if (q.get('live') === '1') return false;
    try {
      if (localStorage.getItem('ARCANA_KUNDER_V9_SEED') === '0') return false;
    } catch {
      /* ignore */
    }
    if (q.get('v9seed') === '0') return false;
    if (q.get('v9seed') === '1') return true;
    if (isKunderPage()) return true;
    return !getToken();
  }

  function applyMockupSeed() {
    const seed = global.CcoKunderV9MockSeed;
    if (!seed) return false;
    state.mockupSeed = true;
    document.body.dataset.kunderDemo = '1';
    state.authRequired = false;
    state.loaded = true;
    state.error = '';
    state.stats = { totalPatients: seed.totalPatients, needsReview: 12, matched: 1100 };
    state.segmentTotals = { ...seed.segmentTotals };
    state.total = seed.customerRows.length;
    state.patients = seed.customerRows.map((row) => seed.patientFromRow(row));
    state.automation = { enabled: false, reason: 'demo-mockup' };
    return true;
  }

  function showDemoBanner() {
    let el = $('#kunder-auth-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kunder-auth-banner';
      el.className = 'kunder-auth-banner';
      const nav = $('.top-nav');
      if (nav) nav.insertAdjacentElement('afterend', el);
    }
    const liveLink = isKunderPage() ? ' <a href="?live=1">Live API-data</a>' : '';
    el.innerHTML = `
      <strong>v9 mockup</strong> — samma design som <code>CCO-Kunder-Mockup-v9-DESKTOP.html</code> (:8765).
      ${getToken() ? 'Inloggad med mockdata.' : `<a href="${LOGIN_HREF}">Logga in</a> för token.`}
      <span style="margin-left:8px;opacity:.85">?live=1 = API · ?v9seed=0 stänger mock</span>${liveLink}`;
  }

  function renderMockStatusBar() {
    const bar = $('.customers-shell .calendar-status-bar');
    const seed = global.CcoKunderV9MockSeed;
    if (bar && seed?.statusBarHtml) bar.innerHTML = seed.statusBarHtml;
  }

  /** v9 mockup chrome — status pills + agg-insight + toolbar (never story-cards / kopplade-bar). */
  function applyV9VisualChrome() {
    const seed = global.CcoKunderV9MockSeed;
    if (!seed || !$('#customerList')) return;

    document.body.classList.add('kunder-v9');
    renderMockStatusBar();

    const host = $('[data-kunder-agg-insights]');
    if (host && seed.aggInsights) {
      const a = seed.aggInsights;
      setAggInsightBody(host, 'idag', a.idag);
      setAggInsightBody(host, 'opp', a.opp);
      setAggInsightBody(host, 'trend', a.trend);
      setAggInsightBody(host, 'risk', a.risk);
    }

    const titleH2 = $('.customers-shell .calendar-toolbar-main h2');
    if (titleH2 && seed.totalPatients != null) {
      titleH2.textContent = `${Number(seed.totalPatients).toLocaleString('sv-SE')} kunder`;
    }
  }

  function renderV9StatusBarFromApi() {
    if (state.mockupSeed) {
      renderMockStatusBar();
      return;
    }
    const bar = $('.customers-shell .calendar-status-bar');
    if (!bar || !state.stats) {
      renderMockStatusBar();
      return;
    }
    const c = state.segmentTotals || {};
    const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('sv-SE'));
    const active = c.active;
    const vip = c.vip;
    const risk = c.needs_review ?? c.risk;
    const nya = c.new;
    const dormant = c.dormant;
    bar.innerHTML = `
        <span class="status-pill status-pill--success"><span class="dot"></span>${fmt(active)} aktiva</span>
        <span class="status-pill" style="color:var(--accent-studio);background:linear-gradient(180deg, var(--rose-pill-top), var(--rose-pill-bottom));border-color:rgba(187,71,121,.32)"><span class="dot" style="background:var(--accent-studio)"></span>${fmt(vip)} VIP</span>
        <span class="status-pill status-pill--warning"><span class="dot"></span>${fmt(risk)} risk</span>
        <span class="status-pill status-pill--info"><span class="dot"></span>${fmt(nya)} nya</span>
        <span class="status-pill"><span class="dot" style="background:var(--cco-text-tertiary)"></span>${fmt(dormant)} dormant</span>
        <span class="spacer"></span>
        <span class="status-pill" style="color:var(--cco-text-tertiary)">Intäkt/LTV: —</span>`;
  }

  function filterMockRows(rows) {
    const seg = state.activeSegmentId;
    const q = state.query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.phone.includes(q) ||
          r.lastSub.toLowerCase().includes(q) ||
          r.ai.toLowerCase().includes(q)
      );
    }
    if (seg === 'all' || seg === 'alla') return list;
    if (seg === 'vip') return list.filter((r) => r.state === 'vip');
    if (seg === 'risk' || seg === 'needs_review') return list.filter((r) => r.state === 'risk');
    if (seg === 'new' || seg === 'nya') return list.filter((r) => r.state === 'new');
    if (seg === 'dormant') return list.filter((r) => r.state === 'dormant');
    if (seg === 'active' || seg === 'aktiva') return list.filter((r) => r.state === 'active');
    if (seg === 'missing_health_declaration' || seg === 'saknar-hd') {
      return list.filter((r) => r.tags.some((t) => /friskförs|samtycke|formulär/i.test(t.label)));
    }
    if (seg === 'treatment_prp') return list.filter((r) => /prp/i.test(r.lastSub + r.ai));
    if (seg === 'treatment_dhi') return list.filter((r) => /dhi/i.test(r.lastSub + r.ai));
    if (seg === 'treatment_microneedling')
      return list.filter((r) => /microneedling/i.test(r.lastSub + r.ai));
    if (seg === 'treatment_consultation')
      return list.filter((r) => /konsultation/i.test(r.lastSub + r.ai));
    if (seg === 'waitlist') return list.filter((r) => /väntelista/i.test(r.lastSub));
    if (seg === 'today_visits')
      return list.filter((r) => /idag|imorgon|16:00/i.test(r.ai + r.lastSub));
    if (seg === 'this_week') return list.filter((r) => /tor|tis|ons|v\./i.test(r.ai + r.lastSub));
    if (seg === 'mine') return list.filter((r) => /fazli|clara/i.test(r.lastSub));
    return list;
  }

  function renderMockList() {
    const host = $('#customerList');
    const seed = global.CcoKunderV9MockSeed;
    if (!host || !seed) return;
    const rows = filterMockRows(seed.customerRows);
    state.total = rows.length;
    if (!rows.length) {
      setListStatus(state.query ? 'Inga kunder matchar filtret.' : 'Inga rader i demo.', 'info');
      return;
    }
    host.innerHTML = rows.map((r) => seed.rowHtml(r)).join('');
    host.querySelectorAll('.customer-row').forEach((row) => {
      row.addEventListener('click', () => {
        $$('.customer-row.selected').forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
        openMockDossier(row.dataset.mockName || row.dataset.patientId);
      });
    });
    const kicker = $('#searchPanelKicker');
    if (kicker) {
      kicker.textContent = state.query
        ? `${rows.length} träffar för "${state.query}"`
        : 'Senaste · 1 247 kunder totalt';
    }
  }

  function renderMockSearchPanel() {
    const seed = global.CcoKunderV9MockSeed;
    const searchPanelList = $('#searchPanelList');
    if (!seed || !searchPanelList) return;
    const ql = state.query.toLowerCase().trim();
    const filtered = ql
      ? seed.searchCustomers.filter(
          (c) => c.name.toLowerCase().includes(ql) || c.sub.toLowerCase().includes(ql)
        )
      : seed.searchCustomers;
    const kicker = $('#searchPanelKicker');
    if (kicker) {
      kicker.textContent = ql
        ? `${filtered.length} träffar för "${state.query}"`
        : 'Senaste · 1 247 kunder totalt';
    }
    if (!filtered.length) {
      searchPanelList.innerHTML = `<div class="search-empty">Ingen kund matchar "${escapeHtml(state.query)}"</div>`;
      return;
    }
    searchPanelList.innerHTML = filtered
      .map(
        (c, i) => `
        <div class="search-result ${i === 0 ? 'is-selected' : ''}" data-mock-name="${escapeHtml(c.name)}">
          <span class="search-avatar" style="background:${c.bg}">${escapeHtml(c.init)}</span>
          <div class="search-result-meta">
            <div class="search-result-name">${escapeHtml(c.name)}</div>
            <div class="search-result-sub">${escapeHtml(c.sub)}</div>
            ${c.badges.length ? `<div class="search-result-badges">${c.badges.map((b) => `<span class="search-badge search-badge--${b.kind}">${escapeHtml(b.label)}</span>`).join('')}</div>` : ''}
          </div>
          <span class="search-result-arrow">›</span>
        </div>`
      )
      .join('');
    searchPanelList.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('click', () => {
        closeSearch();
        openMockDossier(el.dataset.mockName);
      });
    });
  }

  function openMockDossier(nameOrSlug) {
    const seed = global.CcoKunderV9MockSeed;
    const intelShell = $('#intelShell');
    const intelCustomerView = $('#intelCustomerView');
    const breadcrumbSlot = $('#breadcrumbSlot');
    if (!seed || !intelShell || !intelCustomerView) return;
    let name = nameOrSlug;
    if (nameOrSlug.startsWith('mock-')) {
      const row = seed.customerRows.find((r) => seed.slug(r.name) === nameOrSlug);
      name = row?.name || nameOrSlug;
    }
    intelShell.dataset.context = 'customer';
    if (breadcrumbSlot) {
      breadcrumbSlot.innerHTML = `<span class="breadcrumb">Kunder › ${escapeHtml(name)}</span>`;
    }
    intelCustomerView.innerHTML = seed.buildDossierHtml(name);
    $('#dossierClose')?.addEventListener('click', closeDossier);
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getToken() {
    try {
      return (localStorage.getItem(TOKEN_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function getRole() {
    return 'staff';
  }

  function getAssignedOwner() {
    const resolved = global.CcoKunderStaffOwner?.resolveAssignedOwner({
      shellPayload: state.staffOwnership ? { staffOwnership: state.staffOwnership } : null,
    });
    return resolved?.value || '';
  }

  function shellQueryParams(limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(state.offset),
    });
    if (state.query) params.set('q', state.query);
    if (state.flagFilter) params.set('flags', state.flagFilter);
    const activeSeg = SEGMENT_BY_ID[state.activeSegmentId];
    if (activeSeg?.segment) params.set('segment', activeSeg.segment);
    const assignedOwner = getAssignedOwner();
    if (assignedOwner) params.set('assignedOwner', assignedOwner);
    params.set('includeAutomation', '1');
    return params;
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(new URL(path, window.location.origin), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });
    let payload = {};
    try {
      payload = await res.json();
    } catch {
      payload = {};
    }
    if (!res.ok) {
      const err = new Error(payload.error || `HTTP ${res.status}`);
      err.statusCode = res.status;
      throw err;
    }
    return payload;
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayName(card) {
    const name = (card.displayName || '').trim();
    if (!name) return 'Namn saknas';
    if (/\.(pdf|zip|jpe?g|png|heic|docx?)$/i.test(name) || /^[a-f0-9-]{20,}$/i.test(name)) {
      return 'Namn saknas';
    }
    return name;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('sv-SE', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  function bookingSubline(card) {
    if (card.hasUpcomingBooking && card.nextBookingAt) {
      const res = card.nextBookingResourceLabel ? ` · ${card.nextBookingResourceLabel}` : '';
      return `Nästa: ${formatDateTime(card.nextBookingAt)}${res}`;
    }
    if (card.onWaitlist) return `Väntelista: ${card.waitingListStatus || 'ärende'}`;
    if (card.lastVisitAt) return `Senast: ${formatDate(card.lastVisitAt)}`;
    return '—';
  }

  function rowState(card) {
    if (card.flags?.includes('needs_review') || card.matchStatus === 'needs_review') {
      return { state: 'risk', label: 'Granska' };
    }
    if (card.patientOrigin === 'new' || card.matchStatus === 'unmatched') {
      return { state: 'new', label: 'Ny' };
    }
    if (card.hasJournal || card.hasJournalHistory) {
      return { state: 'active', label: 'Aktiv' };
    }
    return { state: 'active', label: MATCH_LABELS[card.matchStatus] || 'Kund' };
  }

  function contactLine(card) {
    const email = card.emailMasked || card.primaryEmail || null;
    const phone = card.phoneMasked || card.primaryPhone || null;
    if (!email && !phone) return { main: 'Kontakt saknas', sub: '' };
    return { main: email || '—', sub: phone || '' };
  }

  function nextStepLabel(card) {
    if (global.CcoKunderSmartNextStep?.listStepLabel) {
      return global.CcoKunderSmartNextStep.listStepLabel(card);
    }
    if (card.nextStep) return card.nextStep;
    return '—';
  }

  function rowBadges(card) {
    const tags = [];
    if (card.reviewFlags?.includes('needs_review') || card.flags?.includes('needs_review')) {
      tags.push({ kind: 'risk', label: 'Granska' });
    }
    if (card.missingJournal) tags.push({ kind: 'risk', label: 'Saknar journal' });
    if (card.missingHealthDeclaration || card.missingForm) {
      tags.push({ kind: 'warn', label: 'Saknar hälsodeklaration' });
    }
    if (card.missingAgreement) tags.push({ kind: 'warn', label: 'Saknar avtal' });
    if (card.needsPhotoReview) tags.push({ kind: 'risk', label: 'Bild-review' });
    if (card.needsClassification) tags.push({ kind: 'risk', label: 'Klassificering' });
    if (card.hasGetAccept) tags.push({ kind: 'ready', label: 'GetAccept' });
    if (card.hasHalso) tags.push({ kind: 'ready', label: 'halso@' });
    if (card.isVip) tags.push({ kind: 'vip', label: 'VIP' });
    if (card.todayVisit) tags.push({ kind: 'ready', label: 'Idag' });
    if (card.onWaitlist) tags.push({ kind: 'warn', label: 'Väntelista' });
    if (card.missingEncounterForBooking) tags.push({ kind: 'risk', label: 'Saknar encounter' });
    if (card.readyForVisit === true) tags.push({ kind: 'ready', label: 'Redo besök' });
    if (card.driveLinked) tags.push({ kind: 'cycle', label: 'Drive' });
    if (card.clientoLinked) tags.push({ kind: 'ready', label: 'Cliento' });
    if (card.isMinePatient) tags.push({ kind: 'ready', label: 'Min kund' });
    else if (card.ownerName) tags.push({ kind: 'cycle', label: card.ownerName });
    return tags;
  }

  function showAuthBanner(show) {
    let el = $('#kunder-auth-banner');
    if (!show) {
      if (el) el.remove();
      return;
    }
    if (el) return;
    el = document.createElement('div');
    el.id = 'kunder-auth-banner';
    el.className = 'kunder-auth-banner';
    el.innerHTML = `
      <strong>Inloggning krävs</strong> för att läsa kundregister.
      <a href="${LOGIN_HREF}">Logga in i CCO</a> (samma token som Kunder i staff-vyn).
    `;
    const nav = $('.top-nav');
    if (nav) nav.insertAdjacentElement('afterend', el);
  }

  function setListStatus(msg, tone) {
    const host = $('#customerList');
    if (!host) return;
    if (!msg) return;
    host.innerHTML = `<div class="kunder-list-status kunder-list-status--${tone || 'info'}">${escapeHtml(msg)}</div>`;
  }

  async function fetchShell({ append = false } = {}) {
    if (shouldUseMockupSeed()) {
      applyMockupSeed();
      showDemoBanner();
      applyV9VisualChrome();
      renderCounts();
      renderInsights();
      renderRightPanel();
      renderList();
      return;
    }
    if (!getToken()) {
      state.mockupSeed = false;
      state.authRequired = true;
      showAuthBanner(true);
      setListStatus('Logga in för att hämta kunder från patient-master.', 'warn');
      applyV9VisualChrome();
      renderCounts();
      renderInsights();
      renderRightPanel();
      return;
    }
    state.mockupSeed = false;
    state.authRequired = false;
    showAuthBanner(false);
    if (state.loading) return;
    state.loading = true;
    state.error = '';
    if (!append) {
      state.offset = 0;
      state.patients = [];
    }
    setListStatus('Hämtar kunder…', 'loading');

    const limit = state.query ? SEARCH_PAGE_SIZE : PAGE_SIZE;
    const params = shellQueryParams(limit);
    try {
      const payload = await api(`/api/v1/cco/staff/customers-shell?${params}`);
      if (payload.staffOwnership) {
        state.staffOwnership = payload.staffOwnership;
        global.CcoKunderStaffOwner?.rememberShellOwnership?.(payload);
      }
      const batch = (payload.patients?.patients || []).filter(Boolean);
      state.stats = payload.stats || state.stats;
      if (payload.segmentStats) {
        state.segmentStats = payload.segmentStats;
        SEGMENTS = mergeSegmentsFromApi(payload.segmentStats.segments);
        SEGMENT_BY_ID = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
        const counts = payload.segmentStats.counts || {};
        state.segmentTotals = { ...counts, all: Number(state.stats?.totalPatients ?? counts.all) };
      }
      state.total = Number(payload.patients?.total ?? batch.length);
      state.patients = append ? state.patients.concat(batch) : batch;
      state.automation = payload.automation || null;
      state.loaded = true;
      state.offset = state.patients.length;
      if (state.activeSegmentId === 'mine' && !state.patients.length) {
        const mineMsg = global.CcoKunderStaffOwner?.mineSegmentMessage?.(payload);
        if (mineMsg) setListStatus(mineMsg, 'warn');
      }
    } catch (err) {
      state.error = err.message || 'Kunde inte hämta kunder';
      if (err.statusCode === 401 || err.statusCode === 403) {
        state.authRequired = true;
        showAuthBanner(true);
      }
      if (!append) state.patients = [];
    } finally {
      state.loading = false;
      refreshSegmentCounts();
      renderList();
      renderCounts();
      renderInsights();
      renderRightPanel();
      renderV9StatusBarFromApi();
    }
  }

  function refreshSegmentCounts() {
    if (state.segmentStats?.counts) {
      state.segmentTotals = {
        ...state.segmentStats.counts,
        all: Number(state.stats?.totalPatients ?? state.segmentStats.counts.all ?? 0),
      };
      state.segmentTotals.risk = state.segmentTotals.needs_review ?? state.segmentTotals.risk;
    }
    renderCounts();
    renderV9StatusBarFromApi();
  }

  function renderCounts() {
    const total = state.mockupSeed
      ? global.CcoKunderV9MockSeed?.totalPatients
      : state.stats?.totalPatients;
    const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('sv-SE'));

    const titleH2 = $('.customers-shell .calendar-toolbar-main h2');
    if (titleH2) {
      if (total != null) titleH2.textContent = `${fmt(total)} kunder`;
      else if (global.CcoKunderV9MockSeed?.totalPatients != null) {
        titleH2.textContent = `${fmt(global.CcoKunderV9MockSeed.totalPatients)} kunder`;
      } else if (state.authRequired) titleH2.textContent = 'Kunder';
      else titleH2.textContent = 'Kunder — data saknas';
    }

    $$('[data-kunder-count]').forEach((el) => {
      const key = el.dataset.kunderCount;
      if (key === 'total') el.textContent = fmt(total);
      else if (key === 'needs_review') el.textContent = fmt(state.stats?.needsReview);
      else if (key === 'matched') el.textContent = fmt(state.stats?.matched);
      else if (key === 'drive_only') el.textContent = fmt(state.stats?.driveOnly);
      else if (key === 'cliento_only') el.textContent = fmt(state.stats?.clientoOnly);
      else {
        const seg = SEGMENTS.find((s) => s.id === key);
        if (seg?.disabled) el.textContent = '—';
        else el.textContent = fmt(state.segmentTotals[key]);
      }
    });

    $$('.side-link[data-segment]').forEach((link) => {
      const id = link.dataset.segment;
      const countEl = link.querySelector('.count');
      if (!countEl) return;
      if (state.mockupSeed) {
        link.classList.remove('is-disabled');
        link.title = '';
        countEl.textContent = fmt(state.segmentTotals[id] ?? (id === 'all' ? total : null));
        return;
      }
      const seg = SEGMENTS.find((s) => s.id === id);
      if (seg?.disabled) {
        link.classList.add('is-disabled');
        link.title = seg.disabledReason || 'Kräver bokningsdata';
        countEl.textContent = '—';
      } else {
        link.classList.remove('is-disabled');
        link.title = seg.status === 'partial' ? seg.disabledReason || 'Partiell data' : '';
        countEl.textContent = fmt(state.segmentTotals[id] ?? (id === 'all' ? total : null));
      }
    });

    $$('.filter-chip[data-segment]').forEach((chip) => {
      const id = chip.dataset.segment;
      const countEl = chip.querySelector('.count');
      if (!countEl) return;
      if (state.mockupSeed) {
        chip.disabled = false;
        countEl.textContent = fmt(state.segmentTotals[id] ?? (id === 'alla' ? total : null));
        return;
      }
      const seg = SEGMENTS.find((s) => s.id === id);
      if (seg?.disabled) {
        chip.disabled = true;
        chip.title = seg.disabledReason || '';
        countEl.textContent = '—';
      } else {
        chip.disabled = false;
        countEl.textContent = fmt(state.segmentTotals[id] ?? (id === 'alla' ? total : null));
      }
    });
  }

  function renderList() {
    if (state.mockupSeed) {
      renderMockList();
      if ($('#searchOverlay')?.classList.contains('is-visible')) renderMockSearchPanel();
      return;
    }
    const host = $('#customerList');
    if (!host) return;
    if (state.error && !state.patients.length) {
      setListStatus(state.error, 'error');
      return;
    }
    const rows = state.patients;
    if (!rows.length) {
      setListStatus(state.loaded ? 'Inga kunder matchar filtret.' : '', 'info');
      return;
    }

    const seg = SEGMENT_BY_ID[state.activeSegmentId];
    const filterNote =
      seg && !seg.disabled
        ? `<div class="kunder-filter-note">Filter: ${escapeHtml(seg.label)} · ${rows.length.toLocaleString('sv-SE')} visade av ${Number(state.total).toLocaleString('sv-SE')}</div>`
        : state.query
          ? `<div class="kunder-filter-note">Sök: “${escapeHtml(state.query)}” · ${rows.length.toLocaleString('sv-SE')} träffar</div>`
          : '';

    host.innerHTML =
      filterNote +
      rows
        .map((card) => {
          const st = rowState(card);
          const tags = rowBadges(card);
          const contact = contactLine(card);
          const lastAt = card.lastVisitAt || card.updatedAt;
          const treatment =
            card.treatmentTypes?.length > 0
              ? card.treatmentTypes.join(', ')
              : card.nextBookingType || (card.hasJournal ? 'Journal' : '—');
          const bookingLine = bookingSubline(card);

          return `
    <div class="customer-row" data-patient-id="${escapeHtml(card.patientId)}" data-customer-id="${escapeHtml(card.patientId)}" title="Öppna kundkort">
      <span class="cr-avatar" style="background:linear-gradient(180deg,#e8d4ff,#b894e8)">${escapeHtml((displayName(card).slice(0, 2) || '??').toUpperCase())}</span>
      <div>
        <div class="cr-name">${escapeHtml(displayName(card))}</div>
        ${tags.length ? `<div class="cr-name-tags">${tags.map((t) => `<span class="cr-tag cr-tag--${t.kind}">${escapeHtml(t.label)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="cr-meta">
        <div>${escapeHtml(contact.main)}</div>
        <div class="cr-meta-sub">${escapeHtml(contact.sub || '—')}</div>
      </div>
      <div><span class="cr-status" data-state="${st.state}"><span class="dot"></span>${escapeHtml(st.label)}</span></div>
      <div class="cr-meta">
        <div class="cr-meta-strong">${formatDate(lastAt)}</div>
        <div class="cr-meta-sub">${escapeHtml(treatment)} · ${escapeHtml(bookingLine)}</div>
      </div>
      <div>
        <div class="cr-revenue kunder-revenue-disabled" title="Intäkt — data saknas">—</div>
      </div>
      <div><div class="cr-ai" data-rule-based="1" title="Regelbaserat nästa steg (ej AI)">${escapeHtml(nextStepLabel(card))}</div></div>
      <div class="cr-arrow">›</div>
    </div>`;
        })
        .join('');

    const hasMore = state.patients.length < state.total;
    if (hasMore || state.patients.length) {
      const wrap = document.createElement('div');
      wrap.className = 'kunder-load-more-wrap';
      wrap.innerHTML = `
        <span class="kunder-load-more-meta">${state.patients.length.toLocaleString('sv-SE')} av ${Number(state.total).toLocaleString('sv-SE')} kunder</span>
        ${
          hasMore
            ? `<button type="button" class="nav-btn" id="kunderLoadMore">Ladda fler</button>`
            : '<span class="kunder-load-more-done">Alla matchande kunder laddade</span>'
        }`;
      host.appendChild(wrap);
      $('#kunderLoadMore')?.addEventListener('click', () => fetchShell({ append: true }));
    }

    host.querySelectorAll('.customer-row').forEach((row) => {
      row.addEventListener('click', (ev) => {
        const rect = row.getBoundingClientRect();
        if (ev.clientX - rect.left <= 32 && row.dataset.patientId) {
          ev.preventDefault();
          ev.stopPropagation();
          row.classList.toggle('is-checked');
          return;
        }
        const pid = row.dataset.patientId;
        const card = state.patients.find((p) => p.patientId === pid);
        if (card) openDossier(card);
      });
    });

    const kicker = $('#searchPanelKicker');
    if (kicker) {
      kicker.textContent = state.stats
        ? `${Number(state.total).toLocaleString('sv-SE')} i vy · ${Number(state.stats.totalPatients).toLocaleString('sv-SE')} totalt`
        : 'Sök kunder';
    }
    if ($('#searchOverlay')?.classList.contains('is-visible')) {
      renderSearchPanel();
    }
  }

  function renderSearchPanel() {
    if (state.mockupSeed) {
      renderMockSearchPanel();
      return;
    }
    const searchPanelList = $('#searchPanelList');
    if (!searchPanelList) return;
    const filtered = state.patients.slice(0, 25);
    if (!filtered.length) {
      searchPanelList.innerHTML =
        '<div class="search-empty">Inga träffar i registret — prova namn, e-post, telefon eller patientId</div>';
      return;
    }
    searchPanelList.innerHTML = filtered
      .map(
        (card, i) => `
        <div class="search-result ${i === 0 ? 'is-selected' : ''}" data-patient-id="${escapeHtml(card.patientId)}">
          <div class="search-result-meta">
            <div class="search-result-name">${escapeHtml(displayName(card))}</div>
            <div class="search-result-sub">${escapeHtml(card.patientId)} · ${escapeHtml(contactLine(card).main)}</div>
          </div>
          <span class="search-result-arrow">›</span>
        </div>`
      )
      .join('');
    searchPanelList.querySelectorAll('.search-result').forEach((el) => {
      el.addEventListener('click', () => {
        const card = state.patients.find((p) => p.patientId === el.dataset.patientId);
        if (card) {
          closeSearch();
          openDossier(card);
        }
      });
    });
  }

  function openSearch() {
    const searchOverlay = $('#searchOverlay');
    if (!searchOverlay) return;
    searchOverlay.classList.add('is-visible');
    const searchOverlayInput = $('#searchOverlayInput');
    if (searchOverlayInput) {
      searchOverlayInput.value = state.query;
      setTimeout(() => searchOverlayInput.focus(), 50);
    }
    renderSearchPanel();
  }

  function closeSearch() {
    const searchOverlay = $('#searchOverlay');
    if (!searchOverlay) return;
    searchOverlay.classList.remove('is-visible');
    const searchOverlayInput = $('#searchOverlayInput');
    if (searchOverlayInput) searchOverlayInput.value = '';
    const globalSearchInput = $('#globalSearchInput');
    if (globalSearchInput) globalSearchInput.value = '';
    $('#globalSearch')?.classList.remove('is-focused');
  }

  function fmtStat(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString('sv-SE');
  }

  const AUTOMATION_RULE_META = {
    'customer.missing_health_declaration': { risk: 'blocker', label: 'Hälsodeklaration saknas' },
    'customer.missing_journal': { risk: 'blocker', label: 'Journal saknas' },
    'customer.missing_treatment_plan': { risk: 'blocker', label: 'Behandlingsplan saknas' },
    'customer.cooling_off_active': { risk: 'info', label: 'Betänketid pågår' },
    'customer.cooling_off_passed': { risk: 'ready', label: 'Betänketid passerad' },
    'customer.missing_agreement_consent_bundle': {
      risk: 'legal_blocker',
      label: 'Avtal + samtycke saknas',
    },
    'customer.missing_operation_day_insurance': { risk: 'blocker', label: 'Friskförsäkran saknas' },
    'customer.missing_photo_consent': { risk: 'legal', label: 'Foto-samtycke saknas' },
    'customer.has_photo_review': { risk: 'needs_review', label: 'Bildreview väntar' },
    'customer.ready_for_treatment': { risk: 'ready', label: 'Redo för behandling' },
  };

  const RISK_SORT = {
    legal_blocker: 0,
    legal: 1,
    blocker: 2,
    needs_review: 3,
    ready: 4,
    info: 5,
  };

  function aggregateAutomationInsights(patients = [], automation = null) {
    if (!automation?.enabled) {
      return { rows: [], disabled: true };
    }
    const tallies = new Map();
    for (const card of patients) {
      for (const sig of card.automationSignals || []) {
        if (sig.status !== 'active') continue;
        const prev = tallies.get(sig.ruleId) || { count: 0, signal: sig };
        prev.count += 1;
        prev.signal = sig;
        tallies.set(sig.ruleId, prev);
      }
    }
    const rows = [...tallies.entries()]
      .map(([ruleId, { count, signal }]) => ({
        ruleId,
        count,
        risk: signal.risk || AUTOMATION_RULE_META[ruleId]?.risk || 'info',
        label: signal.what || AUTOMATION_RULE_META[ruleId]?.label || ruleId,
        why: signal.why || '',
      }))
      .sort((a, b) => {
        const ra = RISK_SORT[a.risk] ?? 9;
        const rb = RISK_SORT[b.risk] ?? 9;
        if (ra !== rb) return ra - rb;
        return b.count - a.count;
      });
    return { rows, disabled: false };
  }

  function populationChartHtml(panel = {}, stats = {}) {
    const total = Number(stats.totalPatients ?? panel.totalPatients) || 0;
    const slices = [
      { label: 'Totalt', value: total },
      { label: 'Aktiva', value: Number(state.segmentTotals?.active) || 0 },
      { label: 'VIP', value: Number(state.segmentTotals?.vip) || 0 },
      { label: 'Granska', value: Number(panel.needsReviewPatients ?? stats.needsReview) || 0 },
      { label: 'Saknar journal', value: Number(panel.missingJournal) || 0 },
      { label: 'Saknar HD', value: Number(panel.missingForm) || 0 },
      { label: 'Med journal', value: Number(panel.withJournal) || 0 },
      { label: 'Med formulär', value: Number(panel.withForm) || 0 },
      { label: 'Foto-review', value: Number(panel.photoReviewPending) || 0 },
      { label: 'Asset review', value: Number(panel.assetReviewPending) || 0 },
      {
        label: 'Idag',
        value: panel.bookingCoverage === 'missing' ? 0 : Number(panel.todayVisits) || 0,
      },
      {
        label: 'Väntelista',
        value: panel.bookingCoverage === 'missing' ? 0 : Number(panel.waitlist) || 0,
      },
      {
        label: 'Kommande',
        value: panel.bookingCoverage === 'missing' ? 0 : Number(panel.upcomingBookings) || 0,
      },
    ];
    const max = Math.max(...slices.map((s) => s.value), 1);
    const bars = slices
      .map((s, i) => {
        const h = Math.max(8, Math.round((s.value / max) * 100));
        const current = i === slices.length - 1 ? ' current' : '';
        return `<div class="agg-chart-bar${current}" style="height:${h}%" title="${escapeHtml(s.label)}: ${fmtStat(s.value)}"></div>`;
      })
      .join('');
    return `
      <div class="agg-chart kunder-population-chart" data-kunder-population-chart>
        <div class="agg-chart-head">
          <span class="agg-chart-title">Kundpopulation (master)</span>
          <span class="agg-chart-value">${fmtStat(total)} totalt</span>
        </div>
        <div class="agg-chart-bars" data-kunder-chart-bars>${bars}</div>
      </div>`;
  }

  function automationInsightsHtml(patients = [], automation = null) {
    const { rows, disabled } = aggregateAutomationInsights(patients, automation);
    const targetRows = 7;
    const htmlRows = [];

    if (disabled) {
      htmlRows.push(
        `<div class="agg-ai-row agg-ai-row--empty">Automation av — ${escapeHtml(automation?.reason || 'ENABLE_AUTOMATION_RUNNER')}</div>`
      );
    } else if (!rows.length) {
      htmlRows.push(
        `<div class="agg-ai-row agg-ai-row--empty">Inga aktiva automation-signaler i aktuell vy.</div>`
      );
    } else {
      for (const row of rows.slice(0, targetRows)) {
        htmlRows.push(
          `<div class="agg-ai-row" data-rule-id="${escapeHtml(row.ruleId)}" data-risk="${escapeHtml(row.risk)}">
            <strong>${fmtStat(row.count)}</strong> kunder · ${escapeHtml(row.label)}${row.why ? ` — ${escapeHtml(row.why)}` : ''}
          </div>`
        );
      }
    }

    while (htmlRows.length < 3) {
      htmlRows.push(
        `<div class="agg-ai-row agg-ai-row--empty">Data saknas — färre än 3 signaltyper i vy.</div>`
      );
    }
    while (htmlRows.length < targetRows && rows.length > 0) {
      htmlRows.push(
        `<div class="agg-ai-row agg-ai-row--empty">Data saknas — inga fler aktiva signaler i batch.</div>`
      );
    }

    return `
      <div>
        <div class="agg-kicker">Regelbaserat · dry-run</div>
      </div>
      <div class="agg-ai-list" data-kunder-ai-insights>${htmlRows.join('')}</div>`;
  }

  function storyIconSvg(kind) {
    const icons = {
      idag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
      risker:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
      mojligheter:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 2l2.39 4.84L20 8l-3.5 4 1.5 6L12 15l-6 3 1.5-6L4 8l5.61-1.16L12 2z"/></svg>',
      klart:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>',
    };
    return icons[kind] || icons.idag;
  }

  function countActiveAutomation(ruleId) {
    let n = 0;
    for (const card of state.patients) {
      for (const sig of card.automationSignals || []) {
        if (sig.status === 'active' && sig.ruleId === ruleId) n += 1;
      }
    }
    return n;
  }

  function setAggInsightBody(host, key, html) {
    const el = host.querySelector(`[data-kunder-agg-body="${key}"]`);
    if (!el) return;
    el.className = 'agg-insight-body';
    el.innerHTML = html;
  }

  function renderAggInsights() {
    const host = $('[data-kunder-agg-insights]');
    if (!host) return;

    if (state.mockupSeed && global.CcoKunderV9MockSeed?.aggInsights) {
      const a = global.CcoKunderV9MockSeed.aggInsights;
      setAggInsightBody(host, 'idag', a.idag);
      setAggInsightBody(host, 'opp', a.opp);
      setAggInsightBody(host, 'trend', a.trend);
      setAggInsightBody(host, 'risk', a.risk);
      return;
    }

    const hasStats = Boolean(state.stats) && !state.authRequired;
    const panel = state.stats?.kunderPanel || state.segmentStats?.panel || {};
    const counts = state.segmentTotals || {};

    if (!hasStats) {
      if (global.CcoKunderV9MockSeed?.aggInsights) {
        const a = global.CcoKunderV9MockSeed.aggInsights;
        setAggInsightBody(host, 'idag', a.idag);
        setAggInsightBody(host, 'opp', a.opp);
        setAggInsightBody(host, 'trend', a.trend);
        setAggInsightBody(host, 'risk', a.risk);
        return;
      }
      setAggInsightBody(host, 'idag', 'Data saknas — logga in för customers-shell.');
      setAggInsightBody(host, 'opp', 'Data saknas — logga in.');
      setAggInsightBody(host, 'trend', 'Intäkt/LTV — data saknas (ej mock).');
      setAggInsightBody(host, 'risk', 'Data saknas — logga in.');
      return;
    }

    const todayN =
      panel.bookingCoverage === 'missing' ? null : (counts.today_visits ?? panel.todayVisits);
    const riskPatients = state.patients
      .filter(
        (p) =>
          p.flags?.includes('needs_review') ||
          p.missingHealthDeclaration ||
          p.missingForm ||
          p.missingJournal
      )
      .slice(0, 3);
    const riskNames = riskPatients.map((p) => escapeHtml(displayName(p))).join(', ');
    const riskTotal =
      (Number(counts.needs_review ?? panel.needsReviewPatients ?? state.stats.needsReview) || 0) +
      (Number(counts.missing_health_declaration ?? panel.missingForm) || 0) +
      (Number(counts.missing_journal ?? panel.missingJournal) || 0);

    const missingHd = Number(counts.missing_health_declaration ?? panel.missingForm) || 0;
    const vip = Number(counts.vip ?? panel.vipPatients) || 0;
    const active = Number(counts.active) || 0;

    setAggInsightBody(
      host,
      'idag',
      todayN != null
        ? `<strong>${fmtStat(todayN)}</strong> besök idag${
            riskNames ? ` · ${riskNames} behöver uppföljning` : ''
          }.`
        : riskNames
          ? `<strong>${fmtStat(riskPatients.length)}</strong> i vy: ${riskNames}.`
          : 'Inga dagens poster i aktuell batch.'
    );

    setAggInsightBody(
      host,
      'opp',
      panel.bookingCoverage === 'missing'
        ? 'Väntelista/kommande — bokningsdata saknas.'
        : `<strong>${fmtStat((Number(counts.waitlist) || 0) + (Number(counts.this_week) || 0))}</strong> väntelista + denna vecka · <strong>${fmtStat(vip)}</strong> VIP i master.`
    );

    setAggInsightBody(
      host,
      'trend',
      `<strong>${fmtStat(active)}</strong> aktiva · <strong>${fmtStat(state.stats?.totalPatients)}</strong> totalt. Intäkt/LTV — data saknas.`
    );

    setAggInsightBody(
      host,
      'risk',
      `<strong>${fmtStat(riskTotal || missingHd)}</strong> ärenden (granska + saknar journal/HD)${
        missingHd ? ` · <strong>${fmtStat(missingHd)}</strong> saknar hälsodeklaration` : ''
      }.`
    );
  }

  const STORY_RISK_RULE_IDS = [
    'customer.missing_health_declaration',
    'customer.missing_journal',
    'customer.missing_agreement_consent_bundle',
  ];

  function formatTimeShort(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function activeSignalForRule(patient, ruleId) {
    return (patient.automationSignals || []).find(
      (s) => s.status === 'active' && s.ruleId === ruleId
    );
  }

  function storyListEmpty(message) {
    return `<div class="story-list"><p class="story-card-sub">${escapeHtml(message)}</p></div>`;
  }

  function storyItemHtml(patient, what, when = '', severity = 'med', badge = '!') {
    const whenHtml = when ? `<span class="when">${escapeHtml(when)}</span>` : '';
    return `<div class="story-item" data-severity="${escapeHtml(severity)}">
      <span class="badge">${escapeHtml(badge)}</span>
      <span><span class="who">${escapeHtml(displayName(patient))}</span> <span class="what">— ${escapeHtml(what)}</span></span>
      ${whenHtml}
    </div>`;
  }

  function storyListFromItems(items, emptyMessage) {
    if (!items.length) {
      return storyListEmpty(emptyMessage);
    }
    return `<div class="story-list">${items.join('')}</div>`;
  }

  function topStoryRiskPatients() {
    const seen = new Set();
    const rows = [];
    for (const ruleId of STORY_RISK_RULE_IDS) {
      for (const patient of state.patients) {
        if (seen.has(patient.patientId)) continue;
        const sig = activeSignalForRule(patient, ruleId);
        if (!sig) continue;
        seen.add(patient.patientId);
        const what = sig.what || AUTOMATION_RULE_META[ruleId]?.label || ruleId;
        const severity =
          sig.risk === 'legal_blocker' || sig.risk === 'legal'
            ? 'high'
            : sig.risk === 'blocker'
              ? 'med'
              : 'med';
        const when =
          patient.todayVisit && patient.nextBookingAt ? formatTimeShort(patient.nextBookingAt) : '';
        rows.push(storyItemHtml(patient, what, when, severity));
        if (rows.length >= 3) return rows;
      }
    }
    return rows;
  }

  function topStoryIdagPatients() {
    return state.patients
      .filter((p) => p.todayVisit === true)
      .slice(0, 3)
      .map((p) => {
        const what = p.nextBookingType || p.treatmentTypes?.[0] || 'besök idag';
        const when = formatTimeShort(p.nextBookingAt);
        return storyItemHtml(p, what, when, 'ok', '◷');
      });
  }

  function isDormantPatient(p) {
    return Boolean(p.flags?.includes('dormant') || p.segment === 'dormant');
  }

  function topStoryMojligheterPatients() {
    const pool = state.patients.filter(
      (p) => p.onWaitlist || p.hasUpcomingBooking || isDormantPatient(p)
    );
    const ranked = pool.sort((a, b) => {
      const score = (p) =>
        (p.onWaitlist ? 4 : 0) + (p.hasUpcomingBooking ? 2 : 0) + (isDormantPatient(p) ? 1 : 0);
      return score(b) - score(a);
    });
    return ranked.slice(0, 3).map((p) => {
      let what = 'dormant';
      if (p.onWaitlist) what = `väntelista · ${p.waitingListStatus || 'ärende'}`;
      else if (p.hasUpcomingBooking) what = p.nextBookingType || 'kommande bokning';
      else if (isDormantPatient(p)) what = 'dormant · återaktivera';
      const when = p.hasUpcomingBooking ? formatTimeShort(p.nextBookingAt) : '';
      return storyItemHtml(p, what, when, 'ok', '★');
    });
  }

  function topStoryKlarPatients() {
    const rows = [];
    for (const patient of state.patients) {
      const sig = activeSignalForRule(patient, 'customer.ready_for_treatment');
      if (!sig) continue;
      const what =
        sig.what ||
        AUTOMATION_RULE_META['customer.ready_for_treatment']?.label ||
        'redo för behandling';
      rows.push(storyItemHtml(patient, what, '', 'ok', '✓'));
      if (rows.length >= 3) break;
    }
    return rows;
  }

  function renderInsights() {
    renderAggInsights();
    renderStoryCards();
  }

  function renderStoryCards() {
    const grid = $('.calendar-shell [data-kunder-story-grid]');
    if (!grid) return;

    const panel = state.stats?.kunderPanel || state.segmentStats?.panel || {};
    const counts = state.segmentTotals || {};
    const hasStats = Boolean(state.stats) && !state.authRequired;
    const automationOn = Boolean(state.automation?.enabled);

    if (!hasStats) {
      grid.innerHTML = `
      <div class="story-card" data-kind="idag">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('idag')}</span>Idag</div>
        <h2 class="story-card-headline">Data saknas</h2>
        ${storyListEmpty('Data saknas — logga in.')}
      </div>
      <div class="story-card" data-kind="risker">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('risker')}</span>Risker</div>
        <h2 class="story-card-headline">Data saknas</h2>
        ${storyListEmpty('Data saknas — logga in.')}
      </div>
      <div class="story-card" data-kind="mojligheter">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('mojligheter')}</span>Möjligheter</div>
        <h2 class="story-card-headline">Data saknas</h2>
        ${storyListEmpty('Data saknas — logga in.')}
      </div>
      <div class="story-card" data-kind="klart">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('klart')}</span>Klar</div>
        <h2 class="story-card-headline">Data saknas</h2>
        ${storyListEmpty('Data saknas — logga in.')}
      </div>`;
      return;
    }

    const todayCount =
      panel.bookingCoverage === 'missing' ? null : (counts.today_visits ?? panel.todayVisits);
    const riskTotal =
      (Number(counts.needs_review ?? panel.needsReviewPatients ?? state.stats.needsReview) || 0) +
      (Number(counts.missing_health_declaration ?? panel.missingForm) || 0) +
      (Number(counts.missing_journal ?? panel.missingJournal) || 0);
    const readyCount = automationOn ? countActiveAutomation('customer.ready_for_treatment') : null;
    const oppWaitlist =
      panel.bookingCoverage === 'missing' ? null : (counts.waitlist ?? panel.waitlist);
    const oppUpcoming =
      panel.bookingCoverage === 'missing' ? null : (counts.this_week ?? panel.thisWeekVisits);
    const oppHeadline =
      oppWaitlist != null || oppUpcoming != null
        ? fmtStat((Number(oppWaitlist) || 0) + (Number(oppUpcoming) || 0))
        : null;

    const idagRows = topStoryIdagPatients();
    const riskRows = automationOn ? topStoryRiskPatients() : [];
    const mojRows =
      panel.bookingCoverage === 'missing' &&
      !state.patients.some((p) => p.onWaitlist || isDormantPatient(p))
        ? []
        : topStoryMojligheterPatients();
    const klarRows = automationOn ? topStoryKlarPatients() : [];

    grid.innerHTML = `
      <div class="story-card" data-kind="idag">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('idag')}</span>Idag</div>
        <h2 class="story-card-headline">${
          todayCount != null
            ? `<span class="num">${fmtStat(todayCount)}</span> besök`
            : idagRows.length
              ? `<span class="num">${fmtStat(idagRows.length)}</span> i vy`
              : 'Data saknas'
        }</h2>
        <p class="story-card-sub">${
          panel.bookingCoverage === 'missing'
            ? 'Bokningsdata saknas i segmentStats.'
            : 'Idag · todayVisit i laddad batch.'
        }</p>
        ${storyListFromItems(
          idagRows,
          panel.bookingCoverage === 'missing' ? 'Data saknas' : 'Inga dagens besök i aktuell batch.'
        )}
      </div>
      <div class="story-card" data-kind="risker">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('risker')}</span>Risker</div>
        <h2 class="story-card-headline">${
          riskRows.length
            ? 'Hantera först'
            : riskTotal
              ? `<span class="num">${fmtStat(riskTotal)}</span> ärenden`
              : 'Data saknas'
        }</h2>
        ${storyListFromItems(
          riskRows,
          !automationOn
            ? 'Data saknas — automation av.'
            : 'Inga aktiva risk-signaler i aktuell batch.'
        )}
      </div>
      <div class="story-card" data-kind="mojligheter">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('mojligheter')}</span>Möjligheter</div>
        <h2 class="story-card-headline">${
          oppHeadline != null
            ? `<span class="num">${oppHeadline}</span> bokning`
            : mojRows.length
              ? 'Fyll luckor'
              : 'Data saknas'
        }</h2>
        <p class="story-card-sub">Väntelista · kommande · dormant (laddad batch).</p>
        ${storyListFromItems(
          mojRows,
          panel.bookingCoverage === 'missing'
            ? 'Data saknas — bokningsdata.'
            : 'Inga möjligheter i aktuell batch.'
        )}
      </div>
      <div class="story-card" data-kind="klart">
        <div class="story-card-kicker"><span class="icon">${storyIconSvg('klart')}</span>Klar</div>
        <h2 class="story-card-headline">${
          readyCount != null && readyCount > 0
            ? `<span class="num">${fmtStat(readyCount)}</span> redo`
            : klarRows.length
              ? `<span class="num">${fmtStat(klarRows.length)}</span> redo`
              : 'Data saknas'
        }</h2>
        <p class="story-card-sub">${
          automationOn ? 'ready_for_treatment · aktiv signal.' : 'Data saknas — automation av.'
        }</p>
        ${storyListFromItems(
          klarRows,
          !automationOn ? 'Data saknas — automation av.' : 'Inga redo-signaler i aktuell batch.'
        )}
      </div>`;
  }

  function renderRightPanel() {
    const bookingView = $('.intel-booking-view');
    if (!bookingView) return;
    if (state.mockupSeed && global.CcoKunderV9MockSeed?.rightPanelHtml) {
      bookingView.innerHTML = global.CcoKunderV9MockSeed.rightPanelHtml;
      return;
    }
    const stats = state.stats;
    const hasStats = Boolean(stats) && !state.authRequired;
    if (!hasStats) {
      bookingView.innerHTML = `
        <div class="agg-shell">
          <div>
            <div class="agg-kicker">Översikt</div>
            <h3 class="agg-title">Kundpopulation</h3>
          </div>
          <p class="kunder-data-missing">Data saknas — logga in för customers-shell.</p>
          ${populationChartHtml({}, {})}
          ${automationInsightsHtml([], state.automation)}
          <p class="kunder-data-missing" style="margin-top:12px">Intäkt/LTV — data saknas (ej mock).</p>
        </div>`;
      return;
    }
    const panel = stats.kunderPanel || state.segmentStats?.panel || {};
    const activeN = Number(state.segmentTotals?.active) || 0;
    const vipN = Number(state.segmentTotals?.vip) || 0;
    const newN = Number(state.segmentTotals?.new) || 0;
    bookingView.innerHTML = `
      <div class="agg-shell">
        <div>
          <div class="agg-kicker">Översikt</div>
          <h3 class="agg-title">Kundpopulation</h3>
        </div>
        <div class="agg-stat-grid">
          <div class="agg-stat">
            <div class="agg-stat-label">Totalt</div>
            <div class="agg-stat-value">${fmtStat(stats.totalPatients)}</div>
            <div class="agg-stat-trend">${fmtStat(newN)} nya i segment</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Aktiva</div>
            <div class="agg-stat-value">${fmtStat(activeN)}</div>
            <div class="agg-stat-trend">segmentStats · active</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">VIP</div>
            <div class="agg-stat-value">${fmtStat(vipN)}</div>
            <div class="agg-stat-trend">segmentStats · vip</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Snitt LTV</div>
            <div class="agg-stat-value">—</div>
            <div class="agg-stat-trend">Data saknas</div>
          </div>
        </div>
        ${populationChartHtml(panel, stats)}
        ${automationInsightsHtml(state.patients, state.automation)}
        <p class="kunder-data-missing" style="margin-top:12px">Intäkt/LTV — data saknas (ej mock).</p>
        <div class="agg-actions">
          <button type="button" class="quick-pill quick-pill--ai" disabled title="Ej kopplat ännu">★ Mass-påminnelse</button>
          <button type="button" class="quick-pill" disabled title="Ej kopplat ännu — kommer i P1">↓ Exportera urval</button>
        </div>
      </div>`;
  }

  const ASSETS = (function () {
    const CATEGORY_LABEL = {
      journal: 'Journal',
      photo_before: 'Före',
      photo_during: 'Under',
      photo_after: 'Efter',
      consent: 'Samtycke',
      agreement: 'Avtal',
      form: 'Formulär',
      aisia_report: 'Analys',
      other: 'Övrigt',
    };

    function assetBadges(a) {
      const parts = [];
      if (a.status === 'NEEDS_REVIEW') parts.push('needsReview');
      if (a.status === 'IMPORTED_TO_CCO') parts.push('imported');
      if (a.importReviewRequired) parts.push('needsClassification');
      if (a.photoReviewRequired) parts.push('needsPhotoReview');
      if (a.encounterReviewRequired) parts.push('needsEncounterReview');
      if (a.sourceSystem) parts.push(a.sourceSystem);
      return parts;
    }

    async function loadAssets(host, patientId) {
      const loading = host.querySelector('[data-cco-assets-loading]');
      const body = host.querySelector('[data-cco-assets-body]');
      try {
        const url = `/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets?groupByCategory=1`;
        const res = await fetch(url, {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Authorization: getToken() ? `Bearer ${getToken()}` : '',
            'x-cco-role': getRole(),
          },
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (loading) loading.remove();
        const items = [];
        if (data.categories) {
          Object.keys(data.categories).forEach((cat) => {
            (data.categories[cat] || []).forEach((a) => items.push({ ...a, category: cat }));
          });
        }
        const countEl = host.querySelector('[data-cco-assets-count]');
        if (countEl) countEl.textContent = String(items.length);
        if (body) {
          body.hidden = false;
          body.innerHTML =
            items.length === 0
              ? '<div class="cco-assets-empty">Inga importerade filer i CCO storage.</div>'
              : items
                  .slice(0, 80)
                  .map((a) => {
                    const badges = assetBadges(a)
                      .map((b) => `<span class="cco-assets-badge">${escapeHtml(b)}</span>`)
                      .join('');
                    return `<div class="cco-assets-row"><span>${escapeHtml(CATEGORY_LABEL[a.category] || a.category)}</span> ${badges}</div>`;
                  })
                  .join('');
        }
      } catch (err) {
        if (loading) loading.remove();
        if (body) {
          body.hidden = false;
          body.innerHTML = `<div class="cco-assets-empty">Kunde inte hämta filer (${escapeHtml(err.message)}).</div>`;
        }
      }
    }

    return { loadAssets };
  })();

  async function openDossier(card) {
    if (card?._mockSeed) {
      openMockDossier(card._mockName || card.displayName);
      return;
    }
    const intelShell = $('#intelShell');
    const intelCustomerView = $('#intelCustomerView');
    const breadcrumbSlot = $('#breadcrumbSlot');
    if (!intelShell || !intelCustomerView) return;

    state.selectedPatientId = card.patientId;
    $$('.customer-row.selected').forEach((r) => r.classList.remove('selected'));
    const row = $(`.customer-row[data-patient-id="${CSS.escape(card.patientId)}"]`);
    if (row) row.classList.add('selected');

    const name = displayName(card);
    const actionCtx = { tenantId: TENANT_ID, role: getRole(), surface: 'desktop' };
    const dossierBar = global.CcoKunderActions?.buildDossierBar(card, actionCtx) || [];
    const dossierActionsHtml = global.CcoKunderActions
      ? global.CcoKunderActions.renderMatrixLegend(dossierBar) +
        global.CcoKunderActions.renderActionsHtml(dossierBar)
      : '';
    const smartNextHtml = global.CcoKunderSmartNextStep?.renderPanel
      ? global.CcoKunderSmartNextStep.renderPanel(card, { automation: state.automation })
      : '';
    intelCustomerView.innerHTML = `
    <div class="dossier-head">
      <div class="dossier-avatar">${escapeHtml((name.slice(0, 2) || '??').toUpperCase())}</div>
      <div class="dossier-head-body">
        <div class="dossier-kicker">Kundkort</div>
        <div class="dossier-name">${escapeHtml(name)}</div>
        <div class="dossier-contact">${escapeHtml(card.primaryEmail || '—')} · ${escapeHtml(card.primaryPhone || '—')}</div>
        <div class="dossier-tags">
          <span class="dossier-tag dossier-tag--lifecycle">${escapeHtml(MATCH_LABELS[card.matchStatus] || '—')}</span>
          ${card.flags?.includes('needs_review') ? '<span class="dossier-tag dossier-tag--risk">Granska</span>' : ''}
        </div>
      </div>
      <button type="button" class="dossier-close" id="dossierClose" title="Stäng">×</button>
    </div>
    <div class="dossier-stats">
      <div class="dossier-stat"><div class="dossier-stat-label">Patient-ID</div><div class="dossier-stat-value" style="font-size:11px">${escapeHtml(card.patientId)}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">Journal</div><div class="dossier-stat-value">${card.hasJournal ? 'Ja' : 'Nej'}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">Formulär</div><div class="dossier-stat-value">${card.hasForm ? 'Ja' : card.missingForm ? 'Saknas' : '—'}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">Avtal</div><div class="dossier-stat-value">${card.hasAgreement ? 'Ja' : card.missingAgreement ? 'Saknas' : '—'}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">Filer (Drive)</div><div class="dossier-stat-value">${Number(card.fileSummary?.totalFiles || 0)}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">CCO assets</div><div class="dossier-stat-value">${Number(card.assetCount ?? 0)}</div></div>
    </div>
    ${smartNextHtml}
    <div class="dossier-review-flags">
      ${
        rowBadges(card)
          .map(
            (t) => `<span class="dossier-tag dossier-tag--${t.kind}">${escapeHtml(t.label)}</span>`
          )
          .join('') || '<span class="kunder-data-missing">Inga review-flaggor</span>'
      }
      <div class="dossier-next-step">Nästa steg: ${escapeHtml(nextStepLabel(card))}</div>
    </div>
    <div class="dossier-scroll">
      <details class="dossier-section" open>
        <summary>Bokning &amp; kalender</summary>
        <div class="dossier-booking-grid">
          <div><span class="dossier-stat-label">Kommande</span><br>${card.hasUpcomingBooking ? escapeHtml(formatDateTime(card.nextBookingAt)) : '—'}</div>
          <div><span class="dossier-stat-label">Typ</span><br>${escapeHtml(card.nextBookingType || '—')}</div>
          <div><span class="dossier-stat-label">Resurs</span><br>${escapeHtml(card.nextBookingResourceLabel || '—')}</div>
          <div><span class="dossier-stat-label">Senast besök</span><br>${escapeHtml(formatDate(card.lastVisitAt))}</div>
          <div><span class="dossier-stat-label">Encounter</span><br>${escapeHtml(card.encounterId || '—')}</div>
          <div><span class="dossier-stat-label">Ärende</span><br>${escapeHtml(card.bookingCaseStatus || '—')}</div>
        </div>
        ${
          card.missingEncounterForBooking
            ? '<p class="kunder-data-missing dossier-warning">Kommande bokning utan kopplat encounter.</p>'
            : ''
        }
        ${
          card.onWaitlist
            ? `<p class="kunder-data-missing">Väntelista: ${escapeHtml(card.waitingListStatus || 'ärende')}</p>`
            : ''
        }
      </details>
      <details class="dossier-section" open>
        <summary>Journal &amp; tidslinje</summary>
        <div id="kunder-journal-feed-mount"></div>
      </details>
      <details class="dossier-section" open data-cco-assets-host data-patient-id="${escapeHtml(card.patientId)}">
        <summary>Filer &amp; journaler <span class="count" data-cco-assets-count>…</span></summary>
        <div class="cco-assets-loading" data-cco-assets-loading>Hämtar från CCO storage…</div>
        <div data-cco-assets-body hidden></div>
      </details>
      <details class="dossier-section" open data-cco-komm-host data-customer-id="${escapeHtml(card.patientId)}">
        <summary>Kommunikation</summary>
        <div class="cco-komm-loading">Laddar…</div>
      </details>
    </div>
    <div class="dossier-actions" data-kunder-actions-host>${dossierActionsHtml}</div>
    ${
      card.journalBlocked
        ? `<p class="kunder-data-missing">Spärrad åtkomst: ${escapeHtml(card.journalBlockReason || 'journal spärrad')}</p>`
        : ''
    }`;

    intelShell.dataset.context = 'customer';
    if (breadcrumbSlot) {
      breadcrumbSlot.innerHTML = `<span class="breadcrumb"><span class="back" id="bcBack" title="Tillbaka">‹</span> Kunder / <span class="who">${escapeHtml(name)}</span></span>`;
    }

    $('#dossierClose')?.addEventListener('click', closeDossier);
    $('#bcBack')?.addEventListener('click', closeDossier);

    const assetsHost = intelCustomerView.querySelector('[data-cco-assets-host]');
    if (assetsHost) ASSETS.loadAssets(assetsHost, card.patientId);

    const jMount = $('#kunder-journal-feed-mount');
    if (jMount && global.CcoJournalFeed) {
      try {
        global.CcoJournalFeed.mount(jMount, {
          customerId: card.patientId,
          tenantId: TENANT_ID,
          headers: { 'x-cco-role': getRole(), 'x-cco-tenant': TENANT_ID },
        });
      } catch (e) {
        jMount.innerHTML = `<p class="kunder-data-missing">Journal-feed: ${escapeHtml(e.message)}</p>`;
      }
    }

    const kommHost = intelCustomerView.querySelector('[data-cco-komm-host]');
    if (kommHost && global.CcoKommPanel) {
      try {
        await global.CcoKommPanel.mount(kommHost, {
          customerId: card.patientId,
          tenantId: TENANT_ID,
          role: getRole(),
        });
      } catch (e) {
        kommHost.innerHTML = `<p class="kunder-data-missing">Kommunikation: ${escapeHtml(e.message)}</p>`;
      }
    }

    const actionsHost = intelCustomerView.querySelector('[data-kunder-actions-host]');
    if (actionsHost && global.CcoKunderActions) {
      global.CcoKunderActions.bindDossierHandlers(actionsHost, {
        scrollAssets: () => {
          assetsHost?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        scrollCommunication: () => {
          kommHost?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    }
  }

  function closeDossier() {
    const intelShell = $('#intelShell');
    if (intelShell) intelShell.dataset.context = 'booking';
    const breadcrumbSlot = $('#breadcrumbSlot');
    if (breadcrumbSlot) breadcrumbSlot.innerHTML = '';
    $$('.customer-row.selected').forEach((r) => r.classList.remove('selected'));
    state.selectedPatientId = '';
  }

  function applySegment(seg) {
    if (!seg || seg.disabled) return;
    state.activeSegmentId = seg.id;
    state.flagFilter = seg.flags || '';
    state.offset = 0;
    state.patients = [];
    if (state.mockupSeed) {
      renderList();
      return;
    }
    fetchShell();
  }

  function bindUi() {
    document.body.dataset.kunderReal = '1';
    document.body.classList.add('kunder-v9');

    $('.calendar-shell[data-cco-shell="calendar"]')?.remove();

    const listHead = $('.customer-row-head');
    if (listHead?.children?.[6]) listHead.children[6].textContent = 'Nästa steg';

    function mockSegmentIdFromChip(id) {
      if (id === 'alla') return 'all';
      if (id === 'aktiva') return 'active';
      if (id === 'nya') return 'new';
      if (id === 'risk') return 'needs_review';
      if (id === 'saknar-hd' || id === 'saknar-form') return 'missing_health_declaration';
      return id;
    }

    $$('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.disabled) return;
        $$('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const id = chip.dataset.segment;
        if (state.mockupSeed) {
          state.activeSegmentId = mockSegmentIdFromChip(id);
          renderList();
          return;
        }
        const chipSeg =
          id === 'alla'
            ? SEGMENT_BY_ID.all
            : id === 'risk'
              ? SEGMENT_BY_ID.risk
              : id === 'aktiva'
                ? SEGMENT_BY_ID.active
                : id === 'nya'
                  ? SEGMENT_BY_ID.new
                  : id === 'vip'
                    ? SEGMENT_BY_ID.vip
                    : id === 'dormant'
                      ? SEGMENT_BY_ID.dormant
                      : id === 'saknar-form' || id === 'saknar-hd'
                        ? SEGMENT_BY_ID.missing_health_declaration
                        : SEGMENT_BY_ID[id];
        if (chipSeg) applySegment(chipSeg);
      });
    });

    $$('.side-link[data-segment]').forEach((link) => {
      link.addEventListener('click', () => {
        if (link.classList.contains('is-disabled')) return;
        $$('.side-link').forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
        const id = link.dataset.segment;
        if (state.mockupSeed) {
          state.activeSegmentId = id;
          renderList();
          return;
        }
        applySegment(SEGMENT_BY_ID[id] || SEGMENT_BY_ID.all);
      });
    });

    const searchOverlayInput = $('#searchOverlayInput');
    const globalSearch = $('#globalSearch');
    const globalSearchInput = $('#globalSearchInput');
    let searchTimer = null;

    if (searchOverlayInput) {
      searchOverlayInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.query = searchOverlayInput.value.trim();
          if (globalSearchInput) globalSearchInput.value = state.query;
          if (state.mockupSeed) {
            renderList();
            renderMockSearchPanel();
          } else fetchShell();
        }, 280);
      });
    }
    if (globalSearchInput) {
      globalSearchInput.addEventListener('focus', () => {
        globalSearch?.classList.add('is-focused');
        openSearch();
      });
      globalSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.query = globalSearchInput.value.trim();
          if (searchOverlayInput) searchOverlayInput.value = state.query;
          if (state.mockupSeed) {
            renderList();
            renderMockSearchPanel();
          } else fetchShell();
        }, 280);
      });
    }
    $('#searchOverlay')?.addEventListener('click', (ev) => {
      if (ev.target === $('#searchOverlay')) closeSearch();
    });

    document.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
        ev.preventDefault();
        openSearch();
      }
      if (ev.key === 'Escape' && $('#searchOverlay')?.classList.contains('is-visible')) {
        ev.preventDefault();
        closeSearch();
      }
    });

    $$('.nav-btn').forEach((btn) => {
      const t = btn.textContent || '';
      if (/Exportera|Ny kund|mass/i.test(t)) {
        btn.disabled = true;
        btn.title = 'Ej kopplat ännu';
      }
    });

    $$('.quick-pill--ai, .bulk-action--ai').forEach((el) => {
      el.disabled = true;
    });

    const bulkBar = $('#bulkBar');
    if (bulkBar) bulkBar.remove();

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && $('#intelShell')?.dataset.context === 'customer') {
        if (!$('#searchOverlay')?.classList.contains('is-visible')) closeDossier();
      }
    });

    $('#watchWidget')?.remove();
    $('#voiceOverlay')?.remove();
    $('#voiceSheet')?.remove();
    $('#calmBanner')?.remove();
    $('#camOverlay')?.remove();
    const searchInput = $('#searchOverlayInput');
    if (searchInput) {
      searchInput.placeholder = 'Sök hela registret (namn, e-post, telefon)…';
    }
  }

  function injectStyles() {
    if ($('#kunder-real-styles')) return;
    const style = document.createElement('style');
    style.id = 'kunder-real-styles';
    style.textContent = `
      .kunder-auth-banner { max-width:1200px; margin:12px auto; padding:12px 18px; border-radius:12px; background:rgba(200,130,30,.12); border:1px solid rgba(200,130,30,.35); font-size:13px; }
      .kunder-auth-banner a { font-weight:700; margin-left:8px; }
      .kunder-data-missing { font-size:12px; color:var(--cco-text-secondary); line-height:1.5; margin:8px 0; }
      .kunder-list-status { padding:24px; text-align:center; color:var(--cco-text-secondary); font-size:13px; }
      .kunder-list-status--error { color:var(--cco-status-danger); }
      .side-link.is-disabled, .filter-chip:disabled { opacity:.45; cursor:not-allowed; }
      .kunder-revenue-disabled { color:var(--cco-text-tertiary); }
      .cco-assets-badge { display:inline-block; margin:2px 4px 2px 0; padding:2px 6px; border-radius:6px; font-size:9px; font-weight:700; background:rgba(255,255,255,.7); border:1px solid rgba(132,117,107,.2); }
      .cr-tag--vip { background:rgba(200,160,80,.2); }
      .cr-tag--warn { background:rgba(200,130,30,.15); }
      .dossier-review-flags { padding:8px 14px; display:flex; flex-wrap:wrap; gap:6px; align-items:center; font-size:11px; }
      .dossier-next-step { width:100%; margin-top:6px; color:var(--cco-text-secondary); }
      .dossier-booking-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; padding:8px 0; font-size:12px; }
      .dossier-warning { color:var(--cco-status-warning); }
      body[data-kunder-real="1"] .watch-widget { display:none !important; }
      .kunder-load-more-wrap { display:flex; align-items:center; justify-content:center; gap:12px; padding:16px; flex-wrap:wrap; }
      .kunder-load-more-meta { font-size:12px; color:var(--cco-text-secondary); }
      .kunder-filter-note { padding:8px 14px; font-size:11px; color:var(--cco-text-secondary); border-bottom:1px solid rgba(132,117,107,.12); }
      #searchOverlayInput::placeholder { color:var(--cco-text-tertiary); }
      .kunder-action-legend { width:100%; font-size:10px; color:var(--cco-text-secondary); margin:0 0 8px; }
      .kunder-action--partial { opacity:.72; border-style:dashed; }
      .kunder-action--blocked { opacity:.55; }
      .cr-ai[data-rule-based="1"] { font-style:normal; }
      [data-kunder-agg-body] { font-size:12px; line-height:1.45; color:var(--cco-text-secondary); }
      [data-kunder-agg-body].agg-insight-body strong { color:var(--cco-color-brand); font-weight:800; }
      .story-card--disabled { opacity:.72; }
      .story-card--disabled .story-card-headline { font-size:16px; }
      .customers-shell .story-grid { display:none !important; }
      body[data-kunder-real="1"] .customers-shell .agg-insights,
      body.kunder-v9 .customers-shell .agg-insights,
      body[data-kunder-real="1"] .agg-insights.kunder-v9-insights,
      body.kunder-v9 .agg-insights.kunder-v9-insights {
        display:grid !important;
        grid-template-columns:repeat(4, 1fr);
        gap:8px;
        margin-bottom:14px;
      }
      [data-kunder-agg-body] { min-height:2.6em; }
      body.kunder-v9 .watch-widget, body.kunder-v9 .voice-overlay, body.kunder-v9 .voice-sheet, body.kunder-v9 .calm-banner { display:none !important; }
      body[data-kunder-demo="1"] .mockup-label, body[data-kunder-demo="1"] .caption { display:none !important; }
    `;
    document.head.appendChild(style);
  }

  async function boot() {
    injectStyles();
    applyV9VisualChrome();
    bindUi();
    renderInsights();
    renderRightPanel();
    if (getToken() && global.CcoKunderStaffOwner?.fetchAuthMe) {
      await global.CcoKunderStaffOwner.fetchAuthMe(getToken());
    }
    await fetchShell();
  }

  global.CcoKunderReal = { boot, handlesCustomers: true };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
