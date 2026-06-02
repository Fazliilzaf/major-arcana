'use strict';

/**
 * CCO Photo Review — operator mode (read-only prod default · write staging only)
 * Ett beslut per bild · ingen massapproval · ingen auto-approve
 */
(() => {
  if (window.__ARCANA_PHOTO_REVIEW_UI__) return;
  window.__ARCANA_PHOTO_REVIEW_UI__ = true;

  const API = '/api/v1/cco/photo-review';
  const LS_REVIEWER = 'cco-photo-review-reviewer';
  const LS_SESSION = 'cco-photo-review-operator-session';
  const STAGE_FILTERS = [
    { id: 'all', label: 'Alla stadier' },
    { id: 'before', label: 'Före' },
    { id: 'during', label: 'Under' },
    { id: 'after', label: 'Efter' },
    { id: 'follow_up', label: 'Uppföljning' },
    { id: 'unknown', label: 'Okänd' },
  ];
  const BODY_FILTERS = [
    { id: 'all', label: 'Alla bodyArea' },
    { id: 'skalp', label: 'skalp' },
    { id: 'donor', label: 'donor' },
    { id: 'recipient', label: 'recipient' },
    { id: 'hairline', label: 'hairline' },
    { id: 'crown', label: 'crown' },
    { id: 'front', label: 'front' },
    { id: 'sidor', label: 'sidor' },
    { id: 'bak', label: 'bak' },
    { id: 'annat', label: 'annat' },
    { id: 'unknown', label: 'okänd' },
  ];
  const CATEGORIES = [
    { id: 'photo_before', label: 'Före', key: '1', stage: 'before' },
    { id: 'photo_during', label: 'Under', key: '2', stage: 'during' },
    { id: 'photo_after', label: 'Efter', key: '3', stage: 'after' },
  ];
  const MILESTONE_EVERY = 100;

  const sessionStats = { reviewed: 0, approved: 0, rejected: 0, reassigned: 0, viewed: 0 };
  const operatorSession = {
    startedAt: new Date().toISOString(),
    decisions: [],
    patientViewed: {},
    patientDecided: {},
  };

  let writeEnabled = false;
  let fullQueue = [];
  let queue = [];
  let cursor = 0;
  let patients = [];
  let lastMilestone = 0;
  let busy = false;
  let filterStage = 'all';
  let filterBodyArea = 'all';
  let summarySnapshot = null;
  let progressSnapshot = null;

  function headers() {
    const h = { 'content-type': 'application/json', 'x-cco-role': 'operator' };
    const reviewer = window.localStorage?.getItem(LS_REVIEWER);
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
    if (!res.ok) {
      throw new Error(
        body.detail
          ? `${body.error} (${JSON.stringify(body.detail)})`
          : body.error || res.statusText
      );
    }
    return body;
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stageIdFromItem(item) {
    const cat = item?.suggestedCategory || item?.currentCategory;
    if (cat === 'photo_before') return 'before';
    if (cat === 'photo_during') return 'during';
    if (cat === 'photo_after') {
      const hay = `${item?.reason || ''} ${item?.uncertaintyReason || ''}`.toLowerCase();
      if (hay.includes('uppfölj') || hay.includes('follow')) return 'follow_up';
      return 'after';
    }
    return 'unknown';
  }

  function inferBodyArea(item) {
    const hay = `${item?.reason || ''} ${item?.uncertaintyReason || ''}`.toLowerCase();
    const keys = ['skalp', 'donor', 'recipient', 'hairline', 'crown', 'front', 'sidor', 'bak'];
    for (const k of keys) if (hay.includes(k)) return k;
    return 'unknown';
  }

  function applyFilters() {
    queue = fullQueue.filter((item) => {
      if (filterStage !== 'all' && stageIdFromItem(item) !== filterStage) return false;
      if (filterBodyArea !== 'all' && inferBodyArea(item) !== filterBodyArea) return false;
      return true;
    });
    cursor = Math.min(cursor, Math.max(0, queue.length - 1));
  }

  function currentItem() {
    return queue[cursor] || null;
  }

  function getReviewer() {
    return (window.localStorage?.getItem(LS_REVIEWER) || '').trim();
  }

  function recordView(item) {
    if (!item) return;
    sessionStats.viewed += 1;
    operatorSession.patientViewed[item.patientId] =
      (operatorSession.patientViewed[item.patientId] || 0) + 1;
    persistOperatorSession();
  }

  function pushDecisionAudit(entry) {
    operatorSession.decisions.unshift(entry);
    if (operatorSession.decisions.length > 50) operatorSession.decisions.length = 50;
    const pid = entry.patientId;
    if (pid) {
      operatorSession.patientDecided[pid] = (operatorSession.patientDecided[pid] || 0) + 1;
    }
    persistOperatorSession();
    renderSessionPanel();
  }

  function persistOperatorSession() {
    try {
      window.localStorage?.setItem(
        LS_SESSION,
        JSON.stringify({
          ...operatorSession,
          sessionStats: { ...sessionStats },
          filterStage,
          filterBodyArea,
          exportedNote: 'Ingen patientdata — endast ids/hash',
        })
      );
    } catch {
      /* quota */
    }
    window.__ARCANA_PHOTO_REVIEW_SESSION_STATS__ = { ...sessionStats, operatorSession };
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

  function readWriteMeta() {
    const stage = document.querySelector('[data-stage-select]')?.value || '';
    const bodyArea = document.querySelector('[data-body-select]')?.value || '';
    return { imageStage: stage, bodyArea };
  }

  function validateWriteReady(action) {
    if (!writeEnabled) return false;
    const reviewer = getReviewer();
    if (!reviewer || reviewer.length < 2) {
      window.alert('Reviewer krävs (minst 2 tecken) för audit.');
      return false;
    }
    if (action === 'approve' || action === 'reassign') {
      const meta = readWriteMeta();
      if (!meta.imageStage) {
        window.alert('Stage krävs (före/under/efter/uppföljning).');
        return false;
      }
      if (!meta.bodyArea || meta.bodyArea === 'unknown') {
        window.alert('bodyArea krävs — välj anatomiskt område.');
        return false;
      }
    }
    return true;
  }

  function patientProgressRows() {
    const byPatient = new Map();
    for (const item of queue) {
      if (!byPatient.has(item.patientId)) {
        byPatient.set(item.patientId, {
          patientId: item.patientId,
          pending: 0,
          viewed: 0,
          decided: 0,
        });
      }
      byPatient.get(item.patientId).pending += 1;
    }
    for (const [pid, n] of Object.entries(operatorSession.patientViewed)) {
      if (!byPatient.has(pid))
        byPatient.set(pid, { patientId: pid, pending: 0, viewed: 0, decided: 0 });
      byPatient.get(pid).viewed = n;
    }
    for (const [pid, n] of Object.entries(operatorSession.patientDecided)) {
      if (!byPatient.has(pid))
        byPatient.set(pid, { patientId: pid, pending: 0, viewed: 0, decided: 0 });
      byPatient.get(pid).decided = n;
    }
    return [...byPatient.values()].sort((a, b) => b.pending - a.pending);
  }

  function updateProgressUI(progress, summary) {
    const pending = progress?.pendingPhotos ?? summary?.pendingPhotos ?? queue.length;
    const totalPatients =
      progress?.patientsWithPendingPhotos ?? summary?.patientsWithPendingPhotos ?? patients.length;
    const dec = progress?.decisions || {
      total: sessionStats.reviewed,
      approve: sessionStats.approved,
      reject: sessionStats.rejected,
      reassign: sessionStats.reassigned,
    };

    const bar = document.querySelector('[data-progress-bar]');
    const label = document.querySelector('[data-progress-label]');
    const stats = document.querySelector('[data-progress-stats]');
    const op = document.querySelector('[data-operator-progress]');
    const pct = pending + dec.total ? Math.round((dec.total / (dec.total + pending)) * 100) : 0;
    if (bar) bar.style.width = `${Math.min(pct, 100)}%`;
    if (label) {
      label.textContent = `${dec.total} beslut · ${pending} kvar · ${progress?.visiblePhotosAfterReview ?? summary?.photosVisibleCount ?? 0} VISIBLE · ${totalPatients} kunder`;
    }
    if (stats) {
      stats.innerHTML = `
        <span>✓ ${dec.approve || 0}</span>
        <span>✗ ${dec.reject || 0}</span>
        <span>↻ ${dec.reassign || 0}</span>
        <span>${cursor + 1}/${queue.length} i filter</span>
        <span>session visade ${sessionStats.viewed}</span>`;
    }
    if (op) {
      const cur = currentItem();
      const pid = cur?.patientId;
      const pRows = patientProgressRows();
      const curRow = pRows.find((r) => r.patientId === pid);
      op.innerHTML = `
        <strong>Operator progress</strong>
        <p class="cco-photo-review-muted">Totalt kö: ${fullQueue.length} bilder · ${new Set(fullQueue.map((i) => i.patientId)).size} kunder · filter: ${queue.length} bilder</p>
        ${
          curRow
            ? `<p>Aktiv patient <code>${escapeHtml(pid?.slice(-12) || '')}</code>: ${curRow.viewed} visade · ${curRow.decided} beslut · ${curRow.pending} kvar i filter</p>`
            : ''
        }`;
    }
  }

  function maybeReportMilestone(progress) {
    const total = progress?.decisions?.total ?? sessionStats.reviewed;
    const milestone = Math.floor(total / MILESTONE_EVERY);
    if (milestone > lastMilestone && milestone > 0) {
      lastMilestone = milestone;
      const msg = `[Photo Review milestone ${milestone * MILESTONE_EVERY}] reviewed=${total}`;
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

  function exportSessionBatchReport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: writeEnabled ? 'write' : 'read_only',
      reviewer: getReviewer() || null,
      summary: {
        pendingPhotos: summarySnapshot?.pendingPhotos,
        patientsWithPendingPhotos: summarySnapshot?.patientsWithPendingPhotos,
        photosVisibleCount: summarySnapshot?.photosVisibleCount,
        writeEnabled,
      },
      filters: { stage: filterStage, bodyArea: filterBodyArea },
      sessionStats: { ...sessionStats },
      decisions: operatorSession.decisions,
      patientViewed: operatorSession.patientViewed,
      patientDecided: operatorSession.patientDecided,
      rules: {
        autoApprove: false,
        massApproval: false,
        oneDecisionPerImage: true,
      },
      note: 'Ingen journaltext · ingen patientdata — endast ids',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-review-session-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushDecisionAudit({
      at: new Date().toISOString(),
      action: 'export_session',
      patientId: null,
      assetId: null,
    });
  }

  function renderSessionPanel() {
    const el = document.querySelector('[data-session-panel]');
    if (!el) return;
    const dec = operatorSession.decisions.slice(0, 6);
    el.innerHTML = `
      <h3>Session (operatör)</h3>
      <p class="cco-photo-review-muted">Beslut denna session: approve ${sessionStats.approved} · reject ${sessionStats.rejected} · reassign ${sessionStats.reassigned} · visade ${sessionStats.viewed}</p>
      ${
        dec.length
          ? `<ul class="cco-photo-review-session-list">${dec
              .map(
                (d) =>
                  `<li><strong>${escapeHtml(d.action)}</strong> · ${escapeHtml(d.assetId || 'export')} · ${escapeHtml(d.reviewer || getReviewer() || '—')}</li>`
              )
              .join('')}</ul>`
          : '<p class="cco-photo-review-muted">Inga beslut ännu — read-only navigering räknas inte som approve.</p>'
      }
      <button type="button" class="cco-photo-review-export-btn" data-export-session>Exportera batchrapport (JSON)</button>`;
    el.querySelector('[data-export-session]')?.addEventListener('click', exportSessionBatchReport);
  }

  function renderFocus(item) {
    const detail = document.querySelector('[data-focus-detail]');
    if (!detail) return;
    if (!item) {
      detail.innerHTML = '<p class="cco-photo-review-muted">Inga bilder i aktuellt filter.</p>';
      return;
    }
    recordView(item);

    const preview = item.previewAvailable
      ? `<img src="${escapeHtml(item.previewUrl)}" alt="" class="cco-photo-review-focus-img" />`
      : `<div class="cco-photo-review-preview-missing">Saknar preview (storageKey/checksum)</div>`;

    const stageOpts = STAGE_FILTERS.filter((s) => s.id !== 'all')
      .map(
        (s) =>
          `<option value="${s.id}"${stageIdFromItem(item) === s.id ? ' selected' : ''}>${s.label}</option>`
      )
      .join('');
    const bodyOpts = BODY_FILTERS.filter((b) => b.id !== 'all')
      .map(
        (b) =>
          `<option value="${b.id}"${inferBodyArea(item) === b.id ? ' selected' : ''}>${b.label}</option>`
      )
      .join('');

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
          <label class="cco-photo-review-reason-label">Stage (krävs)
            <select data-stage-select>${stageOpts}</select>
          </label>
          <label class="cco-photo-review-reason-label">bodyArea (krävs)
            <select data-body-select>${bodyOpts}</select>
          </label>
          <label class="cco-photo-review-reassign-cat">Omkategori
            <select data-category-select>
              ${CATEGORIES.map(
                (c) =>
                  `<option value="${c.id}"${item.suggestedCategory === c.id || item.currentCategory === c.id ? ' selected' : ''}>${c.label}</option>`
              ).join('')}
            </select>
          </label>`
      : `<p class="cco-photo-review-readonly-focus">
          <strong>READ-ONLY — inga approve-knappar · inga tangentbordsgodkännanden.</strong>
          Navigera kö för operativ beta. Write av på prod.</p>`;

    detail.innerHTML = `
      <div class="cco-photo-review-focus">
        <div class="cco-photo-review-focus-preview">${preview}</div>
        <div class="cco-photo-review-focus-meta">
          <p class="cco-photo-review-day1">Ej klinisk dag 1 — migrerad Drive-bild tills manuellt granskad och VISIBLE.</p>
          <p class="cco-photo-review-warning">${escapeHtml(item.notApprovedWarning)}</p>
          <dl class="cco-photo-review-dl">
            <div><dt>Patient</dt><dd><code>${escapeHtml(item.patientId)}</code></dd></div>
            <div><dt>Batch</dt><dd>${escapeHtml(item.batchLabel || '—')}</dd></div>
            <div><dt>Stadium</dt><dd>${escapeHtml(stageIdFromItem(item))} · bodyArea ${escapeHtml(inferBodyArea(item))}</dd></div>
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
            <button type="button" data-nav-prev title="P / ←">← Föregående bild</button>
            <button type="button" data-nav-next title="N / →">Nästa bild →</button>
            <button type="button" data-nav-next-patient title="Shift+N">Nästa patient →</button>
          </div>
          <p class="cco-photo-review-muted cco-photo-review-shortcuts">
            ${writeEnabled ? '1/2/3 godkänn · R avvisa · C omkategori · ' : ''}N/P navigera bild · Shift+N nästa patient
          </p>
        </div>
      </div>`;

    if (writeEnabled) {
      detail.querySelectorAll('[data-quick-approve]').forEach((btn) => {
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
    detail
      .querySelector('[data-nav-next-patient]')
      ?.addEventListener('click', () => navigateNextPatient());
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
    const cur = currentItem();
    el.innerHTML = `
      <h2>Patientkö (${patients.length})</h2>
      <ul class="cco-photo-review-patient-list">
        ${patients
          .map((p) => {
            const firstIdx = queue.findIndex((q) => q.patientId === p.patientId);
            const active = cur?.patientId === p.patientId;
            const viewed = operatorSession.patientViewed[p.patientId] || 0;
            const decided = operatorSession.patientDecided[p.patientId] || 0;
            return `<li><button type="button" class="cco-photo-review-patient-btn${active ? ' is-active' : ''}" data-goto="${firstIdx}">
              <span>${escapeHtml(p.patientId.slice(-10))}</span>
              <span>${p.count} bild · ${viewed} vis · ${decided} beslut</span></button></li>`;
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

  function renderFilterBar() {
    const el = document.querySelector('[data-filter-bar]');
    if (!el) return;
    el.innerHTML = `
      <label>Stadium
        <select data-filter-stage>
          ${STAGE_FILTERS.map(
            (s) =>
              `<option value="${s.id}"${filterStage === s.id ? ' selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </label>
      <label>bodyArea
        <select data-filter-body>
          ${BODY_FILTERS.map(
            (b) =>
              `<option value="${b.id}"${filterBodyArea === b.id ? ' selected' : ''}>${b.label}</option>`
          ).join('')}
        </select>
      </label>
      <button type="button" data-apply-filter>Tillämpa filter</button>
      <button type="button" data-clear-filter>Rensa</button>`;
    el.querySelector('[data-filter-stage]')?.addEventListener('change', (ev) => {
      filterStage = ev.target.value;
      applyFilters();
      cursor = 0;
      renderPatientList();
      renderFocus(currentItem());
      updateProgressUI(progressSnapshot, summarySnapshot);
    });
    el.querySelector('[data-filter-body]')?.addEventListener('change', (ev) => {
      filterBodyArea = ev.target.value;
      applyFilters();
      cursor = 0;
      renderPatientList();
      renderFocus(currentItem());
      updateProgressUI(progressSnapshot, summarySnapshot);
    });
    el.querySelector('[data-clear-filter]')?.addEventListener('click', () => {
      filterStage = 'all';
      filterBodyArea = 'all';
      applyFilters();
      cursor = 0;
      renderFilterBar();
      renderPatientList();
      renderFocus(currentItem());
    });
  }

  async function refreshQueue() {
    const [summary, queueData, progress] = await Promise.all([
      api('/summary'),
      api('/queue'),
      api('/progress'),
    ]);
    fullQueue = queueData.items || [];
    summarySnapshot = summary;
    progressSnapshot = progress;
    applyFilters();
    if (cursor >= queue.length) cursor = Math.max(0, queue.length - 1);
    writeEnabled = !!summary.writeEnabled;
    updateProgressUI(progress, summary);
    updateReadOnlyBanner(summary);
    renderFilterBar();
    renderPatientList();
    renderFocus(currentItem());
    renderSessionPanel();
    return { summary, progress };
  }

  function updateReadOnlyBanner(summary) {
    const banner = document.querySelector('[data-readonly-banner]');
    const badge = document.querySelector('[data-write-badge]');
    if (badge) {
      badge.textContent = summary?.writeEnabled
        ? 'WRITE PÅ — ett beslut per bild'
        : 'READ-ONLY — operator beta (inga beslut sparas)';
      badge.classList.toggle('cco-photo-review-badge-readonly', !summary?.writeEnabled);
      badge.classList.toggle('cco-photo-review-badge-write', !!summary?.writeEnabled);
    }
    if (!banner) return;
    banner.hidden = !!summary?.writeEnabled;
    if (!summary?.writeEnabled) {
      const pending = summary?.pendingPhotos ?? summary?.pendingPhotosAll ?? '—';
      const pts = summary?.patientsWithPendingPhotos ?? '—';
      const visible = summary?.photosVisibleCount ?? 0;
      banner.innerHTML = `
        <strong>Operator mode — read-only</strong>
        <p>${pending} pending · ${pts} kunder · ${visible} VISIBLE · ingen auto-approve · ingen massapproval · inga godkänn-knappar.</p>`;
    }
  }

  function navigate(delta) {
    cursor = Math.max(0, Math.min(queue.length - 1, cursor + delta));
    renderFocus(currentItem());
    renderPatientList();
  }

  function navigateNextPatient() {
    const item = currentItem();
    if (!item || !queue.length) return;
    const ids = [...new Set(queue.map((q) => q.patientId))];
    const idx = ids.indexOf(item.patientId);
    const nextId = ids[idx + 1] || ids[0];
    const firstIdx = queue.findIndex((q) => q.patientId === nextId);
    if (firstIdx >= 0) {
      cursor = firstIdx;
      renderFocus(currentItem());
      renderPatientList();
    }
  }

  async function decide(action, categoryOverride) {
    if (busy || !writeEnabled) return;
    if (!validateWriteReady(action)) return;
    const item = currentItem();
    if (!item) return;
    const reason = readReason();
    if (!reason) return;
    const meta = readWriteMeta();

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
      const bodyBase = { reason, imageStage: meta.imageStage, bodyArea: meta.bodyArea };
      if (action === 'approve') {
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/decide`, {
          method: 'POST',
          body: JSON.stringify({
            decision: 'approve',
            category: categoryOverride,
            ...bodyBase,
          }),
        });
        sessionStats.approved += 1;
      } else if (action === 'reject') {
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/decide`, {
          method: 'POST',
          body: JSON.stringify({ decision: 'reject', ...bodyBase }),
        });
        sessionStats.rejected += 1;
      } else {
        const category = document.querySelector('[data-category-select]')?.value;
        result = await api(`/assets/${encodeURIComponent(item.assetId)}/reassign`, {
          method: 'POST',
          body: JSON.stringify({ category, reason, alsoApprove: false, ...bodyBase }),
        });
        sessionStats.reassigned += 1;
      }
      sessionStats.reviewed += 1;
      pushDecisionAudit({
        at: new Date().toISOString(),
        action,
        assetId: item.assetId,
        patientId: item.patientId,
        reviewer: getReviewer(),
        category: categoryOverride || null,
        imageStage: meta.imageStage,
        bodyArea: meta.bodyArea,
      });
      if (result.progress) {
        updateProgressUI(result.progress);
        maybeReportMilestone(result.progress);
      }
      queue.splice(cursor, 1);
      fullQueue = fullQueue.filter((q) => q.assetId !== item.assetId);
      if (cursor >= queue.length) cursor = Math.max(0, queue.length - 1);
      const refreshed = await refreshQueue();
      maybeReportMilestone(refreshed.progress);
    } catch (err) {
      window.alert(`Fel: ${err.message}`);
    } finally {
      busy = false;
    }
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('textarea, input, select')) {
        if (ev.key === 'Enter' && ev.metaKey) ev.preventDefault();
        return;
      }
      if (busy) return;
      if (writeEnabled && ev.key === '1') void decide('approve', 'photo_before');
      else if (writeEnabled && ev.key === '2') void decide('approve', 'photo_during');
      else if (writeEnabled && ev.key === '3') void decide('approve', 'photo_after');
      else if (writeEnabled && (ev.key === 'r' || ev.key === 'R')) void decide('reject');
      else if (writeEnabled && (ev.key === 'c' || ev.key === 'C')) void decide('reassign');
      else if (ev.key === 'N' && ev.shiftKey) navigateNextPatient();
      else if (ev.key === 'n' || ev.key === 'ArrowRight') navigate(1);
      else if (ev.key === 'p' || ev.key === 'ArrowLeft') navigate(-1);
    });
  }

  async function mount(root = document.getElementById('cco-photo-review-root')) {
    if (!root) return;
    root.innerHTML = `
      <header class="cco-photo-review-header">
        <div class="cco-photo-review-header-row">
          <h1>Bildgranskning — operator</h1>
          <span class="cco-photo-review-badge" data-write-badge>—</span>
        </div>
        <div class="cco-photo-review-readonly-banner" data-readonly-banner hidden></div>
        <p class="cco-photo-review-muted">860 pending · 150 kunder · 0 VISIBLE · ett beslut i taget · ingen massapproval</p>
        <label class="cco-photo-review-reviewer">Reviewer (audit)
          <input type="text" data-reviewer-input value="${escapeHtml(getReviewer())}" placeholder="ditt namn" />
        </label>
        <div class="cco-photo-review-filter-bar" data-filter-bar></div>
        <div class="cco-photo-review-progress-wrap">
          <div class="cco-photo-review-progress-bar"><div data-progress-bar class="cco-photo-review-progress-fill"></div></div>
          <p data-progress-label class="cco-photo-review-progress-label">Laddar…</p>
          <p data-progress-stats class="cco-photo-review-progress-stats"></p>
          <div data-operator-progress class="cco-photo-review-operator-progress"></div>
        </div>
        <aside data-session-panel class="cco-photo-review-session-panel"></aside>
      </header>
      <div class="cco-photo-review-layout cco-photo-review-layout-focus">
        <aside data-patient-groups class="cco-photo-review-patients"></aside>
        <main data-focus-detail class="cco-photo-review-detail"></main>
      </div>`;

    root.querySelector('[data-reviewer-input]')?.addEventListener('change', (ev) => {
      window.localStorage?.setItem(LS_REVIEWER, ev.target.value.trim());
    });

    bindKeyboard();
    await refreshQueue();
    window.CcoPhotoReview = {
      mount,
      refreshQueue,
      getSessionStats: () => ({ ...sessionStats, operatorSession }),
      exportSessionBatchReport,
    };
    window.__ARCANA_PHOTO_REVIEW_SESSION_STATS__ = sessionStats;
  }

  window.CcoPhotoReview = { mount, refreshQueue, getSessionStats: () => ({ ...sessionStats }) };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => mount());
  else void mount();
})();
