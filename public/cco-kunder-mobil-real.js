/**
 * P0.5 — Mobil Kunder (/m-kunder.html)
 * Same customers-shell API as desktop — no mock data.
 */
(function (global) {
  'use strict';

  const PAGE_SIZE = 50;
  const SEARCH_PAGE_SIZE = 40;
  const TENANT_ID = 'hairtpclinic';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const MINE_OWNER_KEY = 'ARCANA_CCO_MINE_OWNER';
  const LOGIN_HREF = '/major-arcana-preview/index.html';

  const MOBILE_CHIP_IDS = [
    'all',
    'mine',
    'needs_review',
    'today_visits',
    'this_week',
    'waitlist',
    'treatment_fue',
    'treatment_dhi',
    'treatment_prp',
    'treatment_microneedling',
    'treatment_consultation',
    'treatment_followup',
    'treatment_curatiio',
    'missing_journal',
    'missing_form',
    'missing_encounter',
    'photos_review',
    'getaccept',
    'halso',
    'has_drive_journal',
    'has_drive_document',
  ];

  const MATCH_LABELS = {
    matched: 'Kopplad',
    cliento_only: 'Cliento',
    drive_only: 'Drive',
    needs_review: 'Granska',
    web_booking: 'Webbokning',
    unmatched: 'Ny',
  };

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
    segments: [],
    segmentById: {},
    loading: false,
    loaded: false,
    authRequired: false,
    error: '',
    selectedPatientId: '',
  };

  function $(id) {
    return document.getElementById(id);
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
    try {
      return (localStorage.getItem(MINE_OWNER_KEY) || '').trim();
    } catch {
      return '';
    }
  }

  function shellQueryParams(limit) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(state.offset) });
    if (state.query) params.set('q', state.query);
    if (state.flagFilter) params.set('flags', state.flagFilter);
    const activeSeg = state.segmentById[state.activeSegmentId];
    if (activeSeg?.segment) params.set('segment', activeSeg.segment);
    const assignedOwner = getAssignedOwner();
    if (assignedOwner) params.set('assignedOwner', assignedOwner);
    return params;
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
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
      return d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' });
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

  function mergeSegmentsFromApi(apiSegments) {
    const list = Array.isArray(apiSegments) ? apiSegments : [];
    return list.map((seg) => {
      const fq = seg.filterQuery || {};
      const disabled = seg.status === 'disabled' || seg.status === 'missing';
      return {
        id: seg.id,
        label: seg.label || seg.id,
        flags: fq.flags || '',
        segment: fq.segment || '',
        disabled,
        disabledReason: seg.reason || '',
        count: seg.count,
        status: seg.status,
      };
    });
  }

  function contactLine(card) {
    const email = card.emailMasked || card.primaryEmail || null;
    const phone = card.phoneMasked || card.primaryPhone || null;
    if (!email && !phone) return { main: 'Kontakt saknas', sub: '' };
    return { main: email || '—', sub: phone || '' };
  }

  function rowBadges(card) {
    const tags = [];
    if (card.flags?.includes('needs_review') || card.reviewFlags?.includes('needs_review')) {
      tags.push({ kind: 'risk', label: 'Granska' });
    }
    if (card.missingJournal) tags.push({ kind: 'risk', label: 'Saknar journal' });
    if (card.missingForm) tags.push({ kind: 'warn', label: 'Saknar formulär' });
    if (card.missingAgreement) tags.push({ kind: 'warn', label: 'Saknar avtal' });
    if (card.needsPhotoReview) tags.push({ kind: 'risk', label: 'Bild-review' });
    if (card.needsClassification) tags.push({ kind: 'risk', label: 'Klassificering' });
    if (card.needsEncounterReview || card.missingEncounterForBooking) {
      tags.push({ kind: 'risk', label: 'Encounter' });
    }
    if (card.hasGetAccept) tags.push({ kind: 'ready', label: 'GetAccept' });
    if (card.hasHalso) tags.push({ kind: 'ready', label: 'halso@' });
    if (card.todayVisit) tags.push({ kind: 'ready', label: 'Idag' });
    if (card.onWaitlist) tags.push({ kind: 'warn', label: 'Väntelista' });
    if (card.readyForVisit === true) tags.push({ kind: 'ready', label: 'Redo' });
    if (card.isMinePatient) tags.push({ kind: 'ready', label: 'Min kund' });
    else if (card.ownerName) tags.push({ kind: 'cycle', label: card.ownerName });
    return tags;
  }

  function statusLabel(card) {
    if (card.flags?.includes('needs_review')) return 'Granska';
    if (card.hasJournal || card.hasJournalHistory) return 'Aktiv';
    return MATCH_LABELS[card.matchStatus] || 'Kund';
  }

  function treatmentLine(card) {
    if (card.treatmentTypes?.length) return card.treatmentTypes.join(', ');
    if (card.nextBookingType) return card.nextBookingType;
    if (card.hasUpcomingBooking && card.nextBookingAt) {
      return `Bokning ${formatDateTime(card.nextBookingAt)}`;
    }
    if (card.lastVisitAt) return `Senast ${formatDate(card.lastVisitAt)}`;
    return '—';
  }

  function showAuth(show) {
    const el = $('mkAuthBanner');
    if (!el) return;
    if (!show) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.className = 'mk-auth';
    el.innerHTML = `<strong>Inloggning krävs.</strong><a href="${LOGIN_HREF}">Logga in</a>`;
  }

  function renderSegmentChips() {
    const host = $('mkSegmentChips');
    if (!host) return;
    const chips = state.segments.filter((s) => MOBILE_CHIP_IDS.includes(s.id));
    const fmt = (n) => (n == null ? '' : ` ${Number(n).toLocaleString('sv-SE')}`);
    host.innerHTML = chips
      .map((seg) => {
        const active = seg.id === state.activeSegmentId;
        const disabled = seg.disabled;
        const count = disabled ? '' : fmt(seg.count ?? state.segmentTotals[seg.id]);
        return `<button type="button" class="mk-seg${active ? ' is-active' : ''}" data-segment="${escapeHtml(seg.id)}" ${disabled ? 'disabled' : ''} title="${escapeHtml(seg.disabledReason || '')}">${escapeHtml(seg.label)}${count}</button>`;
      })
      .join('');
    host.querySelectorAll('[data-segment]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        applySegment(state.segmentById[btn.dataset.segment] || { id: 'all' });
      });
    });
  }

  function applySegment(seg) {
    if (!seg || seg.disabled) return;
    state.activeSegmentId = seg.id;
    state.flagFilter = seg.flags || '';
    state.offset = 0;
    state.patients = [];
    renderSegmentChips();
    fetchShell();
  }

  async function fetchShell({ append = false } = {}) {
    if (!getToken()) {
      state.authRequired = true;
      showAuth(true);
      renderList('Logga in för att hämta kunder.');
      return;
    }
    showAuth(false);
    if (state.loading) return;
    state.loading = true;
    state.error = '';
    if (!append) {
      state.offset = 0;
      state.patients = [];
    }

    const limit = state.query ? SEARCH_PAGE_SIZE : PAGE_SIZE;
    const params = shellQueryParams(limit);
    if (state.activeSegmentId === 'mine' && !getAssignedOwner()) {
      state.error = '';
      state.patients = [];
      state.total = 0;
      state.loaded = true;
      state.loading = false;
      renderSegmentChips();
      renderList('Mina kunder: sätt ARCANA_CCO_MINE_OWNER (Kräver ägare per kund · P1).');
      updateMeta();
      return;
    }

    try {
      const payload = await api(`/api/v1/cco/staff/customers-shell?${params}`);
      const batch = (payload.patients?.patients || []).filter((p) => p?.patientId);
      state.stats = payload.stats || state.stats;
      if (payload.segmentStats) {
        state.segmentStats = payload.segmentStats;
        state.segments = mergeSegmentsFromApi(payload.segmentStats.segments);
        state.segmentById = Object.fromEntries(state.segments.map((s) => [s.id, s]));
        state.segmentTotals = {
          ...(payload.segmentStats.counts || {}),
          all: Number(state.stats?.totalPatients ?? payload.segmentStats.counts?.all ?? 0),
        };
      }
      state.total = Number(payload.patients?.total ?? batch.length);
      state.patients = append ? state.patients.concat(batch) : batch;
      state.loaded = true;
      state.offset = state.patients.length;
      state.error = '';
    } catch (err) {
      state.error = err.message || 'Kunde inte hämta kunder';
      if (err.statusCode === 401 || err.statusCode === 403) {
        state.authRequired = true;
        showAuth(true);
      }
      if (!append) state.patients = [];
    } finally {
      state.loading = false;
      renderSegmentChips();
      renderList();
      updateMeta();
    }
  }

  function updateMeta() {
    const totalEl = $('mkTotal');
    if (totalEl) {
      totalEl.textContent =
        state.stats?.totalPatients != null
          ? `${Number(state.stats.totalPatients).toLocaleString('sv-SE')} totalt`
          : '—';
    }
    const meta = $('mkListMeta');
    if (meta) {
      const seg = state.segmentById[state.activeSegmentId];
      if (state.query) {
        meta.textContent = `Sök “${state.query}” · ${state.patients.length} av ${state.total}`;
      } else if (seg && !seg.disabled) {
        meta.textContent = `${seg.label} · ${state.patients.length} av ${state.total}`;
      } else {
        meta.textContent = `${state.patients.length} av ${state.total} kunder`;
      }
    }
    const more = $('mkLoadMore');
    if (more) more.hidden = state.patients.length >= state.total;
  }

  function renderList(msg) {
    const host = $('mkCustomerList');
    if (!host) return;
    if (msg) {
      host.innerHTML = `<div class="mk-empty">${escapeHtml(msg)}</div>`;
      return;
    }
    if (state.error && !state.patients.length) {
      host.innerHTML = `<div class="mk-empty">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!state.patients.length && state.loaded) {
      host.innerHTML = '<div class="mk-empty">Inga kunder matchar filtret.</div>';
      return;
    }
    if (state.loading && !state.patients.length) {
      host.innerHTML = '<div class="mk-empty">Hämtar kunder…</div>';
      return;
    }

    host.innerHTML = state.patients
      .map((card) => {
        const contact = contactLine(card);
        const tags = rowBadges(card);
        return `
      <article class="mk-row" data-patient-id="${escapeHtml(card.patientId)}" role="button" tabindex="0">
        <div class="mk-avatar">${escapeHtml((displayName(card).slice(0, 2) || '??').toUpperCase())}</div>
        <div>
          <div class="mk-name">${escapeHtml(displayName(card))}</div>
          <div class="mk-sub">${escapeHtml(contact.main)}${contact.sub ? ` · ${escapeHtml(contact.sub)}` : ''}</div>
          <div class="mk-status"><span class="dot"></span>${escapeHtml(statusLabel(card))}</div>
          <div class="mk-sub">Journal: ${card.hasJournal ? 'Ja' : 'Nej'} · Form: ${card.hasForm ? 'Ja' : card.missingForm ? 'Saknas' : '—'}</div>
          <div class="mk-sub">${escapeHtml(treatmentLine(card))}</div>
          ${tags.length ? `<div class="mk-tags">${tags.map((t) => `<span class="mk-tag mk-tag--${t.kind}">${escapeHtml(t.label)}</span>`).join('')}</div>` : ''}
          <div class="mk-step">${escapeHtml(card.nextStep || '—')}</div>
        </div>
        <div class="mk-chevron">›</div>
      </article>`;
      })
      .join('');

    host.querySelectorAll('.mk-row').forEach((row) => {
      const open = () => {
        const card = state.patients.find((p) => p.patientId === row.dataset.patientId);
        if (card) openDossier(card);
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          open();
        }
      });
    });
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
      other: 'Övrigt',
    };

    function assetBadges(a) {
      const parts = [];
      if (a.status === 'NEEDS_REVIEW') parts.push('needsReview');
      if (a.importReviewRequired) parts.push('needsClassification');
      if (a.photoReviewRequired) parts.push('needsPhotoReview');
      if (a.encounterReviewRequired) parts.push('needsEncounterReview');
      if (a.sourceSystem) parts.push(a.sourceSystem);
      return parts;
    }

    async function load(host, patientId) {
      const body = host.querySelector('[data-mk-assets-body]');
      const loading = host.querySelector('[data-mk-assets-loading]');
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
        const countEl = host.querySelector('[data-mk-assets-count]');
        if (countEl) countEl.textContent = String(items.length);
        if (body) {
          body.innerHTML =
            items.length === 0
              ? '<p class="mk-data-missing">Inga filer i CCO storage.</p>'
              : items
                  .slice(0, 60)
                  .map((a) => {
                    const badges = assetBadges(a)
                      .map((b) => `<span class="cco-assets-badge">${escapeHtml(b)}</span>`)
                      .join('');
                    return `<div style="margin:6px 0;font-size:12px">${escapeHtml(CATEGORY_LABEL[a.category] || a.category)} ${badges}</div>`;
                  })
                  .join('');
        }
      } catch (err) {
        if (loading) loading.remove();
        if (body) body.innerHTML = `<p class="mk-data-missing">${escapeHtml(err.message)}</p>`;
      }
    }

    return { load };
  })();

  async function openDossier(card) {
    if (!card?.patientId) return;
    state.selectedPatientId = card.patientId;
    const sheet = $('mkDossier');
    const titleHost = $('mkDossierTitle');
    const body = $('mkDossierBody');
    if (!sheet || !titleHost || !body) return;

    const name = displayName(card);
    const contact = contactLine(card);
    const actionCtx = { tenantId: TENANT_ID, role: getRole(), surface: 'mobile' };
    const dossierBar = global.CcoKunderActions?.buildDossierBar(card, actionCtx) || [];
    const dossierActionsHtml = global.CcoKunderActions
      ? global.CcoKunderActions.renderMatrixLegend(dossierBar) +
        global.CcoKunderActions.renderActionsHtml(dossierBar, {
          linkClass: 'mk-actions',
          buttonClass: 'mk-actions',
        })
      : '';
    titleHost.innerHTML = `
      <h2>${escapeHtml(name)}</h2>
      <p>${escapeHtml(contact.main)} · ${escapeHtml(card.patientId)}</p>`;

    body.innerHTML = `
      <section class="mk-panel">
        <h3>Identitet</h3>
        <div class="mk-grid2">
          <div>Status<br><strong>${escapeHtml(MATCH_LABELS[card.matchStatus] || '—')}</strong></div>
          <div>Journal<br><strong>${card.hasJournal ? 'Ja' : 'Nej'}</strong></div>
          <div>Formulär<br><strong>${card.hasForm ? 'Ja' : card.missingForm ? 'Saknas' : '—'}</strong></div>
          <div>Avtal<br><strong>${card.hasAgreement ? 'Ja' : card.missingAgreement ? 'Saknas' : '—'}</strong></div>
        </div>
        <div class="mk-tags" style="margin-top:8px">${rowBadges(card)
          .map((t) => `<span class="mk-tag mk-tag--${t.kind}">${escapeHtml(t.label)}</span>`)
          .join('')}</div>
        <p class="mk-data-missing" style="margin-top:8px">Nästa steg: ${escapeHtml(card.nextStep || '—')}</p>
      </section>
      <section class="mk-panel">
        <h3>Bokning &amp; encounter</h3>
        <div class="mk-grid2">
          <div>Kommande<br><strong>${card.hasUpcomingBooking ? escapeHtml(formatDateTime(card.nextBookingAt)) : '—'}</strong></div>
          <div>Encounter<br><strong>${escapeHtml(card.encounterId || '—')}</strong></div>
          <div>Senast besök<br><strong>${escapeHtml(formatDate(card.lastVisitAt))}</strong></div>
          <div>Ärende<br><strong>${escapeHtml(card.bookingCaseStatus || '—')}</strong></div>
        </div>
        ${card.missingEncounterForBooking ? '<p class="mk-data-missing">Kommande bokning utan encounter.</p>' : ''}
      </section>
      <section class="mk-panel">
        <h3>Åtgärder</h3>
        <div class="mk-actions" data-kunder-actions-host>${dossierActionsHtml}</div>
        ${
          card.journalBlocked
            ? `<p class="mk-data-missing">Spärrad åtkomst: ${escapeHtml(card.journalBlockReason || 'journal spärrad')}</p>`
            : ''
        }
      </section>
      <section class="mk-panel" id="mkJournalPanel">
        <h3>Journal</h3>
        <div id="mk-journal-feed-mount"></div>
      </section>
      <section class="mk-panel" id="mkAssetsPanel" data-mk-assets-host data-patient-id="${escapeHtml(card.patientId)}">
        <h3>Assets <span data-mk-assets-count>…</span></h3>
        <p class="mk-data-missing" data-mk-assets-loading>Hämtar…</p>
        <div data-mk-assets-body></div>
      </section>
      <section class="mk-panel" data-mk-komm-host data-customer-id="${escapeHtml(card.patientId)}">
        <h3>Kommunikation</h3>
        <p class="mk-data-missing">Laddar…</p>
      </section>`;

    sheet.hidden = false;
    document.body.style.overflow = 'hidden';

    const actionsHost = body.querySelector('[data-kunder-actions-host]');
    if (actionsHost && global.CcoKunderActions) {
      global.CcoKunderActions.bindDossierHandlers(actionsHost, {
        scrollAssets: () => {
          $('mkAssetsPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        scrollCommunication: () => {
          body
            .querySelector('[data-mk-komm-host]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    }

    const assetsHost = body.querySelector('[data-mk-assets-host]');
    if (assetsHost) ASSETS.load(assetsHost, card.patientId);

    const jMount = $('mk-journal-feed-mount');
    if (jMount && global.CcoJournalFeed) {
      try {
        global.CcoJournalFeed.mount(jMount, {
          customerId: card.patientId,
          tenantId: TENANT_ID,
          headers: { 'x-cco-role': getRole(), 'x-cco-tenant': TENANT_ID },
        });
      } catch (e) {
        jMount.innerHTML = `<p class="mk-data-missing">${escapeHtml(e.message)}</p>`;
      }
    } else if (jMount) {
      jMount.innerHTML = '<p class="mk-data-missing">Journal-feed ej tillgänglig.</p>';
    }

    const kommHost = body.querySelector('[data-mk-komm-host]');
    if (kommHost && global.CcoKommPanel) {
      try {
        await global.CcoKommPanel.mount(kommHost, {
          customerId: card.patientId,
          tenantId: TENANT_ID,
          role: getRole(),
        });
      } catch (e) {
        kommHost.innerHTML = `<p class="mk-data-missing">${escapeHtml(e.message)}</p>`;
      }
    }

    history.replaceState(null, '', `?patientId=${encodeURIComponent(card.patientId)}`);
  }

  function closeDossier() {
    const sheet = $('mkDossier');
    if (sheet) sheet.hidden = true;
    document.body.style.overflow = '';
    state.selectedPatientId = '';
    const params = new URLSearchParams(window.location.search);
    params.delete('patientId');
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  function bindUi() {
    $('mkDossierBack')?.addEventListener('click', closeDossier);

    let searchTimer = null;
    $('mkSearch')?.addEventListener('input', (ev) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = ev.target.value.trim();
        state.offset = 0;
        state.patients = [];
        fetchShell();
      }, 280);
    });

    $('mkLoadMore')?.addEventListener('click', () => fetchShell({ append: true }));

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !$('mkDossier')?.hidden) closeDossier();
    });
  }

  async function boot() {
    bindUi();
    state.segments = mergeSegmentsFromApi([
      { id: 'all', label: 'Alla', status: 'real', filterQuery: {}, count: null },
    ]);
    state.segmentById = Object.fromEntries(state.segments.map((s) => [s.id, s]));
    renderSegmentChips();
    await fetchShell();

    const pid = new URLSearchParams(window.location.search).get('patientId');
    if (pid) {
      let card = state.patients.find((p) => p.patientId === pid);
      if (!card && getToken()) {
        try {
          const payload = await api(
            `/api/v1/cco/staff/customers-shell?limit=1&offset=0&q=${encodeURIComponent(pid)}`
          );
          card = (payload.patients?.patients || []).find((p) => p.patientId === pid);
        } catch {
          card = null;
        }
      }
      if (card) openDossier(card);
    }
  }

  global.CcoKunderMobilReal = { boot, handlesMobileCustomers: true };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
