(function () {
  'use strict';

  const API = '/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review';
  const TENANT = new URLSearchParams(window.location.search).get('tenantId') || 'hair-tp-clinic';
  const LS_REVIEWER = 'cco-ambiguous-mail-reviewer';

  let summary = null;
  let queue = [];
  let currentIndex = 0;
  let selectedCandidateId = null;
  let busy = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getReviewer() {
    return (window.localStorage?.getItem(LS_REVIEWER) || '').trim();
  }

  function setReviewer(value) {
    window.localStorage?.setItem(LS_REVIEWER, value.trim());
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      ...opts,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }

  function currentItem() {
    return queue[currentIndex] || null;
  }

  function renderShell() {
    const root = document.getElementById('amr-root');
    root.innerHTML = `
      <div class="amr-shell">
        <header class="amr-header">
          <h1>Ambiguous Mail Enrichment Review</h1>
          <p class="amr-muted">493-raderskö · manuellt beslut · minst 3 deterministiska fält för approve · ingen auto-merge</p>
        </header>
        <div class="amr-field">
          <label>Reviewer <input data-reviewer value="${escapeHtml(getReviewer())}" placeholder="owner@..." /></label>
        </div>
        <div data-stats class="amr-stats"></div>
        <div class="amr-layout">
          <aside class="amr-queue">
            <h2>Kö</h2>
            <div class="amr-field">
              <select data-mailbox-filter>
                <option value="">Alla mailboxar</option>
              </select>
            </div>
            <ul class="amr-queue-list" data-queue-list></ul>
          </aside>
          <section class="amr-detail" data-detail>
            <p class="amr-muted">Laddar…</p>
          </section>
        </div>
        <p class="amr-error" data-error hidden></p>
      </div>`;

    root.querySelector('[data-reviewer]').addEventListener('change', (event) => {
      setReviewer(event.target.value);
    });
    root.querySelector('[data-mailbox-filter]').addEventListener('change', () => {
      loadQueue().catch(showError);
    });
  }

  function renderStats() {
    const el = document.querySelector('[data-stats]');
    if (!el || !summary) return;
    const m = summary.mailboxCounts || {};
    el.innerHTML = `
      <div class="amr-stat"><strong>${summary.ambiguousTotal ?? '—'}</strong><span class="amr-muted">ambiguous total</span></div>
      <div class="amr-stat"><strong>${summary.pending ?? '—'}</strong><span class="amr-muted">pending</span></div>
      <div class="amr-stat"><strong>${summary.approved ?? 0}</strong><span class="amr-muted">approved</span></div>
      <div class="amr-stat"><strong>${(summary.unresolved ?? 0) + (summary.ownerAcceptedUnresolved ?? 0)}</strong><span class="amr-muted">unresolved</span></div>
      <div class="amr-stat"><strong>${summary.excluded ?? 0}</strong><span class="amr-muted">excluded</span></div>
      <div class="amr-stat"><strong>${summary.coverage?.adjustedCoveragePercent ?? '—'}%</strong><span class="amr-muted">adjusted coverage</span></div>
      <div class="amr-stat"><strong>${summary.report?.readyForWork ? 'true' : 'false'}</strong><span class="amr-muted">readyForWork</span></div>
      <div class="amr-stat"><strong>${m['contact@hairtpclinic.com'] ?? m['contact@'] ?? 0}</strong><span class="amr-muted">contact@</span></div>
      <div class="amr-stat"><strong>${m['egzona@hairtpclinic.com'] ?? 0}</strong><span class="amr-muted">egzona@</span></div>`;
  }

  function renderQueueList() {
    const list = document.querySelector('[data-queue-list]');
    const filter = document.querySelector('[data-mailbox-filter]');
    if (!list) return;
    const cur = currentItem();
    list.innerHTML = queue
      .map(
        (item, idx) => `<li>
          <button type="button" class="amr-queue-item${cur?.conversationKey === item.conversationKey ? ' is-active' : ''}" data-idx="${idx}">
            <div>${escapeHtml(item.mailboxId || '')}</div>
            <div class="amr-muted">${escapeHtml(item.conversationId || item.conversationKey || '')}</div>
            <div class="amr-muted">${escapeHtml(item.ambiguityReason || '')}</div>
          </button>
        </li>`
      )
      .join('');

    list.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentIndex = Number(btn.getAttribute('data-idx'));
        selectedCandidateId = null;
        renderDetail();
        renderQueueList();
      });
    });

    if (filter && summary?.mailboxCounts) {
      const current = filter.value;
      const options = ['<option value="">Alla mailboxar</option>']
        .concat(
          Object.entries(summary.mailboxCounts)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([mailbox, count]) =>
                `<option value="${escapeHtml(mailbox)}">${escapeHtml(mailbox)} (${count})</option>`
            )
        )
        .join('');
      filter.innerHTML = options;
      filter.value = current;
    }
  }

  function renderDetail() {
    const el = document.querySelector('[data-detail]');
    const item = currentItem();
    if (!el) return;
    if (!item) {
      el.innerHTML = '<p class="amr-muted">Ingen rad i kön.</p>';
      return;
    }

    const candidates = (item.candidates || [])
      .map(
        (
          candidate
        ) => `<div class="amr-candidate${candidate.approvable ? ' approvable' : ''}${candidate.rejected ? ' rejected' : ''}">
          <label>
            <input type="radio" name="candidate" value="${escapeHtml(candidate.candidateId)}" ${selectedCandidateId === candidate.candidateId ? 'checked' : ''} ${candidate.rejected ? 'disabled' : ''} />
            <strong>${escapeHtml(candidate.source || 'candidate')}</strong>
            ${candidate.approvable ? '<span class="amr-tag">approvable</span>' : '<span class="amr-tag">needs ≥3 fields</span>'}
          </label>
          <div class="amr-muted">matchCount: ${candidate.matchCount} · receivedAt: ${escapeHtml(candidate.receivedAt || candidate.sentAt || '—')}</div>
          <div class="amr-tags">${(candidate.matchedFields || []).map((field) => `<span class="amr-tag">${escapeHtml(field)}</span>`).join('')}</div>
        </div>`
      )
      .join('');

    el.innerHTML = `
      <h2>${escapeHtml(item.mailboxId || '')}</h2>
      <p class="amr-muted">${escapeHtml(item.conversationKey || '')}</p>
      <p><strong>Varför ambiguous:</strong> ${escapeHtml(item.ambiguityReason || '')}</p>
      <p class="amr-muted">strategy: ${escapeHtml(item.matchStrategy || '')} · status: ${escapeHtml(item.reviewStatus || 'pending')}</p>
      <h3>Kandidater (${item.candidates?.length || 0})</h3>
      ${candidates}
      <div class="amr-field">
        <label>Reason (krävs för exclude) <textarea data-reason rows="2" placeholder="motivering"></textarea></label>
      </div>
      <label><input type="checkbox" data-owner-accepted /> owner_accepted_unresolved</label>
      <div class="amr-actions">
        <button type="button" class="amr-btn amr-btn-primary" data-action="approve_single_match" ${busy ? 'disabled' : ''}>Approve single match</button>
        <button type="button" class="amr-btn" data-action="leave_unresolved" ${busy ? 'disabled' : ''}>Leave unresolved</button>
        <button type="button" class="amr-btn amr-btn-danger" data-action="exclude_non_actionable" ${busy ? 'disabled' : ''}>Exclude non-actionable</button>
        <button type="button" class="amr-btn" data-action="reject_candidate" ${busy ? 'disabled' : ''}>Reject candidate</button>
      </div>`;

    el.querySelectorAll('input[name="candidate"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedCandidateId = input.value;
      });
    });

    el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        decide(btn.getAttribute('data-action')).catch(showError);
      });
    });
  }

  function showError(error) {
    const el = document.querySelector('[data-error]');
    if (!el) return;
    el.hidden = false;
    el.textContent = error?.message || String(error);
  }

  function clearError() {
    const el = document.querySelector('[data-error]');
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  async function loadSummary() {
    summary = await apiFetch(`/summary?tenantId=${encodeURIComponent(TENANT)}`);
    renderStats();
  }

  async function loadQueue() {
    const mailboxId = document.querySelector('[data-mailbox-filter]')?.value || '';
    const body = await apiFetch(
      `/queue?tenantId=${encodeURIComponent(TENANT)}&status=pending&limit=200&offset=0${mailboxId ? `&mailboxId=${encodeURIComponent(mailboxId)}` : ''}`
    );
    queue = body.items || [];
    if (currentIndex >= queue.length) currentIndex = 0;
    renderQueueList();
    renderDetail();
  }

  async function decide(action) {
    clearError();
    const item = currentItem();
    if (!item) return;
    const reviewer = getReviewer();
    if (!reviewer || reviewer.length < 2) {
      throw new Error('Ange reviewer (minst 2 tecken).');
    }
    const reason = document.querySelector('[data-reason]')?.value?.trim() || '';
    const ownerAccepted = document.querySelector('[data-owner-accepted]')?.checked === true;
    if (action === 'approve_single_match' || action === 'reject_candidate') {
      if (!selectedCandidateId) throw new Error('Välj en kandidat.');
    }
    if (action === 'exclude_non_actionable' && reason.length < 3) {
      throw new Error('Exclude kräver reason (minst 3 tecken).');
    }
    if (!window.confirm(`Bekräfta ${action} för ${item.conversationKey}?`)) return;

    busy = true;
    renderDetail();
    try {
      await apiFetch('/decide', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: TENANT,
          go: true,
          action,
          conversationKey: item.conversationKey,
          candidateId: selectedCandidateId,
          reason,
          reviewer,
          ownerAccepted,
        }),
      });
      await loadSummary();
      await loadQueue();
    } finally {
      busy = false;
      renderDetail();
    }
  }

  async function boot() {
    renderShell();
    await loadSummary();
    await loadQueue();
  }

  boot().catch(showError);
})();
