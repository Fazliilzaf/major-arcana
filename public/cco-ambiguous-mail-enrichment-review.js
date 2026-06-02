(function () {
  'use strict';

  const API = '/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review';
  const TENANT = new URLSearchParams(window.location.search).get('tenantId') || 'hair-tp-clinic';
  const LS_REVIEWER = 'cco-ambiguous-mail-reviewer';

  let summary = null;
  let queue = [];
  let queueTotal = 0;
  let currentIndex = 0;
  let selectedCandidateId = null;
  let busy = false;
  const sessionAudit = [];
  let showApprovableOnly = false;
  let mailboxReference = null;
  const QUEUE_PAGE = 100;
  const MAILBOX_PRESETS = [
    { id: 'contact@hairtpclinic.com', label: 'contact@' },
    { id: 'egzona@hairtpclinic.com', label: 'egzona@' },
    { id: 'fazli@hairtpclinic.com', label: 'fazli@' },
    { id: 'marknad@hairtpclinic.com', label: 'marknad@' },
  ];
  const MAILBOX_REFERENCE_FALLBACK = {
    'contact@hairtpclinic.com': 248,
    'egzona@hairtpclinic.com': 175,
    'fazli@hairtpclinic.com': 67,
    'marknad@hairtpclinic.com': 3,
  };
  const DEFAULT_DETERMINISTIC_FIELDS = [
    'internetMessageId',
    'subjectHash',
    'receivedAt',
    'mailbox',
    'conversationId',
    'fromHash',
    'toHash',
  ];

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

  function selectedCandidate() {
    const item = currentItem();
    if (!item || !selectedCandidateId) return null;
    return (item.candidates || []).find((c) => c.candidateId === selectedCandidateId) || null;
  }

  function pickDefaultCandidate(item) {
    if (!item?.candidates?.length) return null;
    const approvable = item.candidates.find((c) => c.approvable && !c.rejected);
    if (approvable) return approvable.candidateId;
    const first = item.candidates.find((c) => !c.rejected);
    return first?.candidateId || null;
  }

  function itemHasApprovableCandidate(item) {
    return (item?.candidates || []).some((c) => c.approvable && !c.rejected);
  }

  function findNextBestIndex(fromIndex = 0) {
    for (let i = fromIndex; i < queue.length; i += 1) {
      if (itemHasApprovableCandidate(queue[i])) return i;
    }
    for (let i = 0; i < fromIndex; i += 1) {
      if (itemHasApprovableCandidate(queue[i])) return i;
    }
    return -1;
  }

  async function ensureQueueLoadedForNextBest(startIndex, { allowWhileBusy = false } = {}) {
    let idx = findNextBestIndex(startIndex);
    while (idx < 0 && queue.length < queueTotal && (allowWhileBusy || !busy)) {
      await loadQueue({ append: true });
      idx = findNextBestIndex(startIndex);
      if (queue.length >= queueTotal) break;
    }
    return idx;
  }

  function missingDeterministicFieldList(candidate, item) {
    const allFields = item.deterministicMatchFields || DEFAULT_DETERMINISTIC_FIELDS;
    const matched = new Set(candidate.matchedFields || []);
    return allFields.filter((field) => !matched.has(field));
  }

  function candidateBlockerText(candidate, item, minFields = 3) {
    if (candidate.rejected) return 'Avvisad — välj annan kandidat.';
    if (candidate.approvable) {
      return `Approve tillåten: ${candidate.matchCount ?? 0}/${minFields} deterministiska fält matchar.`;
    }
    const have = candidate.matchCount ?? 0;
    const missingNames = missingDeterministicFieldList(candidate, item);
    const need = Math.max(0, minFields - have);
    const names =
      missingNames.length > 0
        ? ` Saknade fält: ${missingNames.slice(0, 6).join(', ')}${missingNames.length > 6 ? '…' : ''}.`
        : '';
    return `Approve inte tillåten: ${have}/${minFields} fält (behöver ${need} till).${names}`;
  }

  function sumMailboxCounts(counts) {
    return Object.values(counts || {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
  }

  function applyMailboxCountsFallback() {
    if (!summary) return;
    const r = summary.report || {};
    const remaining = Number(
      r.remainingAmbiguous ?? summary.pending ?? summary.ambiguousTotal ?? 0
    );
    const current = summary.mailboxCounts || r.mailboxCounts || {};
    if (remaining > 0 && sumMailboxCounts(current) > 0) return;
    const ref = mailboxReference?.mailboxCounts || MAILBOX_REFERENCE_FALLBACK;
    if (ref && sumMailboxCounts(ref) > 0) {
      summary.mailboxCounts = { ...ref };
      summary.mailboxCountsSource = mailboxReference?.mailboxCounts
        ? 'reference_snapshot'
        : 'reference_snapshot_inline';
    }
  }

  function renderDeterministicFieldMatrix(candidate, item) {
    const allFields = item.deterministicMatchFields || DEFAULT_DETERMINISTIC_FIELDS;
    const matched = new Set(candidate.matchedFields || []);
    const missing = allFields.filter((field) => !matched.has(field));
    const chips = allFields
      .map((field) => {
        const on = matched.has(field);
        return `<span class="amr-field-chip${on ? ' is-match' : ' is-miss'}">${on ? '✓' : '·'} ${escapeHtml(field)}</span>`;
      })
      .join('');
    return `<div class="amr-field-matrix">${chips}</div>
      <p class="amr-muted amr-field-explain"><strong>Matchar:</strong> ${escapeHtml((candidate.matchedFields || []).join(', ') || '—')} · <strong>Saknas för approve:</strong> ${escapeHtml(missing.join(', ') || '—')}</p>`;
  }

  function candidateExplainText(candidate, item) {
    const minFields = item.minApproveMatchFields ?? 3;
    if (candidate.rejected) return 'Kandidat avvisad — välj annan.';
    if (candidate.approvable) {
      return `Deterministisk match: ${candidate.matchCount}/${minFields} fält (${(candidate.matchedFields || []).join(', ')}).`;
    }
    const missing = missingDeterministicFieldList(candidate, item);
    return `Behöver ${minFields - (candidate.matchCount || 0)} fler fält. Saknas: ${missing.join(', ')}.`;
  }

  function navigateQueue(delta) {
    if (!queue.length) return;
    currentIndex = Math.max(0, Math.min(queue.length - 1, currentIndex + delta));
    selectedCandidateId = pickDefaultCandidate(currentItem());
    renderQueueList();
    renderQueuePosition();
    renderDetail();
  }

  function renderShell() {
    const root = document.getElementById('amr-root');
    root.innerHTML = `
      <div class="amr-shell">
        <header class="amr-header">
          <h1>Ambiguous Mail Enrichment Review</h1>
          <p class="amr-muted">493-raderskö · manuellt beslut · minst 3 deterministiska fält för approve · ingen auto-merge</p>
        </header>
        <div class="amr-guardrails">
          <strong>Operatörsregler (Phase 2):</strong>
          ingen auto-write · ingen fuzzy merge · ingen customer merge · ingen Graph-fetch från UI ·
          ingen ny mailimport · approve kräver ≥3 deterministiska fält ·
          <em>stör inte journaldemo / personal-start</em>
        </div>
        <div class="amr-field">
          <label>Reviewer <input data-reviewer value="${escapeHtml(getReviewer())}" placeholder="owner@..." /></label>
        </div>
        <div class="amr-export-row">
          <button type="button" class="amr-btn" data-export-status>Ladda ner operativ status (JSON)</button>
          <span class="amr-muted">För kvälls-readiness — ingen auto-write</span>
        </div>
        <div data-progress class="amr-progress"></div>
        <div data-next-best class="amr-next-best"></div>
        <div data-mailbox-grid class="amr-mailbox-grid"></div>
        <div data-mailbox-chips class="amr-mailbox-chips"></div>
        <div data-stats class="amr-stats"></div>
        <div data-session-summary class="amr-session-summary" hidden></div>
        <div data-session-audit class="amr-session-audit" hidden></div>
        <details class="amr-help">
          <summary>Vad betyder detta? (operatör)</summary>
          <div class="amr-help-body">
            <p><strong>Ambiguous</strong> = flera möjliga Graph-trådar matchar samma CCO-gap. Inget väljs automatiskt.</p>
            <ul>
              <li><strong>Approve single match</strong> — kräver ≥3 deterministiska fält (t.ex. mailbox, conversationId, subjectHash).</li>
              <li><strong>Leave unresolved</strong> — stannar i kö tills strategi finns.</li>
              <li><strong>Exclude</strong> — brus/system (kräver reason).</li>
              <li><strong>Reject candidate</strong> — fel kandidat, prova nästa.</li>
            </ul>
            <p class="amr-muted">Ingen auto-write · ingen fuzzy merge · ingen customer merge · ingen Graph-fetch · ingen ny import. Detta påverkar <em>inte</em> journaldemot.</p>
          </div>
        </details>
        <div class="amr-layout">
          <aside class="amr-queue">
            <h2>Kö</h2>
            <ol class="amr-steps">
              <li>Välj mailbox (chip eller lista)</li>
              <li>Öppna rad → välj kandidat med ≥3 fält</li>
              <li>Approve / unresolved / exclude / reject</li>
              <li>Nästa rad — inget skrivs utan explicit beslut</li>
            </ol>
            <p class="amr-muted" data-queue-meta>—</p>
            <p class="amr-muted" data-queue-position>—</p>
            <div class="amr-field">
              <select data-mailbox-filter>
                <option value="">Alla mailboxar</option>
              </select>
            </div>
            <label class="amr-filter-approvable">
              <input type="checkbox" data-filter-approvable /> Visa endast rader med ≥3 fält
            </label>
            <ul class="amr-queue-list" data-queue-list></ul>
            <button type="button" class="amr-btn" data-load-more hidden>Ladda fler</button>
          </aside>
          <section class="amr-detail" data-detail>
            <p class="amr-muted">Laddar…</p>
          </section>
        </div>
        <p class="amr-audit-toast amr-muted" data-audit-toast hidden></p>
        <p class="amr-error" data-error hidden></p>
      </div>`;

    root.querySelector('[data-reviewer]').addEventListener('change', (event) => {
      setReviewer(event.target.value);
    });
    root.querySelector('[data-mailbox-filter]').addEventListener('change', () => {
      loadQueue({ reset: true }).catch(showError);
    });
    root.querySelector('[data-filter-approvable]')?.addEventListener('change', (ev) => {
      showApprovableOnly = ev.target.checked === true;
      renderQueueList();
      renderQueueMeta();
    });
    root.querySelector('[data-load-more]')?.addEventListener('click', () => {
      loadQueue({ append: true }).catch(showError);
    });
    root
      .querySelector('[data-export-status]')
      ?.addEventListener('click', exportOperationalSnapshot);
    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('textarea, input, select')) return;
      if (busy) return;
      if (ev.key === 'ArrowDown' || ev.key === 'j') {
        ev.preventDefault();
        navigateQueue(1);
      } else if (ev.key === 'ArrowUp' || ev.key === 'k') {
        ev.preventDefault();
        navigateQueue(-1);
      } else if (ev.key === 'n') {
        ev.preventDefault();
        jumpToNextBest();
      } else if (ev.key === 'u') {
        ev.preventDefault();
        decide('leave_unresolved').catch(showError);
      } else if (ev.key === 'x') {
        ev.preventDefault();
        decide('exclude_non_actionable').catch(showError);
      } else if (ev.key === 'r') {
        ev.preventDefault();
        decide('reject_candidate').catch(showError);
      }
    });
  }

  async function jumpToNextBest({ internal = false } = {}) {
    if (!internal && busy) return;
    const wasBusy = busy;
    if (!internal) busy = true;
    try {
      const idx = await ensureQueueLoadedForNextBest(currentIndex + 1, {
        allowWhileBusy: internal,
      });
      if (idx < 0) {
        renderNextBestPanel();
        return;
      }
      currentIndex = idx;
      selectedCandidateId = pickDefaultCandidate(currentItem());
      renderQueueList();
      renderQueuePosition();
      renderDetail();
      renderNextBestPanel();
    } finally {
      if (!internal) busy = wasBusy;
    }
  }

  function renderNextBestPanel() {
    const el = document.querySelector('[data-next-best]');
    if (!el) return;
    const idx = findNextBestIndex(0);
    const approvableCount = queue.filter((item) => itemHasApprovableCandidate(item)).length;
    const loadedNote =
      queue.length < queueTotal
        ? ` · ladda fler för global sökning (${queue.length}/${queueTotal})`
        : '';
    if (!queue.length) {
      el.innerHTML = '<p class="amr-muted">Ingen kö laddad.</p>';
      return;
    }
    if (idx < 0) {
      el.innerHTML =
        '<p class="amr-next-best-warn"><strong>Nästa bästa:</strong> ingen rad med approvable kandidat i vyn — granska manuellt eller exclude/unresolved.</p>';
      return;
    }
    const item = queue[idx];
    const cand = (item.candidates || []).find((c) => c.approvable && !c.rejected);
    const fields = (cand?.matchedFields || []).join(', ') || '—';
    el.innerHTML = `
      <div class="amr-next-best-box">
        <strong>Nästa bästa rad att granska</strong>
        <p class="amr-muted">${approvableCount} av ${queue.length} i vyn har minst en approvable kandidat · rad ${idx + 1}: ${escapeHtml(item.mailboxId || '')}${loadedNote}</p>
        <p class="amr-muted">Matchande fält: ${escapeHtml(fields)}</p>
        <p class="amr-muted">${escapeHtml(candidateExplainText(cand, item))}</p>
        <button type="button" class="amr-btn amr-btn-primary" data-jump-next>Gå till nästa bästa [N]</button>
      </div>`;
    el.querySelector('[data-jump-next]')?.addEventListener('click', () => {
      jumpToNextBest().catch(showError);
    });
  }

  function reportFields() {
    const r = summary?.report || {};
    return {
      ambiguousTotal: summary?.ambiguousTotal ?? r.ambiguousTotal ?? 0,
      pending: summary?.pending ?? r.remainingAmbiguous ?? 0,
      approved: summary?.approved ?? r.approved ?? 0,
      excluded: summary?.excluded ?? 0,
      unresolved:
        (summary?.unresolved ?? 0) +
        (summary?.ownerAcceptedUnresolved ?? r.ownerAcceptedUnresolved ?? 0),
      remaining: r.remainingAmbiguous ?? summary?.pending ?? 0,
      operational: r.operationalReadiness ?? '—',
      coverage: r.adjustedCoveragePercent ?? '—',
      readyForWork: r.readyForWork === true,
      mailboxCounts: summary?.mailboxCounts || r.mailboxCounts || {},
      mailboxCountsSource: summary?.mailboxCountsSource || r.mailboxCountsSource || 'live',
      rules: summary?.rules || r.stopConditions || {},
    };
  }

  function renderProgress() {
    const el = document.querySelector('[data-progress]');
    if (!el || !summary) return;
    const f = reportFields();
    const total = Math.max(1, Number(f.ambiguousTotal) || 1);
    const done = Number(f.approved) + Number(f.excluded) + Number(f.unresolved);
    const pct = Math.min(100, Math.round((done / total) * 100));
    const activeMb = document.querySelector('[data-mailbox-filter]')?.value || '';
    const mbPending = activeMb ? (f.mailboxCounts[activeMb] ?? '—') : null;
    const mbLine = activeMb
      ? `<p class="amr-mailbox-progress">Mailbox-filter: <strong>${escapeHtml(activeMb)}</strong> — ${mbPending} pending i total · ${queueTotal} i filtrerad kö · ${queue.length} laddade i vyn</p>`
      : `<p class="amr-mailbox-progress amr-muted">Välj mailbox-chip för progress per inbox.</p>`;
    el.innerHTML = `
      <div class="amr-progress-head">
        <strong>Progress (totalt)</strong>
        <span class="amr-muted">${done} hanterade av ${f.ambiguousTotal} · ${f.remaining} kvar i kö</span>
      </div>
      <div class="amr-progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <div class="amr-progress-grid">
        <span class="amr-pill amr-pill--ok">approved ${f.approved}</span>
        <span class="amr-pill amr-pill--warn">unresolved ${f.unresolved}</span>
        <span class="amr-pill">excluded ${f.excluded}</span>
        <span class="amr-pill amr-pill--accent">remaining ${f.remaining}</span>
      </div>
      ${mbLine}`;
  }

  function renderAuditBlock(decision) {
    if (!decision) return '';
    const fields = (decision.matchedFields || []).map((f) => escapeHtml(f)).join(', ') || '—';
    return `
      <div class="amr-audit">
        <h3>Beslut (audit)</h3>
        <dl class="amr-audit-dl">
          <div><dt>action</dt><dd>${escapeHtml(decision.action || decision.reviewStatus || '—')}</dd></div>
          <div><dt>reviewer</dt><dd>${escapeHtml(decision.reviewer || '—')}</dd></div>
          <div><dt>decidedAt</dt><dd>${escapeHtml(decision.decidedAt || '—')}</dd></div>
          <div><dt>matchedFields</dt><dd>${fields}</dd></div>
          <div><dt>reason</dt><dd>${escapeHtml(decision.reason || '—')}</dd></div>
        </dl>
        <p class="amr-muted">Server audit: ops.cco.enrichment.gap_recovery.ambiguous_review.decide</p>
      </div>`;
  }

  function renderMailboxChips() {
    const el = document.querySelector('[data-mailbox-chips]');
    const select = document.querySelector('[data-mailbox-filter]');
    if (!el || !summary) return;
    const counts = reportFields().mailboxCounts;
    const active = select?.value || '';
    el.innerHTML = MAILBOX_PRESETS.map((mb) => {
      const n = counts[mb.id] ?? 0;
      const on = active === mb.id ? ' is-active' : '';
      return `<button type="button" class="amr-chip${on}" data-mailbox="${escapeHtml(mb.id)}">${escapeHtml(mb.label)} <span class="amr-muted">(${n})</span></button>`;
    })
      .concat(
        `<button type="button" class="amr-chip${active === '' ? ' is-active' : ''}" data-mailbox="">Alla</button>`
      )
      .join('');
    el.querySelectorAll('[data-mailbox]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mailbox') || '';
        if (select) select.value = id;
        loadQueue({ reset: true }).catch(showError);
        renderMailboxChips();
      });
    });
  }

  function renderStats() {
    const el = document.querySelector('[data-stats]');
    if (!el || !summary) return;
    const f = reportFields();
    const m = f.mailboxCounts;
    el.innerHTML = `
      <div class="amr-stat"><strong>${f.ambiguousTotal}</strong><span class="amr-muted">ambiguous total</span></div>
      <div class="amr-stat"><strong>${f.pending}</strong><span class="amr-muted">pending i kö</span></div>
      <div class="amr-stat"><strong>${f.operational}</strong><span class="amr-muted">operational</span></div>
      <div class="amr-stat"><strong>${f.coverage}%</strong><span class="amr-muted">technical coverage</span></div>
      <div class="amr-stat"><strong>${f.readyForWork ? 'ja' : 'nej'}</strong><span class="amr-muted">readyForWork (ej dagligt verktyg)</span></div>
      <div class="amr-stat"><strong>${m['contact@hairtpclinic.com'] ?? 0}</strong><span class="amr-muted">contact@ pending</span></div>
      <div class="amr-stat"><strong>${m['egzona@hairtpclinic.com'] ?? 0}</strong><span class="amr-muted">egzona@ pending</span></div>
      <div class="amr-stat"><strong>${m['fazli@hairtpclinic.com'] ?? 0}</strong><span class="amr-muted">fazli@ pending</span></div>
      <div class="amr-stat"><strong>${m['marknad@hairtpclinic.com'] ?? 0}</strong><span class="amr-muted">marknad@ pending</span></div>`;
  }

  function renderMailboxGrid() {
    const el = document.querySelector('[data-mailbox-grid]');
    if (!el || !summary) return;
    const counts = reportFields().mailboxCounts;
    const active = document.querySelector('[data-mailbox-filter]')?.value || '';
    el.innerHTML = MAILBOX_PRESETS.map((mb) => {
      const n = counts[mb.id] ?? 0;
      const on = active === mb.id ? ' is-active' : '';
      return `<button type="button" class="amr-mailbox-card${on}" data-mailbox-card="${escapeHtml(mb.id)}">
        <span class="amr-mailbox-card-label">${escapeHtml(mb.label)}</span>
        <span class="amr-mailbox-card-count">${n} pending</span>
      </button>`;
    }).join('');
    el.querySelectorAll('[data-mailbox-card]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mailbox-card') || '';
        const select = document.querySelector('[data-mailbox-filter]');
        if (select) select.value = id;
        loadQueue({ reset: true }).catch(showError);
      });
    });
  }

  function renderSessionSummary() {
    const el = document.querySelector('[data-session-summary]');
    if (!el) return;
    if (!sessionAudit.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const counts = { approve: 0, unresolved: 0, exclude: 0, reject: 0 };
    const byReviewer = {};
    sessionAudit.forEach((row) => {
      if (row.action === 'approve_single_match') counts.approve += 1;
      else if (row.action === 'leave_unresolved') counts.unresolved += 1;
      else if (row.action === 'exclude_non_actionable') counts.exclude += 1;
      else if (row.action === 'reject_candidate') counts.reject += 1;
      const rev = row.reviewer || '—';
      byReviewer[rev] = (byReviewer[rev] || 0) + 1;
    });
    const last = sessionAudit[0];
    const revLine = Object.entries(byReviewer)
      .map(([r, n]) => `${escapeHtml(r)}: ${n}`)
      .join(' · ');
    el.innerHTML = `
      <h3>Session summary</h3>
      <p>approve <strong>${counts.approve}</strong> · unresolved <strong>${counts.unresolved}</strong> · exclude <strong>${counts.exclude}</strong> · reject <strong>${counts.reject}</strong></p>
      <p class="amr-muted">Beslut per operator: ${revLine || '—'}</p>
      <p class="amr-muted">Senaste beslut: <strong>${escapeHtml(last.action)}</strong> · ${escapeHtml(last.conversationKey)} · fält: ${escapeHtml(last.matchedFields || '—')}</p>`;
  }

  function renderSessionAudit() {
    const el = document.querySelector('[data-session-audit]');
    renderSessionSummary();
    if (!el) return;
    if (!sessionAudit.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `
      <h3>Senaste beslut (session)</h3>
      <ul class="amr-session-audit-list">
        ${sessionAudit
          .map(
            (row) =>
              `<li><strong>${escapeHtml(row.action)}</strong> · ${escapeHtml(row.conversationKey)} · ${escapeHtml(row.matchedFields || '—')} · ${escapeHtml(row.reviewer || '—')}</li>`
          )
          .join('')}
      </ul>`;
  }

  function pushSessionAudit(action, decision, conversationKey) {
    sessionAudit.unshift({
      action,
      conversationKey: conversationKey || '—',
      reviewer: decision?.reviewer || getReviewer(),
      matchedFields: (decision?.matchedFields || []).join(', '),
      at: decision?.decidedAt || new Date().toISOString(),
    });
    if (sessionAudit.length > 8) sessionAudit.length = 8;
    renderSessionAudit();
  }

  function exportOperationalSnapshot() {
    if (!summary) return;
    const f = reportFields();
    const filter = document.querySelector('[data-mailbox-filter]')?.value || '';
    const payload = {
      exportedAt: new Date().toISOString(),
      tenantId: TENANT,
      operational: f.operational,
      ambiguousTotal: f.ambiguousTotal,
      approved: f.approved,
      unresolved: f.unresolved,
      excluded: f.excluded,
      remaining: f.remaining,
      mailboxPending: f.mailboxCounts,
      mailboxFilter: filter || null,
      queueLoaded: queue.length,
      queueTotal,
      readyForWork: f.readyForWork,
      adjustedCoveragePercent: f.coverage,
      rules: {
        noAutoWrite: true,
        noFuzzyMerge: true,
        noCustomerMerge: true,
        noGraphFetch: true,
        noNewMailImport: true,
        minApproveMatchFields: 3,
      },
      sessionDecisions: sessionAudit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mail-ambiguous-operational-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showAuditToast({ decidedAt: new Date().toISOString(), reviewer: getReviewer() }, 'export_json');
  }

  function refreshSummaryPanels() {
    renderProgress();
    renderNextBestPanel();
    renderMailboxGrid();
    renderMailboxChips();
    renderStats();
    syncMailboxSelect();
    renderSessionAudit();
  }

  function syncMailboxSelect() {
    const filter = document.querySelector('[data-mailbox-filter]');
    if (!filter || !summary) return;
    const counts = reportFields().mailboxCounts;
    const current = filter.value;
    const options = ['<option value="">Alla mailboxar</option>'].concat(
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([mailbox, count]) =>
            `<option value="${escapeHtml(mailbox)}">${escapeHtml(mailbox)} (${count} pending)</option>`
        )
    );
    filter.innerHTML = options.join('');
    filter.value = current;
  }

  function renderQueueMeta() {
    const meta = document.querySelector('[data-queue-meta]');
    const more = document.querySelector('[data-load-more]');
    const filter = document.querySelector('[data-mailbox-filter]')?.value || '';
    if (meta) {
      const mb = filter ? ` · filter ${filter}` : '';
      meta.textContent = `Visar ${queue.length} av ${queueTotal} pending${mb} · manuell review · ingen auto-write`;
    }
    if (more) {
      const hasMore = queue.length < queueTotal;
      more.hidden = !hasMore;
      more.disabled = busy || !hasMore;
    }
    renderQueuePosition();
  }

  function renderQueuePosition() {
    const el = document.querySelector('[data-queue-position]');
    if (!el) return;
    if (!queue.length) {
      el.textContent = 'Ingen rad i filtrerad kö.';
      return;
    }
    el.textContent = `Rad ${currentIndex + 1} av ${queue.length} i vyn (${queueTotal} pending totalt)`;
  }

  function renderQueueList() {
    const list = document.querySelector('[data-queue-list]');
    if (!list) return;
    const cur = currentItem();
    list.innerHTML = queue
      .map((item, idx) => {
        const approvable = itemHasApprovableCandidate(item);
        const active = cur?.conversationKey === item.conversationKey ? ' is-active' : '';
        const ready = approvable ? ' has-approvable' : '';
        const hidden = showApprovableOnly && !approvable ? ' is-filtered-out' : '';
        return `<li>
          <button type="button" class="amr-queue-item${active}${ready}${hidden}" data-idx="${idx}">
            <div>${escapeHtml(item.mailboxId || '')}${approvable ? ' <span class="amr-tag amr-tag--ok">≥3 fält</span>' : ''}</div>
            <div class="amr-muted">${escapeHtml(item.conversationId || item.conversationKey || '')}</div>
            <div class="amr-muted">${escapeHtml(item.ambiguityReason || '')}</div>
          </button>
        </li>`;
      })
      .join('');

    list.querySelectorAll('[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentIndex = Number(btn.getAttribute('data-idx'));
        selectedCandidateId = pickDefaultCandidate(currentItem());
        renderDetail();
        renderQueueList();
        renderQueuePosition();
      });
    });

    renderMailboxChips();
  }

  function renderDetail() {
    const el = document.querySelector('[data-detail]');
    const item = currentItem();
    if (!el) return;
    if (!item) {
      el.innerHTML = '<p class="amr-muted">Ingen rad i kön.</p>';
      return;
    }

    const minFields = item.minApproveMatchFields ?? 3;
    const candidates = (item.candidates || [])
      .map((candidate) => {
        const blocker = candidateBlockerText(candidate, item, minFields);
        const missingList = missingDeterministicFieldList(candidate, item);
        return `<div class="amr-candidate${candidate.approvable ? ' approvable' : ''}${candidate.rejected ? ' rejected' : ''}">
          <label>
            <input type="radio" name="candidate" value="${escapeHtml(candidate.candidateId)}" ${selectedCandidateId === candidate.candidateId ? 'checked' : ''} ${candidate.rejected ? 'disabled' : ''} />
            <strong>${escapeHtml(candidate.source || 'candidate')}</strong>
            ${candidate.approvable ? '<span class="amr-tag amr-tag--ok">approvable</span>' : `<span class="amr-tag amr-tag--warn">${candidate.matchCount || 0}/${minFields} fält</span>`}
          </label>
          <p class="amr-candidate-blocker">${escapeHtml(blocker)}</p>
          <p class="amr-muted amr-candidate-why">${escapeHtml(candidateExplainText(candidate, item))}</p>
          <p class="amr-muted">Varför approve ${candidate.approvable ? 'är' : 'inte är'} tillåten — deterministiska fält (min ${minFields}, ingen auto-write):</p>
          <p class="amr-muted">Saknade fält: ${escapeHtml(missingList.join(', ') || '—')}</p>
          <p class="amr-muted">Matchande fält (${candidate.matchCount ?? 0}/${minFields}):</p>
          ${renderDeterministicFieldMatrix(candidate, item)}
          <p class="amr-muted">receivedAt: ${escapeHtml(candidate.receivedAt || candidate.sentAt || '—')}</p>
        </div>`;
      })
      .join('');

    const detFields = (item.deterministicMatchFields || DEFAULT_DETERMINISTIC_FIELDS)
      .map((f) => escapeHtml(f))
      .join(', ');
    el.innerHTML = `
      <h2>${escapeHtml(item.mailboxId || '')}</h2>
      <p class="amr-muted">${escapeHtml(item.conversationKey || '')}</p>
      <div class="amr-why-box">
        <h3>Varför är denna ambiguous?</h3>
        <p>${escapeHtml(item.ambiguityReason || 'Flera kandidater med lika score — ingen unik deterministisk match.')}</p>
        <p class="amr-muted">strategy: ${escapeHtml(item.matchStrategy || '—')} · ${item.matchCount ?? 0} kandidater · graphMessageId: ${item.graphMessageIdPresent ? 'finns' : 'saknas'} · status: ${escapeHtml(item.reviewStatus || 'pending')}</p>
      </div>
      <div class="amr-approve-rule">
        <strong>Approve kräver ≥${minFields} deterministiska fält</strong> (${detFields}). Ingen auto-write · ingen blind enrichment-loop.
      </div>
      ${renderAuditBlock(item.decision)}
      <div class="amr-quick-actions">
        <span class="amr-muted">Snabbknappar (ingen auto-write):</span>
        <button type="button" class="amr-btn" data-quick="leave_unresolved" ${busy ? 'disabled' : ''}>Unresolved [U]</button>
        <button type="button" class="amr-btn amr-btn-danger" data-quick="exclude_non_actionable" ${busy ? 'disabled' : ''}>Exclude [X]</button>
        <button type="button" class="amr-btn" data-quick="reject_candidate" ${busy ? 'disabled' : ''}>Reject kandidat [R]</button>
      </div>
      <h3>Kandidater (${item.candidates?.length || 0})</h3>
      ${candidates}
      <div class="amr-field">
        <label>Reason (krävs för exclude) <textarea data-reason rows="2" placeholder="motivering"></textarea></label>
      </div>
      <label><input type="checkbox" data-owner-accepted /> owner_accepted_unresolved</label>
      <div class="amr-queue-nav">
        <button type="button" class="amr-btn" data-nav-prev ${busy || currentIndex <= 0 ? 'disabled' : ''}>← Föregående</button>
        <button type="button" class="amr-btn" data-nav-next ${busy || currentIndex >= queue.length - 1 ? 'disabled' : ''}>Nästa →</button>
      </div>
      <p class="amr-muted amr-shortcuts">↑/↓ eller j/k rad · N nästa bästa · U/X/R snabb unresolved/exclude/reject</p>
      <div class="amr-actions">
        <button type="button" class="amr-btn amr-btn-primary" data-action="approve_single_match" data-approve-btn ${busy ? 'disabled' : ''}>Approve single match</button>
        <button type="button" class="amr-btn" data-action="leave_unresolved" ${busy ? 'disabled' : ''}>Leave unresolved</button>
        <button type="button" class="amr-btn amr-btn-danger" data-action="exclude_non_actionable" ${busy ? 'disabled' : ''}>Exclude non-actionable</button>
        <button type="button" class="amr-btn" data-action="reject_candidate" ${busy ? 'disabled' : ''}>Reject candidate</button>
      </div>
      <p class="amr-muted" data-approve-hint hidden></p>`;

    el.querySelectorAll('input[name="candidate"]').forEach((input) => {
      input.addEventListener('change', () => {
        selectedCandidateId = input.value;
        syncApproveState();
      });
    });

    el.querySelector('[data-nav-prev]')?.addEventListener('click', () => navigateQueue(-1));
    el.querySelector('[data-nav-next]')?.addEventListener('click', () => navigateQueue(1));

    el.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        decide(btn.getAttribute('data-quick')).catch(showError);
      });
    });

    el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        decide(btn.getAttribute('data-action')).catch(showError);
      });
    });
    syncApproveState();
  }

  function syncApproveState() {
    const approveBtn = document.querySelector('[data-approve-btn]');
    const hint = document.querySelector('[data-approve-hint]');
    const cand = selectedCandidate();
    const ok = !!cand?.approvable;
    if (approveBtn) approveBtn.disabled = busy || !ok;
    if (hint) {
      if (!selectedCandidateId) {
        hint.hidden = false;
        hint.textContent = 'Välj kandidat innan approve.';
      } else if (!ok) {
        hint.hidden = false;
        const item = currentItem();
        const missing = item && cand ? missingDeterministicFieldList(cand, item) : [];
        hint.textContent = `Approve blockerad: ${cand?.matchCount ?? 0}/3 fält. Saknas: ${missing.join(', ') || 'välj kandidat med ≥3 matchande fält'}.`;
      } else {
        hint.hidden = true;
        hint.textContent = '';
      }
    }
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

  function showAuditToast(decision, action) {
    const el = document.querySelector('[data-audit-toast]');
    if (!el) return;
    el.hidden = false;
    if (action === 'export_json') {
      el.textContent = 'Operativ status exporterad som JSON (lokal fil — ingen server-write).';
    } else if (!decision) {
      return;
    } else {
      el.textContent = `Audit sparat: ${action} · reviewer ${decision.reviewer || '—'} · ${decision.decidedAt || 'nu'} · fält: ${(decision.matchedFields || []).join(', ') || '—'}`;
    }
    window.setTimeout(() => {
      el.hidden = true;
    }, 8000);
  }

  async function loadSummary() {
    const body = await apiFetch(`/summary?tenantId=${encodeURIComponent(TENANT)}`);
    summary = body;
    if (body.rules) summary.rules = body.rules;
    try {
      const opRes = await fetch('/mail-ambiguous-operational-status.json', { cache: 'no-store' });
      if (opRes.ok) {
        const op = await opRes.json();
        if (sumMailboxCounts(op.mailboxCounts || op.mailboxPending) > 0) {
          summary.mailboxCounts = op.mailboxCounts || op.mailboxPending;
          summary.mailboxCountsSource = 'operational_status_json';
        }
      }
    } catch {
      /* ignore */
    }
    applyMailboxCountsFallback();
    refreshSummaryPanels();
  }

  async function loadQueue({ reset = true, append = false, preserveIndex = null } = {}) {
    const mailboxId = document.querySelector('[data-mailbox-filter]')?.value || '';
    const offset = append ? queue.length : 0;
    const body = await apiFetch(
      `/queue?tenantId=${encodeURIComponent(TENANT)}&status=pending&limit=${QUEUE_PAGE}&offset=${offset}${mailboxId ? `&mailboxId=${encodeURIComponent(mailboxId)}` : ''}`
    );
    queueTotal = body.total ?? (body.items || []).length;
    if (append) {
      queue = queue.concat(body.items || []);
    } else {
      queue = body.items || [];
      if (reset) {
        if (preserveIndex != null) {
          currentIndex = Math.min(Math.max(0, preserveIndex), Math.max(0, queue.length - 1));
        } else {
          currentIndex = 0;
        }
      } else if (currentIndex >= queue.length) {
        currentIndex = Math.max(0, queue.length - 1);
      }
    }
    if (!selectedCandidateId) selectedCandidateId = pickDefaultCandidate(currentItem());
    renderQueueList();
    renderQueueMeta();
    renderDetail();
    renderMailboxChips();
    renderProgress();
    renderNextBestPanel();
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
    if (action === 'approve_single_match' && !selectedCandidate()?.approvable) {
      throw new Error('Approve kräver minst 3 deterministiska fält på vald kandidat.');
    }
    if (action === 'exclude_non_actionable' && reason.length < 3) {
      throw new Error('Exclude kräver reason (minst 3 tecken).');
    }
    if (!window.confirm(`Bekräfta ${action} för ${item.conversationKey}?`)) return;

    busy = true;
    renderDetail();
    try {
      const result = await apiFetch('/decide', {
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
      const decision = result?.decision || result;
      pushSessionAudit(action, decision, item.conversationKey);
      showAuditToast(decision, action);
      await loadSummary();
      await loadQueue({ reset: true });
      await jumpToNextBest({ internal: true });
    } finally {
      busy = false;
      renderDetail();
      renderNextBestPanel();
    }
  }

  async function boot() {
    renderShell();
    try {
      const refRes = await fetch('/mail-ambiguous-mailbox-reference.json', { cache: 'no-store' });
      if (refRes.ok) mailboxReference = await refRes.json();
    } catch {
      mailboxReference = null;
    }
    await loadSummary();
    await loadQueue({ reset: true });
    selectedCandidateId = pickDefaultCandidate(currentItem());
    renderDetail();
  }

  boot().catch(showError);
})();
