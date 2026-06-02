'use strict';

/**
 * CCO Photo Review — Fas 2 full manual review (861 photos / 150 patients)
 * Single-asset decisions only — no bulk.
 */
(() => {
  if (window.__ARCANA_PHOTO_REVIEW_UI__) return;
  window.__ARCANA_PHOTO_REVIEW_UI__ = true;

  const API = '/api/v1/cco/photo-review';
  const CATEGORIES = [
    { id: 'photo_before', label: 'Före', key: '1' },
    { id: 'photo_during', label: 'Under', key: '2' },
    { id: 'photo_after', label: 'Efter', key: '3' },
  ];
  const MILESTONE_EVERY = 100;

  const sessionStats = { reviewed: 0, approved: 0, rejected: 0, reassigned: 0 };
  let writeEnabled = false;
  let queue = [];
  let cursor = 0;
  let patients = [];
  let lastMilestone = 0;
  let busy = false;

  function headers() {
    const h = { 'content-type': 'application/json', 'x-cco-role': 'operator' };
    const reviewer = window.localStorage?.getItem('cco-photo-review-reviewer');
    if (reviewer) h['x-cco-user'] = reviewer;
    return h;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: headers(),
      ...opts,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        body.detail
          ? `${body.error} (${JSON.stringify(body.detail)})`
          : body.error || res.statusText
      );
    return body;
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentItem() {
    return queue[cursor] || null;
  }

  function defaultReason(action) {
    const item = currentItem();
    const cat = item?.suggestedCategory || 'photo_during';
    if (action === 'approve') return `Manuell godkännande ${cat}`;
    if (action === 'reject') return 'Manuell avvisning — ej lämplig för patientkort';
    return 'Manuell omkategorisering';
  }

  function readReason() {
    const el = document.querySelector('[data-reason-input]');
    const reason = el?.value?.trim() || defaultReason();
    if (reason.length < 3) {
      window.alert('Reason krävs (minst 3 tecken).');
      return null;
    }
    return reason.slice(0, 500);
  }

  function updateProgressUI(progress, summary) {
    const pending = progress?.pendingPhotos ?? summary?.pendingPhotos ?? queue.length;
    const total = summary?.pendingPhotosAll ?? pending;
    const dec = progress?.decisions || {
      total: sessionStats.reviewed,
      approve: sessionStats.approved,
      reject: sessionStats.rejected,
      reassign: sessionStats.reassigned,
    };

    const bar = document.querySelector('[data-progress-bar]');
    const label = document.querySelector('[data-progress-label]');
    const stats = document.querySelector('[data-progress-stats]');
    const pct = total ? Math.round((dec.total / (dec.total + pending)) * 100) : 0;
    if (bar) bar.style.width = `${Math.min(pct, 100)}%`;
    if (label) {
      label.textContent = `${dec.total} beslut · ${pending} kvar · ${progress?.visiblePhotosAfterReview ?? 0} VISIBLE`;
    }
    if (stats) {
      stats.innerHTML = `
        <span>✓ ${dec.approve || 0}</span>
        <span>✗ ${dec.reject || 0}</span>
        <span>↻ ${dec.reassign || 0}</span>
        <span>${cursor + 1}/${queue.length} i kö</span>`;
    }
  }

  function maybeReportMilestone(progress) {
    const total = progress?.decisions?.total ?? sessionStats.reviewed;
    const milestone = Math.floor(total / MILESTONE_EVERY);
    if (milestone > lastMilestone && milestone > 0) {
      lastMilestone = milestone;
      const msg = `[Photo Review milestone ${milestone * MILESTONE_EVERY}] reviewed=${total} approved=${progress?.decisions?.approve} rejected=${progress?.decisions?.reject} reassigned=${progress?.decisions?.reassign} remaining=${progress?.pendingPhotos} visible=${progress?.visiblePhotosAfterReview}`;
      console.info(msg);
      window.__ARCANA_PHOTO_REVIEW_MILESTONES__ = window.__ARCANA_PHOTO_REVIEW_MILESTONES__ || [];
      window.__ARCANA_PHOTO_REVIEW_MILESTONES__.push({
        at: new Date().toISOString(),
        count: milestone * MILESTONE_EVERY,
        progress,
        sessionStats: { ...sessionStats },
      });
    }
  }

  function renderFocus(item) {
    const detail = document.querySelector('[data-focus-detail]');
    if (!detail) return;
    if (!item) {
      detail.innerHTML = '<p class="cco-photo-review-muted">Inga bilder kvar i review-kön.</p>';
      return;
    }

    const preview = item.previewAvailable
      ? `<img src="${escapeHtml(item.previewUrl)}" alt="" class="cco-photo-review-focus-img" />`
      : `<div class="cco-photo-review-preview-missing">Saknar preview (storageKey/checksum)</div>`;

    const actionsBlock = writeEnabled
      ? `
          <div class="cco-photo-review-quick-actions">
            ${CATEGORIES.map(
              (c) =>
                `<button type="button" class="cco-photo-review-approve" data-quick-approve="${c.id}" title="Tangent ${c.key}">Godkänn ${c.label} [${c.key}]</button>`
            ).join('')}
            <button type="button" class="cco-photo-review-reject" data-quick-reject title="R">Avvisa [R]</button>
            <button type="button" class="cco-photo-review-reassign" data-quick-reassign title="C">Byt kategori [C]</button>
          </div>
          <label class="cco-photo-review-reassign-cat">Omkategori
            <select data-category-select>
              ${CATEGORIES.map(
                (c) =>
                  `<option value="${c.id}"${item.suggestedCategory === c.id || item.currentCategory === c.id ? ' selected' : ''}>${c.label}</option>`
              ).join('')}
            </select>
          </label>`
      : `<p class="cco-photo-review-readonly-focus">
          <strong>Endast visning.</strong> Godkännande/avvisning är avstängt (read-only).
          Använd inte bilden kliniskt dag 1.</p>`;

    detail.innerHTML = `
      <div class="cco-photo-review-focus">
        <div class="cco-photo-review-focus-preview">${preview}</div>
        <div class="cco-photo-review-focus-meta">
          <p class="cco-photo-review-day1">Ej klinisk dag 1 — migrerad Drive-bild tills manuellt granskad och VISIBLE.</p>
          <p class="cco-photo-review-warning">${escapeHtml(item.notApprovedWarning)}</p>
          <dl class="cco-photo-review-dl">
            <div><dt>Patient</dt><dd><code>${escapeHtml(item.patientId)}</code></dd></div>
            <div><dt>Batch</dt><dd>${escapeHtml(item.batchLabel || '—')}</dd></div>
            <div><dt>Föreslagen</dt><dd>${escapeHtml(item.suggestedCategory)} (${escapeHtml(item.confidence)})</dd></div>
            <div><dt>Osäkerhet</dt><dd>${escapeHtml(item.uncertaintyReason)}</dd></div>
            <div><dt>assetId</dt><dd><code>${escapeHtml(item.assetId)}</code></dd></div>
            <div><dt>Storage</dt><dd>${item.hasStorageKey && item.hasChecksum ? 'OK' : '<span class="cco-photo-review-alert">Saknas</span>'}</dd></div>
          </dl>
          ${
            writeEnabled
              ? `<label class="cco-photo-review-reason-label">Reason / kommentar
            <textarea data-reason-input rows="2" placeholder="Krävs för varje beslut">${escapeHtml(defaultReason('approve'))}</textarea>
          </label>`
              : ''
          }
          ${actionsBlock}
          <div class="cco-photo-review-nav-actions">
            <button type="button" data-nav-prev title="P / ←">← Föregående</button>
            <button type="button" data-nav-next title="N / →">Nästa →</button>
          </div>
          <p class="cco-photo-review-muted cco-photo-review-shortcuts">
            ${writeEnabled ? '1/2/3 godkänn · R avvisa · C omkategori · ' : ''}N/P eller pilar navigera (visning alltid)
          </p>
        </div>
      </div>`;

    if (writeEnabled) {
      detail
        .querySelector('[data-quick-approve]')
        ?.parentElement?.querySelectorAll('[data-quick-approve]')
        .forEach((btn) => {
          btn.addEventListener('click', () => void decide('approve', btn.dataset.quickApprove));
        });
      detail
        .querySelector('[data-quick-reject]')
        ?.addEventListener('click', () => void decide('reject'));
      detail
        .querySelector('[data-quick-reassign]')
        ?.addEventListener('click', () => void decide('reassign'));
    }
    detail.querySelector('[data-nav-prev]')?.addEventListener('click', () => navigate(-1));
    detail.querySelector('[data-nav-next]')?.addEventListener('click', () => navigate(1));
  }

  function renderPatientList() {
    const el = document.querySelector('[data-patient-groups]');
    if (!el) return;
    const byPatient = new Map();
    for (const item of queue) {
      if (!byPatient.has(item.patientId))
        byPatient.set(item.patientId, {
          patientId: item.patientId,
          batchLabel: item.batchLabel,
          count: 0,
        });
      byPatient.get(item.patientId).count += 1;
    }
    patients = [...byPatient.values()].sort((a, b) => b.count - a.count);
    el.innerHTML = `
      <h2>Patienter (${patients.length})</h2>
      <ul class="cco-photo-review-patient-list">
        ${patients
          .map((p, idx) => {
            const firstIdx = queue.findIndex((q) => q.patientId === p.patientId);
            const active =
              cursor >= firstIdx &&
              (idx === patients.length - 1 ||
                cursor < queue.findIndex((q) => q.patientId === patients[idx + 1]?.patientId));
            return `<li><button type="button" class="cco-photo-review-patient-btn${active ? ' is-active' : ''}" data-goto="${firstIdx}">
              <span>${escapeHtml(p.patientId.slice(-10))}</span><span>${p.count}</span></button></li>`;
          })
          .join('')}
      </ul>`;
    el.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cursor = Number(btn.dataset.goto) || 0;
        renderFocus(currentItem());
        renderPatientList();
      });
    });
  }

  async function refreshQueue() {
    const [summary, queueData, progress] = await Promise.all([
      api('/summary'),
      api('/queue'),
      api('/progress'),
    ]);
    queue = queueData.items || [];
    if (cursor >= queue.length) cursor = Math.max(0, queue.length - 1);
    writeEnabled = !!summary.writeEnabled;
    updateProgressUI(progress, summary);
    updateReadOnlyBanner(summary);
    renderPatientList();
    renderFocus(currentItem());
    return { summary, progress };
  }

  function updateReadOnlyBanner(summary) {
    const banner = document.querySelector('[data-readonly-banner]');
    const badge = document.querySelector('[data-write-badge]');
    if (badge) {
      badge.textContent = summary?.writeEnabled
        ? 'Fas 2 — skriv aktiv (manuellt, en bild i taget)'
        : 'READ-ONLY inför möte — inga beslut sparas';
      badge.classList.toggle('cco-photo-review-badge-readonly', !summary?.writeEnabled);
    }
    if (!banner) return;
    banner.hidden = !!summary?.writeEnabled;
    if (!summary?.writeEnabled) {
      const pending = summary?.pendingPhotos ?? summary?.pendingPhotosAll ?? '—';
      const patients = summary?.patientsWithPendingPhotos ?? '—';
      const visible = summary?.photosVisibleCount ?? 0;
      banner.innerHTML = `
        <strong>Dag 1 — inte kliniska behandlingsbilder</strong>
        <p>Migrerade före/efter-bilder får <em>inte</em> användas kliniskt före manuell Photo Review.
        Status: <strong>${pending}</strong> pending · <strong>${patients}</strong> kunder ·
        <strong>${visible}</strong> VISIBLE på kundkort.
        Ingen auto-approve · ingen massapproval · write av på prod.</p>`;
    }
  }

  function navigate(delta) {
    cursor = Math.max(0, Math.min(queue.length - 1, cursor + delta));
    renderFocus(currentItem());
    renderPatientList();
  }

  async function decide(action, categoryOverride) {
    if (busy || !writeEnabled) return;
    const item = currentItem();
    if (!item) return;
    const reason = readReason();
    if (!reason) return;

    if (action === 'approve' && (!item.hasStorageKey || !item.hasChecksum)) {
      window.alert('STOPP: saknar storageKey/checksum — kan inte godkännas.');
      return;
    }
    if (
      action === 'approve' &&
      !window.confirm(`Godkänn EN bild som ${categoryOverride || 'vald kategori'}?`)
    )
      return;
    if (action === 'reject' && !window.confirm('Avvisa EN bild?')) return;

    busy = true;
    try {
      let result;
      if (action === 'approve') {
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/decide`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'approve', category: categoryOverride, reason }),
        });
        sessionStats.approved += 1;
      } else if (action === 'reject') {
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/decide`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'reject', reason }),
        });
        sessionStats.rejected += 1;
      } else {
        const category = document.querySelector('[data-category-select]')?.value;
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/reassign`, {
          method: 'POST',
          body: JSON.stringify({ category, reason, alsoApprove: false }),
        });
        sessionStats.reassigned += 1;
      }
      sessionStats.reviewed += 1;
      if (result.progress) {
        updateProgressUI(result.progress);
        maybeReportMilestone(result.progress);
      }
      queue.splice(cursor, 1);
      if (cursor >= queue.length) cursor = Math.max(0, queue.length - 1);
      const refreshed = await refreshQueue();
      maybeReportMilestone(refreshed.progress);
    } catch (err) {
      window.alert(`Fel: ${err.message}`);
      if (/audit|storageKey|checksum|patientId|pilot_decision|bulk/i.test(err.message)) {
        console.error('[Photo Review STOP]', err.message);
      }
    } finally {
      busy = false;
    }
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('textarea, input')) {
        if (ev.key === 'Enter' && ev.metaKey) ev.preventDefault();
        return;
      }
      if (busy) return;
      if (writeEnabled && ev.key === '1') void decide('approve', 'photo_before');
      else if (writeEnabled && ev.key === '2') void decide('approve', 'photo_during');
      else if (writeEnabled && ev.key === '3') void decide('approve', 'photo_after');
      else if (writeEnabled && (ev.key === 'r' || ev.key === 'R')) void decide('reject');
      else if (writeEnabled && (ev.key === 'c' || ev.key === 'C')) void decide('reassign');
      else if (ev.key === 'n' || ev.key === 'ArrowRight') navigate(1);
      else if (ev.key === 'p' || ev.key === 'ArrowLeft') navigate(-1);
    });
  }

  async function mount(root = document.getElementById('cco-photo-review-root')) {
    if (!root) return;
    root.innerHTML = `
      <header class="cco-photo-review-header">
        <div class="cco-photo-review-header-row">
          <h1>Bildgranskning</h1>
          <span class="cco-photo-review-badge cco-photo-review-badge-write" data-write-badge>Fas 2 — Full manuell review</span>
        </div>
        <div class="cco-photo-review-readonly-banner" data-readonly-banner hidden></div>
        <p class="cco-photo-review-muted">860 bilder pending · 150 kunder · 0 VISIBLE · ett beslut i taget · ingen massapproval</p>
        <label class="cco-photo-review-reviewer">Reviewer (audit)
          <input type="text" data-reviewer-input value="${escapeHtml(window.localStorage?.getItem('cco-photo-review-reviewer') || '')}" placeholder="ditt namn" />
        </label>
        <div class="cco-photo-review-progress-wrap">
          <div class="cco-photo-review-progress-bar"><div data-progress-bar class="cco-photo-review-progress-fill"></div></div>
          <p data-progress-label class="cco-photo-review-progress-label">Laddar…</p>
          <p data-progress-stats class="cco-photo-review-progress-stats"></p>
        </div>
      </header>
      <div class="cco-photo-review-layout cco-photo-review-layout-focus">
        <aside data-patient-groups class="cco-photo-review-patients"></aside>
        <main data-focus-detail class="cco-photo-review-detail"></main>
      </div>`;

    root.querySelector('[data-reviewer-input]')?.addEventListener('change', (ev) => {
      window.localStorage?.setItem('cco-photo-review-reviewer', ev.target.value.trim());
    });

    bindKeyboard();
    await refreshQueue();
    window.__ARCANA_PHOTO_REVIEW_SESSION_STATS__ = sessionStats;
  }

  window.CcoPhotoReview = { mount, refreshQueue, getSessionStats: () => ({ ...sessionStats }) };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => mount());
  else void mount();
})();
