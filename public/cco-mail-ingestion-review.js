(function () {
  'use strict';

  const API = '/api/v1/cco/mail-ingestion';
  const TENANT = new URLSearchParams(window.location.search).get('tenantId') || 'hair-tp-clinic';
  const DEFAULT_MAILBOX = 'kons@hairtpclinic.com';

  let state = {
    mailboxEmail: DEFAULT_MAILBOX,
    status: 'all',
    limit: 50,
    summary: null,
    rows: [],
    busy: false,
    message: '',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      ...opts,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || body.detail || res.statusText);
    return body;
  }

  async function loadSummary() {
    const q = new URLSearchParams();
    if (state.mailboxEmail) q.set('mailboxEmail', state.mailboxEmail);
    const data = await apiFetch(`/review-queue/summary?${q.toString()}`);
    state.summary = data;
  }

  async function loadQueue() {
    const q = new URLSearchParams();
    if (state.mailboxEmail) q.set('mailboxEmail', state.mailboxEmail);
    q.set('status', state.status);
    q.set('limit', String(state.limit));
    const data = await apiFetch(`/review-queue?${q.toString()}`);
    state.rows = data.rows || [];
  }

  async function linkPatient(rawMessageId, patientId) {
    return apiFetch('/link-patient', {
      method: 'PATCH',
      body: JSON.stringify({
        rawMessageId,
        patientId,
        reason: 'manual_review_ui',
      }),
    });
  }

  async function runSweep(dryRun) {
    return apiFetch('/resolve-unmatched-sweep', {
      method: 'POST',
      body: JSON.stringify({
        mailboxEmail: state.mailboxEmail,
        dryRun,
      }),
    });
  }

  function render() {
    const root = document.getElementById('cmir-root');
    if (!root) return;

    const summary = state.summary || {};
    const groups = summary.groups || [];

    root.innerHTML = `
      <div class="amr-shell">
        <header class="amr-header">
          <h1>CCO Mail Ingestion Review</h1>
          <p class="amr-muted">Granska och länka inkommande mejl till rätt patient.</p>
        </header>

        <div class="amr-guardrails">
          <strong>Owner-only.</strong> Denna vy anropar produktions-API:er. Varje länkning
          skriver audit-event. Kör alltid <em>dry-run</em> före skarp sweep.
        </div>

        ${state.message ? `<div class="cmir-toast ${state.message.includes('fel') || state.message.includes('Fel') ? 'cmir-toast--error' : 'cmir-toast--ok'}">${escapeHtml(state.message)}</div>` : ''}

        <div class="amr-controls">
          <label>
            Brevlåda
            <input type="email" id="cmir-mailbox" value="${escapeHtml(state.mailboxEmail)}" placeholder="kons@hairtpclinic.com" />
          </label>
          <label>
            Status
            <select id="cmir-status">
              <option value="all" ${state.status === 'all' ? 'selected' : ''}>Alla</option>
              <option value="unmatched" ${state.status === 'unmatched' ? 'selected' : ''}>Unmatched</option>
              <option value="needs_review" ${state.status === 'needs_review' ? 'selected' : ''}>Needs review</option>
            </select>
          </label>
          <label>
            Antal
            <select id="cmir-limit">
              <option value="50" ${state.limit === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${state.limit === 100 ? 'selected' : ''}>100</option>
              <option value="250" ${state.limit === 250 ? 'selected' : ''}>250</option>
            </select>
          </label>
          <button id="cmir-reload" ${state.busy ? 'disabled' : ''}>Ladda om</button>
          <button id="cmir-sweep-dry" ${state.busy ? 'disabled' : ''}>Sweep dry-run</button>
          <button id="cmir-sweep" ${state.busy ? 'disabled' : ''}>Sweep commit</button>
        </div>

        <div class="amr-stats">
          <div class="amr-stat">
            <strong>${escapeHtml(summary.totalUnmatched ?? '—')}</strong>
            <span>unmatched totalt</span>
          </div>
          <div class="amr-stat">
            <strong>${escapeHtml(summary.uniqueCounterparties ?? '—')}</strong>
            <span>unika avsändare</span>
          </div>
          <div class="amr-stat">
            <strong>${escapeHtml(summary.nonPatientCount ?? '—')}</strong>
            <span>icke-patient</span>
          </div>
          <div class="amr-stat">
            <strong>${escapeHtml(summary.patientLikeCount ?? '—')}</strong>
            <span>patient-liknande</span>
          </div>
        </div>

        ${groups.length ? `
        <details class="cmir-groups">
          <summary>Gruppering per avsändare (${groups.length})</summary>
          <table class="cmir-table">
            <thead><tr><th>Avsändare</th><th>Antal</th><th>Typ</th><th>Ämne (exempel)</th></tr></thead>
            <tbody>
              ${groups.map((g) => `<tr>
                <td>${escapeHtml(g.email || '—')}</td>
                <td>${escapeHtml(g.count)}</td>
                <td>${g.nonPatient ? 'Icke-patient' : 'Patient-liknande'}</td>
                <td>${escapeHtml(g.sampleSubject || '—')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </details>
        ` : ''}

        <h2>Review-kö (${state.rows.length})</h2>
        ${state.rows.length === 0 ? '<p class="amr-muted">Inga rader för vald filtrering.</p>' : `
        <table class="cmir-table cmir-rows">
          <thead>
            <tr>
              <th>Status</th>
              <th>Avsändare</th>
              <th>Ämne</th>
              <th>Mottaget</th>
              <th>PatientId</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.rows.map((row) => {
              const raw = row.rawMessage || {};
              const pm = row.patientMatch || {};
              return `<tr data-raw-id="${escapeHtml(raw.id || row.rawMessageId || '')}">
                <td><span class="cmir-badge cmir-badge--${escapeHtml((row.status || '').toLowerCase())}">${escapeHtml(row.status || '—')}</span></td>
                <td>${escapeHtml(pm.counterpartyEmail || raw.fromEmail || '—')}</td>
                <td>${escapeHtml(raw.subject || '—')}</td>
                <td>${escapeHtml(raw.receivedDateTime || raw.receivedAt || '—')}</td>
                <td><input type="text" class="cmir-patient-input" placeholder="patient-uuid" /></td>
                <td><button class="cmir-link-btn" data-raw-id="${escapeHtml(raw.id || row.rawMessageId || '')}">Länka</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        `}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const mailbox = document.getElementById('cmir-mailbox');
    const status = document.getElementById('cmir-status');
    const limit = document.getElementById('cmir-limit');
    const reload = document.getElementById('cmir-reload');
    const sweepDry = document.getElementById('cmir-sweep-dry');
    const sweep = document.getElementById('cmir-sweep');

    if (mailbox) mailbox.addEventListener('change', (e) => { state.mailboxEmail = e.target.value; });
    if (status) status.addEventListener('change', (e) => { state.status = e.target.value; });
    if (limit) limit.addEventListener('change', (e) => { state.limit = Number(e.target.value); });

    if (reload) reload.addEventListener('click', () => refresh());

    if (sweepDry) {
      sweepDry.addEventListener('click', async () => {
        setBusy(true, 'Kör sweep dry-run…');
        try {
          const data = await runSweep(true);
          setMessage(`Dry-run: linked=${data.result?.linked ?? 0}, dismissed=${data.result?.dismissed ?? 0}, suggested=${data.result?.suggested ?? 0}`);
        } catch (err) {
          setMessage(`Fel: ${err.message}`);
        } finally {
          setBusy(false);
        }
        await refresh(false);
      });
    }

    if (sweep) {
      sweep.addEventListener('click', async () => {
        if (!window.confirm('Detta kör skarp sweep och länkar/avvisar mejl. Fortsätt?')) return;
        setBusy(true, 'Kör sweep commit…');
        try {
          const data = await runSweep(false);
          setMessage(`Commit: linked=${data.result?.linked ?? 0}, dismissed=${data.result?.dismissed ?? 0}, suggested=${data.result?.suggested ?? 0}`);
        } catch (err) {
          setMessage(`Fel: ${err.message}`);
        } finally {
          setBusy(false);
        }
        await refresh(false);
      });
    }

    document.querySelectorAll('.cmir-link-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rawId = btn.getAttribute('data-raw-id');
        const tr = btn.closest('tr');
        const input = tr?.querySelector('.cmir-patient-input');
        const patientId = (input?.value || '').trim();
        if (!rawId || !patientId) {
          setMessage('rawMessageId och patientId krävs.');
          return;
        }
        setBusy(true, 'Länkar…');
        try {
          await linkPatient(rawId, patientId);
          setMessage(`Länkad ${rawId} → ${patientId}`);
          if (input) input.value = '';
        } catch (err) {
          setMessage(`Fel: ${err.message}`);
        } finally {
          setBusy(false);
        }
        await refresh(false);
      });
    });
  }

  function setBusy(value, text = '') {
    state.busy = value;
    if (text) state.message = text;
    render();
  }

  function setMessage(text) {
    state.message = text;
    render();
  }

  async function refresh(renderAfter = true) {
    setBusy(true, 'Laddar…');
    try {
      await Promise.all([loadSummary(), loadQueue()]);
      if (!state.message.startsWith('Laddar')) state.message = '';
    } catch (err) {
      setMessage(`Fel: ${err.message}`);
    } finally {
      setBusy(false);
    }
    if (renderAfter) render();
  }

  // Initiera
  const style = document.createElement('style');
  style.textContent = `
    .cmir-controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; margin: 1rem 0; }
    .cmir-controls label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: var(--amr-muted); }
    .cmir-controls input, .cmir-controls select { padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid var(--amr-border); background: var(--amr-panel); color: var(--amr-text); }
    .cmir-controls button { padding: 0.45rem 0.9rem; border-radius: 6px; border: 1px solid var(--amr-border); background: var(--amr-panel); color: var(--amr-text); cursor: pointer; }
    .cmir-controls button:hover { background: var(--amr-border); }
    .cmir-controls button:disabled { opacity: 0.5; cursor: not-allowed; }
    .cmir-toast { margin: 0.75rem 0; padding: 0.75rem 1rem; border-radius: 8px; }
    .cmir-toast--ok { background: rgba(62, 207, 142, 0.12); border: 1px solid rgba(62, 207, 142, 0.4); }
    .cmir-toast--error { background: rgba(255, 107, 107, 0.12); border: 1px solid rgba(255, 107, 107, 0.4); }
    .cmir-groups { margin: 1rem 0; padding: 0.75rem; background: var(--amr-panel); border: 1px solid var(--amr-border); border-radius: 8px; }
    .cmir-table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; font-size: 0.92rem; }
    .cmir-table th, .cmir-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid var(--amr-border); text-align: left; vertical-align: top; }
    .cmir-table th { color: var(--amr-muted); font-weight: 600; }
    .cmir-patient-input { width: 100%; min-width: 240px; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--amr-border); background: var(--amr-panel); color: var(--amr-text); }
    .cmir-link-btn { padding: 0.35rem 0.7rem; border-radius: 6px; border: 1px solid var(--amr-border); background: var(--amr-panel); color: var(--amr-text); cursor: pointer; }
    .cmir-link-btn:hover { background: var(--amr-border); }
    .cmir-badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; text-transform: uppercase; }
    .cmir-badge--unmatched { background: rgba(245, 166, 35, 0.15); color: var(--amr-warn); }
    .cmir-badge--needs_review { background: rgba(77, 163, 255, 0.15); color: var(--amr-accent); }
    .cmir-badge--security_review { background: rgba(255, 107, 107, 0.15); color: var(--amr-danger); }
    .cmir-badge--matched { background: rgba(62, 207, 142, 0.15); color: var(--amr-ok); }
  `;
  document.head.appendChild(style);

  render();
  refresh();
})();
