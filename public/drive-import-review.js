/* global document, fetch, URLSearchParams */
'use strict';

(() => {
  const API = '/api/v1/ops/cco/drive-import-review';

  let summary = null;
  let queue = [];
  let queueTotal = 0;
  let offset = 0;
  const limit = 50;
  let busy = false;

  const filters = {
    year: 'all',
    mediaKind: 'all',
    fileType: 'all',
    confidence: 'all',
    matchGround: 'all',
    patientId: '',
    q: '',
  };

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'x-cco-role': 'operator',
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }

  function renderShell() {
    const root = document.getElementById('dir-root');
    root.innerHTML = `
      <header>
        <h1>Drive Import Review · R1</h1>
        <p class="dir-muted" data-subtitle>Laddar…</p>
      </header>
      <div class="dir-banner" data-mode-banner>
        <strong>READ-ONLY</strong>
        <p>Ingen statusändring · ingen flytt · ingen radering · ingen auto-koppling · ingen batch-action.</p>
      </div>
      <div data-summary class="dir-metrics"></div>
      <section class="dir-filters" data-filters></section>
      <div class="dir-toolbar">
        <p class="dir-muted" data-queue-meta>—</p>
        <div>
          <button type="button" class="dir-btn" data-prev disabled>Föregående</button>
          <button type="button" class="dir-btn" data-next disabled>Nästa</button>
        </div>
      </div>
      <div class="dir-table-wrap">
        <table class="dir-table">
          <thead>
            <tr>
              <th>Filnamn</th>
              <th>Typ</th>
              <th>Datum</th>
              <th class="hide-sm">Drive-sökväg</th>
              <th>Föreslagen patient</th>
              <th>Confidence</th>
              <th class="hide-sm">Matchning</th>
              <th class="hide-sm">IDs</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-rows>
            <tr><td colspan="10" class="dir-muted">Laddar rader…</td></tr>
          </tbody>
        </table>
      </div>
      <p class="dir-error" data-error hidden></p>`;

    root.querySelector('[data-prev]')?.addEventListener('click', () => {
      offset = Math.max(0, offset - limit);
      loadQueue().catch(showError);
    });
    root.querySelector('[data-next]')?.addEventListener('click', () => {
      if (offset + limit < queueTotal) {
        offset += limit;
        loadQueue().catch(showError);
      }
    });
  }

  function facetOptions(map, labelAll) {
    const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
    return [
      `<option value="all">${escapeHtml(labelAll)}</option>`,
      ...entries.map(
        ([key, count]) =>
          `<option value="${escapeHtml(key)}">${escapeHtml(key)} (${count})</option>`
      ),
    ].join('');
  }

  function renderFilters() {
    const el = document.querySelector('[data-filters]');
    if (!el || !summary) return;
    const facets = summary.facets || {};
    el.innerHTML = `
      <label>År
        <select data-filter-year>${facetOptions(facets.years, 'Alla år')}</select>
      </label>
      <label>Dokument / bilder
        <select data-filter-media-kind>
          <option value="all">Alla</option>
          <option value="document">Dokument (${facets.mediaKinds?.document ?? 0})</option>
          <option value="image">Bilder (${facets.mediaKinds?.image ?? 0})</option>
        </select>
      </label>
      <label>Filtyp
        <select data-filter-file-type>${facetOptions(facets.fileTypes, 'Alla filtyper')}</select>
      </label>
      <label>Confidence
        <select data-filter-confidence>${facetOptions(facets.confidences, 'All confidence')}</select>
      </label>
      <label>Matchningsgrund
        <select data-filter-match-ground>${facetOptions(facets.matchGrounds, 'Alla grunder')}</select>
      </label>
      <label>Föreslagen patient
        <input type="search" data-filter-patient placeholder="patientId eller namn" />
      </label>
      <label>Sök
        <input type="search" data-filter-q placeholder="filnamn, sökväg, id" />
      </label>`;

    el.querySelector('[data-filter-year]').value = filters.year;
    el.querySelector('[data-filter-media-kind]').value = filters.mediaKind;
    el.querySelector('[data-filter-file-type]').value = filters.fileType;
    el.querySelector('[data-filter-confidence]').value = filters.confidence;
    el.querySelector('[data-filter-match-ground]').value = filters.matchGround;
    el.querySelector('[data-filter-patient]').value = filters.patientId;
    el.querySelector('[data-filter-q]').value = filters.q;

    const onChange = () => {
      filters.year = el.querySelector('[data-filter-year]').value;
      filters.mediaKind = el.querySelector('[data-filter-media-kind]').value;
      filters.fileType = el.querySelector('[data-filter-file-type]').value;
      filters.confidence = el.querySelector('[data-filter-confidence]').value;
      filters.matchGround = el.querySelector('[data-filter-match-ground]').value;
      filters.patientId = el.querySelector('[data-filter-patient]').value.trim();
      filters.q = el.querySelector('[data-filter-q]').value.trim();
      offset = 0;
      loadQueue().catch(showError);
    };

    el.querySelectorAll('select').forEach((node) => node.addEventListener('change', onChange));
    el.querySelector('[data-filter-patient]')?.addEventListener('change', onChange);
    el.querySelector('[data-filter-q]')?.addEventListener('change', onChange);
  }

  function renderSummary() {
    const el = document.querySelector('[data-summary]');
    const subtitle = document.querySelector('[data-subtitle]');
    if (!el || !summary) return;
    subtitle.textContent = `NEEDS_REVIEW · drive_import · ${summary.totalNeedsReview?.toLocaleString('sv-SE') || 0} filer`;
    el.innerHTML = `
      <div class="dir-metric"><strong>${summary.totalNeedsReview?.toLocaleString('sv-SE') || 0}</strong><span>Totalt NEEDS_REVIEW</span></div>
      <div class="dir-metric"><strong>${summary.facets?.mediaKinds?.image?.toLocaleString('sv-SE') || 0}</strong><span>Bilder</span></div>
      <div class="dir-metric"><strong>${summary.facets?.mediaKinds?.document?.toLocaleString('sv-SE') || 0}</strong><span>Dokument</span></div>
      <div class="dir-metric"><strong>R1</strong><span>Read-only</span></div>`;
  }

  function renderRows() {
    const tbody = document.querySelector('[data-rows]');
    const meta = document.querySelector('[data-queue-meta]');
    const prev = document.querySelector('[data-prev]');
    const next = document.querySelector('[data-next]');
    if (!tbody) return;

    if (!queue.length) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="dir-muted">Inga rader matchar filtren.</td></tr>';
    } else {
      tbody.innerHTML = queue
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(item.fileName || '—')}</td>
          <td><span class="dir-chip">${escapeHtml(item.fileType || '—')}</span></td>
          <td>${escapeHtml(item.date || '—')}</td>
          <td class="path hide-sm">${escapeHtml(item.drivePath || '—')}</td>
          <td>
            <div>${escapeHtml(item.suggestedPatientLabel || '—')}</div>
            <div class="mono">${escapeHtml(item.suggestedPatientId || '')}</div>
          </td>
          <td>${escapeHtml(item.confidence || '—')}</td>
          <td class="hide-sm">
            <div>${escapeHtml(item.matchGroundLabel || item.matchGround || '—')}</div>
            <div class="mono">${escapeHtml(item.matchGround || '')}</div>
          </td>
          <td class="mono hide-sm">
            <div>${escapeHtml(item.assetId || '')}</div>
            <div>${escapeHtml(item.driveFileId || '')}</div>
          </td>
          <td><span class="dir-chip">${escapeHtml(item.status || 'NEEDS_REVIEW')}</span></td>
          <td>${
            item.customerCardHref
              ? `<a class="dir-link" href="${escapeHtml(item.customerCardHref)}" target="_blank" rel="noopener">Öppna kundkort</a>`
              : '<span class="dir-muted">—</span>'
          }</td>
        </tr>`
        )
        .join('');
    }

    const from = queueTotal ? offset + 1 : 0;
    const to = Math.min(offset + limit, queueTotal);
    meta.textContent = `Visar ${from}–${to} av ${queueTotal.toLocaleString('sv-SE')}`;
    prev.disabled = offset <= 0 || busy;
    next.disabled = offset + limit >= queueTotal || busy;
  }

  function showError(err) {
    const el = document.querySelector('[data-error]');
    if (!el) return;
    el.hidden = false;
    el.textContent = err?.message || String(err);
  }

  function buildQuery() {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      year: filters.year,
      mediaKind: filters.mediaKind,
      fileType: filters.fileType,
      confidence: filters.confidence,
      matchGround: filters.matchGround,
    });
    if (filters.patientId) params.set('patientId', filters.patientId);
    if (filters.q) params.set('q', filters.q);
    return `?${params.toString()}`;
  }

  async function loadQueue() {
    busy = true;
    renderRows();
    const body = await api(`/queue${buildQuery()}`);
    queue = body.items || [];
    queueTotal = body.total || 0;
    busy = false;
    renderRows();
  }

  async function boot() {
    renderShell();
    summary = await api('/summary');
    renderSummary();
    renderFilters();
    await loadQueue();
  }

  boot().catch(showError);
})();
