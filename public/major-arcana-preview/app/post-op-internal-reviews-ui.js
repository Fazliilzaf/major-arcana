'use strict';

(function initPostOpReviewsUi() {
  const ADMIN_TOKEN_KEY = 'arcana_admin_token';

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function getAdminToken() {
    try {
      const local = normalizeText(window.localStorage.getItem(ADMIN_TOKEN_KEY));
      if (local && local !== '__preview_local__') return local;
      const session = normalizeText(window.sessionStorage.getItem(ADMIN_TOKEN_KEY));
      if (session && session !== '__preview_local__') return session;
    } catch {
      /* ignore */
    }
    return '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('sv-SE', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  async function apiRequest(path, options = {}) {
    const token = getAdminToken();
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  const root = document.querySelector('[data-post-op-google-reviews]');
  if (!root) return;

  const els = {
    panel: root,
    count: root.querySelector('[data-post-op-google-count]'),
    list: root.querySelector('[data-post-op-google-list]'),
    empty: root.querySelector('[data-post-op-google-empty]'),
    status: root.querySelector('[data-post-op-google-status]'),
  };

  let loading = false;

  function staffSessionReady() {
    if (document.documentElement.getAttribute('data-cco-auth-required') === 'on') {
      return false;
    }
    return Boolean(getAdminToken());
  }

  function hidePanel() {
    if (els.panel) els.panel.hidden = true;
    if (els.empty) els.empty.hidden = true;
    if (els.list) els.list.innerHTML = '';
    setStatus('', '');
  }

  function setStatus(message = '', tone = '') {
    if (!els.status) return;
    els.status.hidden = !message;
    els.status.textContent = message;
    els.status.dataset.statusTone = tone;
  }

  function isPending(item) {
    return !item.googleReviewApprovedAt && !item.googleReviewRejectedAt;
  }

  function renderItems(items) {
    if (!els.list || !els.empty) return;
    const pending = items.filter((item) => isPending(item));
    if (els.count) {
      els.count.textContent = String(pending.length);
    }
    if (!pending.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      els.panel.hidden = true;
      return;
    }
    els.empty.hidden = true;
    els.panel.hidden = false;
    els.list.innerHTML = pending
      .map((item) => {
        const stars = '★'.repeat(Number(item.reviewRating || 0)).padEnd(5, '☆');
        return `
          <article class="post-op-internal-item post-op-google-item" data-submission-id="${escapeHtml(item.submissionId)}">
            <div class="post-op-internal-item-head">
              <strong>${escapeHtml(item.patientName || 'Okänd kund')}</strong>
              <span class="post-op-internal-stars" aria-label="${Number(item.reviewRating)}/5">${stars}</span>
            </div>
            <p class="post-op-internal-meta">
              ${escapeHtml(item.treatmentLabel || 'behandling')}
              · ${formatWhen(item.reviewFeedbackAt)}
              ${item.customerEmail ? ` · ${escapeHtml(item.customerEmail)}` : ''}
              ${item.photoCount ? ` · ${item.photoCount} bild(er)` : ''}
            </p>
            <p class="post-op-internal-feedback">${escapeHtml(item.reviewFeedback || 'Ingen kommentar')}</p>
            <div class="post-op-internal-actions">
              ${
                item.patientId
                  ? `<a class="customers-utility-button" href="/staff?view=customers&patientId=${encodeURIComponent(item.patientId)}">Öppna kund</a>`
                  : item.customerEmail
                    ? `<a class="customers-utility-button" href="mailto:${escapeHtml(item.customerEmail)}">Mejla kund</a>`
                    : ''
              }
              <button type="button" class="customers-utility-button customers-utility-button-primary" data-post-op-approve-google="${escapeHtml(item.submissionId)}">Godkänn Google</button>
              <button type="button" class="customers-utility-button" data-post-op-reject-google="${escapeHtml(item.submissionId)}">Skicka inte till Google</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  async function refresh() {
    if (loading) return;
    if (!staffSessionReady()) {
      hidePanel();
      return;
    }
    loading = true;
    setStatus('Hämtar omdömen…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/post-op-reviews/google-queue');
      renderItems(Array.isArray(payload.items) ? payload.items : []);
      setStatus('', '');
    } catch (error) {
      if (error.statusCode === 401) {
        els.panel.hidden = true;
        setStatus('', '');
        return;
      }
      setStatus(error.message || 'Kunde inte läsa omdömen.', 'error');
    } finally {
      loading = false;
    }
  }

  async function approveGoogle(submissionId) {
    if (!submissionId) return;
    setStatus('Godkänner för Google…', 'loading');
    try {
      await apiRequest(
        `/api/v1/post-op-reviews/${encodeURIComponent(submissionId)}/approve-google-review`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStatus('Godkänd — patienten kan gå vidare till Google via sin länk.', 'success');
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Kunde inte godkänna.', 'error');
    }
  }

  async function rejectGoogle(submissionId) {
    if (!submissionId) return;
    setStatus('Avvisar för Google…', 'loading');
    try {
      await apiRequest(
        `/api/v1/post-op-reviews/${encodeURIComponent(submissionId)}/reject-google-review`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStatus('Avvisad — skickas inte till Google.', 'success');
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Kunde inte avvisa.', 'error');
    }
  }

  root.addEventListener('click', (event) => {
    const approveBtn = event.target.closest('[data-post-op-approve-google]');
    if (approveBtn) {
      event.preventDefault();
      void approveGoogle(approveBtn.getAttribute('data-post-op-approve-google'));
      return;
    }
    const rejectBtn = event.target.closest('[data-post-op-reject-google]');
    if (rejectBtn) {
      event.preventDefault();
      void rejectGoogle(rejectBtn.getAttribute('data-post-op-reject-google'));
    }
  });

  window.ArcanaPostOpInternalReviews = { refresh, hide: hidePanel };

  hidePanel();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void refresh());
  } else {
    void refresh();
  }

  try {
    new MutationObserver(() => {
      if (!staffSessionReady()) hidePanel();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-cco-auth-required'],
    });
  } catch {
    /* ignore */
  }
})();
