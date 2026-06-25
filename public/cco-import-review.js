/* global document, fetch, window */
'use strict';

(() => {
  const API = '/api/v1/ops/cco/import-review';

  const LS_REVIEWER = 'cco-import-review-reviewer';

  let summary = null;
  let queue = [];
  let queueTotal = 0;
  let cursor = 0;
  let sourceFilter = 'all';
  let busy = false;
  let writeEnabled = false;

  function getReviewer() {
    return (window.localStorage?.getItem(LS_REVIEWER) || '').trim();
  }

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path, opts = {}) {
    const reviewer = getReviewer();
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      method: opts.method || 'GET',
      headers: {
        Accept: 'application/json',
        'x-cco-role': 'operator',
        ...(reviewer ? { 'x-cco-user': reviewer } : {}),
        ...(opts.headers || {}),
      },
      body: opts.body,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }

  function currentItem() {
    return queue[cursor] || null;
  }

  function renderShell() {
    const root = document.getElementById('cir-root');
    root.innerHTML = `
      <header>
        <h1>Import Review Queue</h1>
        <p class="cir-muted" data-subtitle>Laddar kö…</p>
      </header>
      <div class="cir-banner" data-mode-banner>
        <strong>Laddar läge…</strong>
      </div>
      <label class="cir-muted">Reviewer (audit)
        <input type="text" data-reviewer value="${escapeHtml(getReviewer())}" placeholder="ditt namn" />
      </label>
      <div data-summary class="cir-metrics"></div>
      <div class="cir-layout">
        <aside class="cir-queue">
          <h2>Kö</h2>
          <label class="cir-muted">Källa
            <select data-source-filter>
              <option value="all">Alla (halso@ + GetAccept)</option>
              <option value="halso">halso@</option>
              <option value="getaccept">GetAccept</option>
            </select>
          </label>
          <p class="cir-muted" data-queue-meta>—</p>
          <ul class="cir-queue-list" data-queue-list></ul>
          <button type="button" class="cir-btn" data-load-more hidden>Ladda fler</button>
        </aside>
        <section class="cir-detail" data-detail>
          <p class="cir-muted">Välj rad i kön…</p>
        </section>
      </div>
      <p class="cir-error" data-error hidden></p>`;

    root.querySelector('[data-source-filter]')?.addEventListener('change', (ev) => {
      sourceFilter = ev.target.value;
      loadQueue({ reset: true }).catch(showError);
    });
    root.querySelector('[data-load-more]')?.addEventListener('click', () => {
      loadQueue({ append: true }).catch(showError);
    });
    root.querySelector('[data-reviewer]')?.addEventListener('change', (ev) => {
      window.localStorage?.setItem(LS_REVIEWER, ev.target.value.trim());
    });
  }

  function updateModeBanner() {
    const el = document.querySelector('[data-mode-banner]');
    if (!el) return;
    if (writeEnabled) {
      const rem = summary?.canary?.decisionsRemaining ?? '—';
      el.innerHTML = `<strong>CANARY WRITE PÅ</strong><p>Max 25 beslut · ${rem} kvar · endast stark kundmatch · ingen ny kund.</p>`;
    } else {
      el.innerHTML =
        '<strong>READ-ONLY — write AV</strong><p>Actions disabled tills ENABLE_CCO_OPERATOR_CANARY + ENABLE_IMPORT_REVIEW_WRITE.</p>';
    }
  }

  async function decide(action) {
    const item = currentItem();
    if (!item || !writeEnabled || busy) return;
    const reviewer = getReviewer();
    if (reviewer.length < 2) {
      window.alert('Reviewer krävs.');
      return;
    }
    let reason = '';
    if (action === 'reject_match') {
      reason = window.prompt('Reason (minst 3 tecken):', '') || '';
      if (reason.trim().length < 3) return;
    }
    if (!window.confirm(`Bekräfta ${action} för ${item.id}?`)) return;
    busy = true;
    try {
      await api('/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, action, reason, reviewer }),
      });
      await loadSummary();
      await loadQueue({ append: false });
    } catch (err) {
      showError(err);
    } finally {
      busy = false;
    }
  }

  function renderSummary() {
    const el = document.querySelector('[data-summary]');
    const subtitle = document.querySelector('[data-subtitle]');
    if (!el || !summary) return;
    const sources = (summary.sources || [])
      .map(
        (s) =>
          `<div class="cir-metric"><strong>${escapeHtml(s.queueCount)}</strong><span>${escapeHtml(s.label)} · pending ${escapeHtml(s.status?.pending ?? '—')}</span></div>`
      )
      .join('');
    const writeLabel = writeEnabled ? 'PÅ (canary)' : 'AV';
    el.innerHTML = `
      <div class="cir-metric"><strong>${escapeHtml(summary.total)}</strong><span>osäkra kundmatchningar (operator-scope)</span></div>
      ${sources}
      <div class="cir-metric"><strong>${writeLabel}</strong><span>write · ${escapeHtml(summary.statusLabel || summary.status)}</span></div>`;
    if (subtitle) {
      subtitle.textContent = `${summary.total} osäkra kundmatchningar (halso@ + GetAccept) · ${writeEnabled ? 'canary write PÅ' : 'read-only'} · manuell batch · ingen auto-import · ingen ny kund`;
    }
  }

  function renderQueueList() {
    const list = document.querySelector('[data-queue-list]');
    const meta = document.querySelector('[data-queue-meta]');
    if (!list) return;
    list.innerHTML = queue
      .map((item, i) => {
        const active = i === cursor;
        const sug = item.suggestedPatientId ? item.suggestedPatientId.slice(-10) : 'ingen';
        return `<li><button type="button" class="cir-queue-btn${active ? ' is-active' : ''}" data-idx="${i}">
          <span>${escapeHtml(item.sourceLabel)}</span> · ${escapeHtml(item.reasonLabel?.slice(0, 28) || item.reason)}<br/>
          <span class="cir-muted">${escapeHtml((item.documentName || '').slice(0, 40))} · förslag …${escapeHtml(sug)}</span>
        </button></li>`;
      })
      .join('');
    list.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        cursor = Number(btn.dataset.idx) || 0;
        renderQueueList();
        renderDetail();
      });
    });
    if (meta) {
      meta.textContent = `${cursor + 1}/${queue.length} i vyn · ${queueTotal} totalt i filter · källa: ${sourceFilter}`;
    }
    const more = document.querySelector('[data-load-more]');
    if (more) more.hidden = queue.length >= queueTotal;
  }

  function renderDetail() {
    const el = document.querySelector('[data-detail]');
    const item = currentItem();
    if (!el) return;
    if (!item) {
      el.innerHTML = '<p class="cir-muted">Inga rader i vyn.</p>';
      return;
    }
    const reqs = (item.approvalRequirements || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    const actions = (item.preparedActions || [])
      .map(
        (a) =>
          `<button type="button" class="cir-btn" data-action="${escapeHtml(a.id)}" ${a.enabled ? '' : 'disabled'} title="${escapeHtml(a.note)}">${escapeHtml(a.id)}</button>`
      )
      .join('');

    el.innerHTML = `
      <h2>${escapeHtml(item.sourceLabel)} · ${escapeHtml(item.kind || '—')}</h2>
      <dl class="cir-dl">
        <dt>Status</dt><dd>${escapeHtml(item.status)}</dd>
        <dt>Varför osäker</dt><dd>${escapeHtml(item.reasonLabel)} (${escapeHtml(item.reason)})</dd>
        <dt>Konfidens</dt><dd>${escapeHtml(item.matchConfidence)}</dd>
        <dt>Föreslagen kund</dt><dd>${item.suggestedPatientId ? `<code>${escapeHtml(item.suggestedPatientId)}</code>` : '<em class="cir-muted">Ingen — manuell match krävs</em>'}</dd>
        <dt>Dokument</dt><dd>${escapeHtml(item.documentName || '—')}</dd>
        <dt>ID</dt><dd><code>${escapeHtml(item.id)}</code></dd>
      </dl>
      <div class="cir-requirements">
        <strong>Vad som krävs för godkännande</strong>
        <ul>${reqs}</ul>
        <p class="cir-muted">Ingen ny kund · ingen auto-import</p>
      </div>
      <div class="cir-actions">
        ${actions}
        <a class="cir-btn" href="/cco-ops-workbench.html">Tillbaka ops workbench</a>
      </div>
      <div class="cir-actions">
        <button type="button" class="cir-btn" data-nav-prev ${cursor <= 0 ? 'disabled' : ''}>← Föregående</button>
        <button type="button" class="cir-btn" data-nav-next ${cursor >= queue.length - 1 ? 'disabled' : ''}>Nästa →</button>
      </div>`;

    el.querySelector('[data-nav-prev]')?.addEventListener('click', () => {
      cursor = Math.max(0, cursor - 1);
      renderQueueList();
      renderDetail();
    });
    el.querySelector('[data-nav-next]')?.addEventListener('click', () => {
      cursor = Math.min(queue.length - 1, cursor + 1);
      renderQueueList();
      renderDetail();
    });
    el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => decide(btn.dataset.action));
    });
  }

  function showError(err) {
    const el = document.querySelector('[data-error]');
    if (!el) return;
    el.hidden = false;
    el.textContent = err?.message || String(err);
  }

  async function loadSummary() {
    summary = await api('/summary');
    writeEnabled = !!summary.writeEnabled;
    renderSummary();
    updateModeBanner();
  }

  async function loadQueue({ append = false } = {}) {
    if (busy) return;
    busy = true;
    try {
      const offset = append ? queue.length : 0;
      const body = await api(
        `/queue?source=${encodeURIComponent(sourceFilter)}&status=pending&limit=50&offset=${offset}`
      );
      queueTotal = body.total ?? 0;
      if (append) queue = queue.concat(body.items || []);
      else {
        queue = body.items || [];
        cursor = 0;
      }
      renderQueueList();
      renderDetail();
    } finally {
      busy = false;
    }
  }

  async function boot() {
    renderShell();
    await loadSummary();
    await loadQueue({ append: false });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => boot().catch(showError));
  else boot().catch(showError);
})();
