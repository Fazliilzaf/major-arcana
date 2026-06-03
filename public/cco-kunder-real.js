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
    { id: 'missing_form', chip: 'saknar-form', side: true },
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
  };

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
    if (card.nextStep) return card.nextStep;
    return '—';
  }

  function rowBadges(card) {
    const tags = [];
    if (card.reviewFlags?.includes('needs_review') || card.flags?.includes('needs_review')) {
      tags.push({ kind: 'risk', label: 'Granska' });
    }
    if (card.missingJournal) tags.push({ kind: 'risk', label: 'Saknar journal' });
    if (card.missingForm) tags.push({ kind: 'warn', label: 'Saknar formulär' });
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
    if (!getToken()) {
      state.authRequired = true;
      showAuthBanner(true);
      setListStatus('Logga in för att hämta kunder från patient-master.', 'warn');
      renderCounts();
      renderRightPanel();
      return;
    }
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
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(state.offset),
    });
    if (state.query) params.set('q', state.query);
    if (state.flagFilter) params.set('flags', state.flagFilter);
    const activeSeg = SEGMENT_BY_ID[state.activeSegmentId];
    if (activeSeg?.segment) params.set('segment', activeSeg.segment);

    try {
      const payload = await api(`/api/v1/cco/staff/customers-shell?${params}`);
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
      state.loaded = true;
      state.offset = state.patients.length;
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
      renderRightPanel();
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
  }

  function renderCounts() {
    const total = state.stats?.totalPatients;
    const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('sv-SE'));

    const titleH2 = $('.calendar-toolbar-main h2');
    if (titleH2) {
      titleH2.textContent =
        total != null
          ? `${fmt(total)} kunder`
          : state.authRequired
            ? 'Kunder'
            : 'Kunder — data saknas';
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
      const seg = SEGMENTS.find((s) => s.id === id);
      const countEl = link.querySelector('.count');
      if (!countEl) return;
      if (seg?.disabled) {
        link.classList.add('is-disabled');
        link.title = seg.disabledReason || 'Bokningsdata saknas';
        countEl.textContent = '—';
      } else {
        link.classList.remove('is-disabled');
        link.title = seg.status === 'partial' ? seg.disabledReason || 'Partiell data' : '';
        countEl.textContent = fmt(state.segmentTotals[id] ?? (id === 'all' ? total : null));
      }
    });

    $$('.filter-chip[data-segment]').forEach((chip) => {
      const id = chip.dataset.segment;
      const seg = SEGMENTS.find((s) => s.id === id);
      const countEl = chip.querySelector('.count');
      if (!countEl) return;
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
      <div><div class="cr-ai" title="Regelbaserat nästa steg (ej AI)">${escapeHtml(nextStepLabel(card))}</div></div>
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

  function renderRightPanel() {
    const bookingView = $('.intel-booking-view');
    if (!bookingView) return;
    const stats = state.stats;
    if (!stats || state.authRequired) {
      bookingView.innerHTML = `
        <div class="agg-shell">
          <div class="agg-kicker">Översikt</div>
          <h3 class="agg-title">Kundpopulation</h3>
          <p class="kunder-data-missing">Data saknas — logga in eller vänta på patient-master.</p>
        </div>`;
      return;
    }
    const fmt = (n) => Number(n ?? 0).toLocaleString('sv-SE');
    const panel = stats.kunderPanel || state.segmentStats?.panel || {};
    bookingView.innerHTML = `
      <div class="agg-shell">
        <div>
          <div class="agg-kicker">Översikt</div>
          <h3 class="agg-title">Kundpopulation</h3>
        </div>
        <div class="agg-stat-grid">
          <div class="agg-stat">
            <div class="agg-stat-label">Totalt</div>
            <div class="agg-stat-value">${fmt(stats.totalPatients)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Med journal</div>
            <div class="agg-stat-value">${fmt(panel.withJournal)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Saknar journal</div>
            <div class="agg-stat-value">${fmt(panel.missingJournal)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Med formulär</div>
            <div class="agg-stat-value">${fmt(panel.withForm)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Saknar formulär</div>
            <div class="agg-stat-value">${fmt(panel.missingForm)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Granska (master)</div>
            <div class="agg-stat-value">${fmt(panel.needsReviewPatients ?? stats.needsReview)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Bild-review</div>
            <div class="agg-stat-value">${fmt(panel.photoReviewPending)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Asset review</div>
            <div class="agg-stat-value">${fmt(panel.assetReviewPending)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Idag</div>
            <div class="agg-stat-value">${panel.bookingCoverage === 'missing' ? '—' : fmt(panel.todayVisits)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Denna vecka</div>
            <div class="agg-stat-value">${panel.bookingCoverage === 'missing' ? '—' : fmt(panel.thisWeekVisits)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Väntelista</div>
            <div class="agg-stat-value">${panel.bookingCoverage === 'missing' ? '—' : fmt(panel.waitlist)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Kommande bokn.</div>
            <div class="agg-stat-value">${panel.bookingCoverage === 'missing' ? '—' : fmt(panel.upcomingBookings)}</div>
          </div>
        </div>
        <p class="kunder-data-missing" style="margin-top:12px">Intäkt, LTV, AI-insikter och diagram — data saknas (ej mock).</p>
        <div class="agg-actions">
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
    const intelShell = $('#intelShell');
    const intelCustomerView = $('#intelCustomerView');
    const breadcrumbSlot = $('#breadcrumbSlot');
    if (!intelShell || !intelCustomerView) return;

    state.selectedPatientId = card.patientId;
    $$('.customer-row.selected').forEach((r) => r.classList.remove('selected'));
    const row = $(`.customer-row[data-patient-id="${CSS.escape(card.patientId)}"]`);
    if (row) row.classList.add('selected');

    const name = displayName(card);
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
    <div class="dossier-actions">
      <a class="quick-pill full" href="/journal-feed-demo.html?customerId=${encodeURIComponent(card.patientId)}&tenant=${encodeURIComponent(TENANT_ID)}&role=${encodeURIComponent(getRole())}">Öppna journal (full vy)</a>
      <a class="quick-pill" href="/kalender.html" title="Kalender-arbetsyta">Öppna i kalender</a>
      <button type="button" class="quick-pill" disabled title="Kopplas i Kalender P1">Boka</button>
      <button type="button" class="quick-pill" disabled title="Kopplas i Kalender P1">Omboka</button>
      <button type="button" class="quick-pill" disabled title="Kommer i P1">Skicka formulär</button>
      <button type="button" class="quick-pill" disabled title="Kommer i P1">Skapa offert</button>
      <button type="button" class="quick-pill" disabled title="Ej kopplat ännu">↓ Massåtgärd</button>
    </div>`;

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
    fetchShell();
  }

  function bindUi() {
    document.body.dataset.kunderReal = '1';

    $('.calendar-shell[data-cco-shell="calendar"]')?.remove();

    const listHead = $('.customers-head');
    if (listHead?.children?.[6]) listHead.children[6].textContent = 'Nästa steg';

    const aggInsights = $('.agg-insights');
    if (aggInsights) {
      aggInsights.innerHTML =
        '<p class="kunder-data-missing">Insikter avstängda — ingen mock-data i Kunder (P0.3).</p>';
    }

    const statusBar = $('.calendar-status-bar');
    if (statusBar) {
      statusBar.innerHTML = `
        <span class="status-pill status-pill--success"><span class="dot"></span><span data-kunder-count="matched">—</span> kopplade</span>
        <span class="status-pill status-pill--warning"><span class="dot"></span><span data-kunder-count="needs_review">—</span> granska</span>
        <span class="status-pill status-pill--info"><span class="dot"></span><span data-kunder-count="cliento_only">—</span> Cliento</span>
        <span class="status-pill"><span class="dot"></span><span data-kunder-count="drive_only">—</span> Drive only</span>
        <span class="spacer"></span>
        <span class="status-pill kunder-ltv-disabled" title="LTV kopplas senare">Intäkt/LTV: —</span>`;
    }

    $$('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.disabled) return;
        $$('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const id = chip.dataset.segment;
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
                      : id === 'saknar-form'
                        ? SEGMENT_BY_ID.missing_form
                        : SEGMENT_BY_ID[id];
        if (chipSeg) applySegment(chipSeg);
      });
    });

    $$('.side-link[data-segment]').forEach((link) => {
      link.addEventListener('click', () => {
        if (link.classList.contains('is-disabled')) return;
        $$('.side-link').forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
        applySegment(SEGMENT_BY_ID[link.dataset.segment] || SEGMENT_BY_ID.all);
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
          fetchShell();
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
          fetchShell();
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
    `;
    document.head.appendChild(style);
  }

  async function boot() {
    injectStyles();
    bindUi();
    await fetchShell();
  }

  global.CcoKunderReal = { boot, handlesCustomers: true };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
