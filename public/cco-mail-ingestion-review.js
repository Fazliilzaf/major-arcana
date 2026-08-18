(function () {
  'use strict';

  const API = '/api/v1/cco/mail-ingestion';

  const auth = window.ArcanaReviewAuth;
  if (!auth) {
    document.body.innerHTML =
      '<p class="subtitle" style="padding:24px">Kunde inte ladda auth-hjälparen.</p>';
    return;
  }

  const els = {
    authSection: document.getElementById('auth-section'),
    authMessage: document.getElementById('auth-message'),
    loginLink: document.getElementById('login-link'),
    controls: document.getElementById('controls'),
    mailboxSelect: document.getElementById('cmir-mailbox'),
    statusSelect: document.getElementById('cmir-status'),
    limitSelect: document.getElementById('cmir-limit'),
    refreshBtn: document.getElementById('refresh-btn'),
    sweepDryBtn: document.getElementById('cmir-sweep-dry'),
    sweepBtn: document.getElementById('cmir-sweep'),
    summary: document.getElementById('summary'),
    queueSection: document.getElementById('queue-section'),
    queueEmpty: document.getElementById('queue-empty'),
    queueTable: document.getElementById('queue-table'),
    queueBody: document.getElementById('queue-body'),
    toast: document.getElementById('toast'),
  };

  let rows = [];
  let busy = false;

  function apiFetch(path, opts = {}) {
    return fetch(`${API}${path}`, {
      credentials: 'same-origin',
      headers: auth.authHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
      ...opts,
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function showToast(message, type = 'success') {
    els.toast.textContent = message;
    els.toast.className = `toast ${type}`;
    els.toast.hidden = false;
    setTimeout(() => {
      els.toast.hidden = true;
    }, 4000);
  }

  async function checkAuth() {
    const session = await auth.getSession();
    if (!session.authenticated) {
      els.authMessage.textContent = session.message || 'Du måste logga in.';
      els.loginLink.href = session.loginUrl || '/admin';
      els.loginLink.hidden = false;
      return;
    }
    els.authSection.hidden = true;
    els.controls.hidden = false;
    els.queueSection.hidden = false;
    await loadQueue();
  }

  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'unmatched') return 'cmir-badge status-unmatched';
    if (normalized === 'needs_review' || normalized === 'security_review') {
      return 'cmir-badge status-needs_review';
    }
    return 'cmir-badge';
  }

  async function linkPatient(rawMessageId, patientId, reason, button) {
    if (!patientId) return;
    button.disabled = true;
    button.textContent = 'Länkar…';

    try {
      const res = await apiFetch('/link-patient', {
        method: 'PATCH',
        body: JSON.stringify({
          rawMessageId,
          patientId,
          reason: reason || 'manual_review_ui_link',
          force: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      showToast(`Länkade till ${patientId}`);
      await loadQueue();
    } catch (err) {
      showToast(`Fel: ${err.message}`, 'error');
      button.disabled = false;
      button.textContent = 'Länka';
    }
  }

  async function runSweep({ dryRun = false } = {}) {
    if (busy) return;
    const mailbox = els.mailboxSelect.value;
    if (!mailbox) {
      showToast('Välj en brevlåda för sweep.', 'error');
      return;
    }
    busy = true;
    const btn = dryRun ? els.sweepDryBtn : els.sweepBtn;
    btn.disabled = true;
    btn.textContent = dryRun ? 'Kör torrkörning…' : 'Kör sweep…';

    try {
      const res = await apiFetch('/resolve-unmatched-sweep', {
        method: 'POST',
        body: JSON.stringify({ mailboxEmail: mailbox, dryRun }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const result = body.result || {};
      showToast(
        `${dryRun ? 'Torrkörning' : 'Sweep'}: ${result.linked || 0} länkade, ${result.dismissed || 0} avvisade, ${result.suggested || 0} förslag.`
      );
      await loadQueue();
    } catch (err) {
      showToast(`Sweep-fel: ${err.message}`, 'error');
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = dryRun ? 'Sweep torrkörning' : 'Sweep commit';
    }
  }

  async function loadSummary() {
    const mailbox = els.mailboxSelect.value;
    const params = new URLSearchParams();
    if (mailbox) params.set('mailboxEmail', mailbox);
    try {
      const res = await apiFetch(`/review-queue/summary?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (body.ok) {
        return {
          totalUnmatched: body.totalUnmatched ?? 0,
          patientLikeCount: body.patientLikeCount ?? 0,
          nonPatientCount: body.nonPatientCount ?? 0,
        };
      }
    } catch {
      // summary är valfri
    }
    return null;
  }

  function renderQueue() {
    els.queueBody.innerHTML = '';
    if (!rows.length) {
      els.queueEmpty.hidden = false;
      els.queueTable.hidden = true;
      return;
    }
    els.queueEmpty.hidden = true;
    els.queueTable.hidden = false;

    for (const row of rows) {
      const raw = row.rawMessage || {};
      const ledger = row.ledger || {};
      const review = row.reviewSummary || {};
      const status = String(ledger.status || '').toUpperCase();
      const rawId = escapeHtml(raw.id || ledger.rawMessageId || '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(formatDate(review.receivedDateTime))}</td>
        <td>${escapeHtml(review.subject || raw.subject || '(saknas)')}</td>
        <td>${escapeHtml(review.counterpartyEmail || raw.fromEmail || '—')}</td>
        <td>${escapeHtml(raw.mailboxId || '—')}</td>
        <td><span class="${statusClass(status)}">${escapeHtml(status)}</span></td>
        <td>
          <input
            type="text"
            class="cmir-patient-input"
            data-raw-id="${rawId}"
            placeholder="patient-id"
            aria-label="PatientId för ${escapeHtml(review.subject || raw.subject || '')}"
          />
        </td>
        <td>
          <button class="button primary cmir-link-btn" data-raw-id="${rawId}">Länka</button>
        </td>
      `;
      els.queueBody.appendChild(tr);
    }

    for (const btn of els.queueBody.querySelectorAll('.cmir-link-btn')) {
      btn.addEventListener('click', () => {
        const rawId = btn.getAttribute('data-raw-id');
        const input = els.queueBody.querySelector(
          `input.cmir-patient-input[data-raw-id="${rawId}"]`
        );
        const patientId = input?.value?.trim();
        if (!patientId) {
          showToast('Ange ett patientId.', 'error');
          return;
        }
        linkPatient(rawId, patientId, 'review_ui_link', btn);
      });
    }
  }

  async function loadQueue() {
    if (busy) return;
    busy = true;
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = 'Hämtar…';

    try {
      const mailbox = els.mailboxSelect.value;
      const status = els.statusSelect.value;
      const limit = els.limitSelect.value;
      const params = new URLSearchParams();
      if (mailbox) params.set('mailboxEmail', mailbox);
      params.set('status', status);
      params.set('limit', limit);

      const [queueRes, summary] = await Promise.all([
        apiFetch(`/review-queue?${params.toString()}`),
        loadSummary(),
      ]);
      const body = await queueRes.json().catch(() => ({}));
      if (!queueRes.ok) {
        throw new Error(body.error || `HTTP ${queueRes.status}`);
      }
      rows = body.rows || [];
      const summaryText = summary
        ? ` — summary: ${summary.totalUnmatched} unmatched, ${summary.patientLikeCount} patient-liknande, ${summary.nonPatientCount} icke-patient`
        : '';
      els.summary.textContent = `${rows.length} rad(er) — status: ${status}, brevlåda: ${mailbox || 'alla'}${summaryText}`;
      renderQueue();
    } catch (err) {
      showToast(`Kunde inte hämta kö: ${err.message}`, 'error');
    } finally {
      busy = false;
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = 'Hämta';
    }
  }

  els.refreshBtn.addEventListener('click', loadQueue);
  els.mailboxSelect.addEventListener('change', loadQueue);
  els.statusSelect.addEventListener('change', loadQueue);
  els.limitSelect.addEventListener('change', loadQueue);
  els.sweepDryBtn.addEventListener('click', () => runSweep({ dryRun: true }));
  els.sweepBtn.addEventListener('click', () => runSweep({ dryRun: false }));

  checkAuth().catch((err) => {
    els.authMessage.textContent = `Fel vid initiering: ${err.message}`;
  });
})();
