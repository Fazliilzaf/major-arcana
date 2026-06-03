/**
 * P0.1 — Real patient master for /kunder.html
 * No mock counts, no CUSTOMER_ROWS, patientId-based dossier + journal-feed.
 */
(function (global) {
  'use strict';

  const PAGE_SIZE = 60;
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

  const SEGMENTS = [
    { id: 'all', label: 'Alla kunder', flags: '', side: true, chip: 'alla', day1: true },
    {
      id: 'mine',
      label: 'Mina kunder',
      flags: '',
      side: true,
      disabled: true,
      disabledReason: 'Ägare per rad saknas i P0.1',
    },
    {
      id: 'active',
      label: 'Aktiva',
      flags: '',
      chip: 'aktiva',
      clientFilter: 'active',
      day1: true,
    },
    {
      id: 'vip',
      label: 'VIP',
      flags: '',
      chip: 'vip',
      disabled: true,
      disabledReason: 'Ingen VIP-flagga i master än',
    },
    { id: 'risk', label: 'Risk', flags: 'needs_review', chip: 'risk', day1: true },
    { id: 'new', label: 'Nya', flags: '', chip: 'nya', clientFilter: 'new', day1: true },
    {
      id: 'dormant',
      label: 'Dormant',
      flags: '',
      chip: 'dormant',
      disabled: true,
      disabledReason: 'Dormant-regel ej definierad i API',
    },
    {
      id: 'missing_form',
      label: 'Saknar formulär',
      flags: '',
      chip: 'saknar-form',
      disabled: true,
      disabledReason: 'Formulär-gap kräver journal-feed aggregate (P1)',
    },
    {
      id: 'missing_journal',
      label: 'Saknar journal',
      flags: '',
      chip: null,
      clientFilter: 'no_journal',
      day1: true,
    },
    { id: 'needs_review', label: 'Needs review', flags: 'needs_review', day1: true },
    {
      id: 'has_drive',
      label: 'Har Drive journal',
      flags: 'has_drive_files',
      treatment: false,
      day1: true,
    },
    {
      id: 'getaccept',
      label: 'Har GetAccept',
      disabled: true,
      disabledReason: 'GetAccept-segment ej kopplat i P0.1',
    },
    {
      id: 'halso',
      label: 'Har halso@',
      disabled: true,
      disabledReason: 'Hälsodekl-segment ej kopplat i P0.1',
    },
    {
      id: 'photos_review',
      label: 'Bilder needsReview',
      disabled: true,
      disabledReason: 'Kräver asset aggregate (P1)',
    },
  ];

  const state = {
    query: '',
    flagFilter: '',
    clientFilter: '',
    offset: 0,
    total: 0,
    patients: [],
    stats: null,
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

  function rowState(card) {
    if (card.flags?.includes('needs_review') || card.matchStatus === 'needs_review') {
      return { state: 'risk', label: 'Granska' };
    }
    if (card.patientOrigin === 'new' || card.matchStatus === 'unmatched') {
      return { state: 'new', label: 'Ny' };
    }
    if (card.hasJournalHistory) {
      return { state: 'active', label: 'Aktiv' };
    }
    return { state: 'active', label: MATCH_LABELS[card.matchStatus] || 'Kund' };
  }

  function nextStepLabel(card) {
    if (card.flags?.includes('needs_review')) return 'Granska identitet/import';
    if (!card.hasJournalHistory) return 'Saknar journal i CCO';
    if (card.flags?.includes('missing_email')) return 'Saknar e-post';
    if (card.flags?.includes('missing_phone')) return 'Saknar telefon';
    return '—';
  }

  function passesClientFilter(card) {
    if (!state.clientFilter) return true;
    if (state.clientFilter === 'active') return !!card.hasJournalHistory;
    if (state.clientFilter === 'new')
      return card.patientOrigin === 'new' || card.matchStatus === 'unmatched';
    if (state.clientFilter === 'no_journal') return !card.hasJournalHistory;
    return true;
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

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(state.offset),
    });
    if (state.query) params.set('q', state.query);
    if (state.flagFilter) params.set('flags', state.flagFilter);

    try {
      const payload = await api(`/api/v1/cco/staff/customers-shell?${params}`);
      const batch = (payload.patients?.patients || []).filter(Boolean);
      state.stats = payload.stats || state.stats;
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
      renderList();
      renderCounts();
      renderRightPanel();
    }
  }

  async function fetchSegmentTotal(flags) {
    if (!getToken()) return null;
    const params = new URLSearchParams({ limit: '1', offset: '0' });
    if (flags) params.set('flags', flags);
    try {
      const payload = await api(`/api/v1/cco/staff/customers-shell?${params}`);
      return Number(payload.patients?.total ?? 0);
    } catch {
      return null;
    }
  }

  async function refreshSegmentCounts() {
    if (!getToken() || !state.stats) {
      state.segmentTotals = {};
      return;
    }
    const totals = { all: Number(state.stats.totalPatients ?? 0) };
    const jobs = SEGMENTS.filter((s) => s.flags && !s.disabled).map(async (seg) => {
      totals[seg.id] = await fetchSegmentTotal(seg.flags);
    });
    await Promise.all(jobs);
    totals.needs_review = Number(state.stats.needsReview ?? totals.needs_review ?? 0);
    totals.has_drive = await fetchSegmentTotal('has_drive_files');
    state.segmentTotals = totals;
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
        link.title = seg.disabledReason || '';
        countEl.textContent = '—';
      } else {
        link.classList.remove('is-disabled');
        link.title = '';
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
    const rows = state.patients.filter(passesClientFilter);
    if (!rows.length) {
      setListStatus(state.loaded ? 'Inga kunder matchar filtret.' : '', 'info');
      return;
    }

    host.innerHTML = rows
      .map((card) => {
        const st = rowState(card);
        const tags = [];
        if (card.flags?.includes('needs_review')) tags.push({ kind: 'risk', label: 'Granska' });
        if (!card.hasJournalHistory) tags.push({ kind: 'risk', label: 'Saknar journal' });
        if (card.driveLinked) tags.push({ kind: 'cycle', label: 'Drive' });
        if (card.clientoLinked) tags.push({ kind: 'ready', label: 'Cliento' });

        return `
    <div class="customer-row" data-patient-id="${escapeHtml(card.patientId)}" data-customer-id="${escapeHtml(card.patientId)}">
      <span class="cr-avatar" style="background:linear-gradient(180deg,#e8d4ff,#b894e8)">${escapeHtml((displayName(card).slice(0, 2) || '??').toUpperCase())}</span>
      <div>
        <div class="cr-name">${escapeHtml(displayName(card))}</div>
        ${tags.length ? `<div class="cr-name-tags">${tags.map((t) => `<span class="cr-tag cr-tag--${t.kind}">${escapeHtml(t.label)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="cr-meta">
        <div>${escapeHtml(card.primaryEmail || '—')}</div>
        <div class="cr-meta-sub">${escapeHtml(card.primaryPhone || '—')}</div>
      </div>
      <div><span class="cr-status" data-state="${st.state}"><span class="dot"></span>${escapeHtml(st.label)}</span></div>
      <div class="cr-meta">
        <div class="cr-meta-strong">${formatDate(card.updatedAt)}</div>
        <div class="cr-meta-sub">${escapeHtml(MATCH_LABELS[card.matchStatus] || card.matchStatus || '—')}</div>
      </div>
      <div>
        <div class="cr-revenue kunder-revenue-disabled" title="Intäkt/LTV visas när ekonomi är kopplat">—</div>
      </div>
      <div><div class="cr-ai">${escapeHtml(nextStepLabel(card))}</div></div>
      <div class="cr-arrow">›</div>
    </div>`;
      })
      .join('');

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
    const q = state.query.toLowerCase();
    const filtered = state.patients.filter((card) => {
      if (!q) return true;
      const hay = [displayName(card), card.primaryEmail, card.primaryPhone, card.patientId]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    if (!filtered.length) {
      searchPanelList.innerHTML = '<div class="search-empty">Inga träffar i aktuell sida</div>';
      return;
    }
    searchPanelList.innerHTML = filtered
      .slice(0, 20)
      .map(
        (card, i) => `
        <div class="search-result ${i === 0 ? 'is-selected' : ''}" data-patient-id="${escapeHtml(card.patientId)}">
          <div class="search-result-meta">
            <div class="search-result-name">${escapeHtml(displayName(card))}</div>
            <div class="search-result-sub">${escapeHtml(card.primaryEmail || '—')}</div>
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
            <div class="agg-stat-label">Kopplade</div>
            <div class="agg-stat-value">${fmt(stats.matched)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Granska</div>
            <div class="agg-stat-value">${fmt(stats.needsReview)}</div>
          </div>
          <div class="agg-stat">
            <div class="agg-stat-label">Drive only</div>
            <div class="agg-stat-value">${fmt(stats.driveOnly)}</div>
          </div>
        </div>
        <p class="kunder-data-missing" style="margin-top:12px">Intäkt, LTV och AI-insikter är avstängda tills ekonomi/worklist är kopplade.</p>
        <div class="agg-actions">
          <button type="button" class="quick-pill" disabled title="Ej kopplat i P0.1">↓ Exportera urval</button>
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
      <div class="dossier-stat"><div class="dossier-stat-label">Journal</div><div class="dossier-stat-value">${card.hasJournalHistory ? 'Ja' : 'Nej'}</div></div>
      <div class="dossier-stat"><div class="dossier-stat-label">Filer</div><div class="dossier-stat-value">${Number(card.fileSummary?.totalFiles || 0)}</div></div>
    </div>
    <div class="dossier-scroll">
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
      <button type="button" class="quick-pill" disabled>★ AI-bokning (pausad)</button>
      <button type="button" class="quick-pill" disabled>↓ Massåtgärd (pausad)</button>
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
    state.flagFilter = seg.flags || '';
    state.clientFilter = seg.clientFilter || '';
    state.offset = 0;
    fetchShell();
  }

  function bindUi() {
    document.body.dataset.kunderReal = '1';

    const aggInsights = $('.agg-insights');
    if (aggInsights) {
      aggInsights.innerHTML =
        '<p class="kunder-data-missing">AI-insikter och kampanjförslag är avstängda tills worklist-data är kopplad (P0.1).</p>';
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
        if (id === 'alla') {
          applySegment(SEGMENTS[0]);
          return;
        }
        if (id === 'aktiva') {
          state.flagFilter = '';
          state.clientFilter = 'active';
          state.offset = 0;
          fetchShell();
          return;
        }
        if (id === 'nya') {
          state.flagFilter = '';
          state.clientFilter = 'new';
          state.offset = 0;
          fetchShell();
          return;
        }
        if (id === 'risk') {
          applySegment(SEGMENTS.find((s) => s.id === 'risk'));
          return;
        }
        if (id === 'vip' || id === 'dormant' || id === 'saknar-form') return;
        const seg = SEGMENTS.find((s) => s.chip === id || s.id === id);
        if (seg) applySegment(seg);
      });
    });

    $$('.side-link[data-segment]').forEach((link) => {
      link.addEventListener('click', () => {
        if (link.classList.contains('is-disabled')) return;
        $$('.side-link').forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
        const seg = SEGMENTS.find((s) => s.id === link.dataset.segment);
        applySegment(seg || SEGMENTS[0]);
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
        btn.title = 'Ej kopplat i P0.1';
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

    $('#watchWidget')?.classList.add('is-hidden');
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
      body[data-kunder-real="1"] .watch-widget { display:none !important; }
    `;
    document.head.appendChild(style);
  }

  async function boot() {
    injectStyles();
    bindUi();
    await fetchShell();
    await refreshSegmentCounts();
  }

  global.CcoKunderReal = { boot, handlesCustomers: true };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
