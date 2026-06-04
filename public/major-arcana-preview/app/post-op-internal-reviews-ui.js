'use strict';

(function initPostOpReviewsUi() {
  const ADMIN_TOKEN_KEY = 'arcana_admin_token';
  const shell = document.getElementById('customers-post-op-reviews-shell');
  const openButton = document.querySelector('[data-post-op-reviews-open]');
  const closeTargets = document.querySelectorAll('[data-post-op-reviews-close]');
  const root = document.querySelector('[data-post-op-google-reviews]');

  if (!shell || !root) return;

  const els = {
    shell,
    openButton,
    toolbarCount: document.querySelector('[data-post-op-toolbar-count]'),
    list: root.querySelector('[data-post-op-google-list]'),
    empty: root.querySelector('[data-post-op-google-empty]'),
    status: root.querySelector('[data-post-op-google-status]'),
  };

  let loading = false;
  let pendingCount = 0;

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

  function staffSessionReady() {
    if (document.documentElement.getAttribute('data-cco-auth-required') === 'on') {
      return false;
    }
    return Boolean(getAdminToken());
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

  function setStatus(message = '', tone = '') {
    if (!els.status) return;
    els.status.hidden = !message;
    els.status.textContent = message;
    els.status.dataset.statusTone = tone;
  }

  function setModalOpen(open) {
    if (!shell) return;
    if (open) {
      shell.setAttribute('data-open', '');
      shell.setAttribute('aria-hidden', 'false');
    } else {
      shell.removeAttribute('data-open');
      shell.setAttribute('aria-hidden', 'true');
    }
  }

  function syncToolbarButton() {
    if (!els.openButton) return;
    if (!staffSessionReady()) {
      els.openButton.hidden = true;
      return;
    }
    els.openButton.hidden = false;
    if (els.toolbarCount) {
      if (pendingCount > 0) {
        els.toolbarCount.textContent = `(${pendingCount})`;
        els.toolbarCount.hidden = false;
      } else {
        els.toolbarCount.textContent = '';
        els.toolbarCount.hidden = true;
      }
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

  function isPending(item) {
    return !item.googleReviewApprovedAt && !item.googleReviewRejectedAt;
  }

  function renderItems(items) {
    if (!els.list || !els.empty) return;
    const pending = items.filter((item) => isPending(item));
    pendingCount = pending.length;
    syncToolbarButton();

    if (!pending.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
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
      pendingCount = 0;
      syncToolbarButton();
      setModalOpen(false);
      return;
    }
    loading = true;
    try {
      const payload = await apiRequest('/api/v1/post-op-reviews/google-queue');
      renderItems(Array.isArray(payload.items) ? payload.items : []);
      setStatus('', '');
    } catch (error) {
      pendingCount = 0;
      syncToolbarButton();
      if (error.statusCode === 401) {
        setModalOpen(false);
        return;
      }
      setStatus(error.message || 'Kunde inte läsa omdömen.', 'error');
    } finally {
      loading = false;
    }
  }

  async function openModal() {
    if (!staffSessionReady()) return;
    setModalOpen(true);
    setStatus('Hämtar omdömen…', 'loading');
    await refresh();
  }

  function hidePanel() {
    pendingCount = 0;
    syncToolbarButton();
    setModalOpen(false);
    setStatus('', '');
    if (els.list) els.list.innerHTML = '';
    if (els.empty) els.empty.hidden = true;
  }

  async function approveGoogle(submissionId) {
    if (!submissionId) return;
    setStatus('Godkänner för Google…', 'loading');
    try {
      await apiRequest(
        `/api/v1/post-op-reviews/${encodeURIComponent(submissionId)}/approve-google-review`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setStatus('Godkänd för Google.', 'success');
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
      setStatus('Avvisad för Google.', 'success');
      await refresh();
    } catch (error) {
      setStatus(error.message || 'Kunde inte avvisa.', 'error');
    }
  }

  openButton?.addEventListener('click', () => {
    void openModal();
  });

  closeTargets.forEach((node) => {
    node.addEventListener('click', () => setModalOpen(false));
  });

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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shell.hasAttribute('data-open')) {
      setModalOpen(false);
    }
  });

  window.ArcanaPostOpInternalReviews = { refresh, hide: hidePanel };

  hidePanel();

  let postOpRefreshTimer = null;
  function schedulePostOpRefresh() {
    if (!staffSessionReady()) {
      hidePanel();
      return;
    }
    if (postOpRefreshTimer) window.clearTimeout(postOpRefreshTimer);
    postOpRefreshTimer = window.setTimeout(() => {
      postOpRefreshTimer = null;
      void refresh();
    }, 1200);
  }

  try {
    new MutationObserver(() => {
      schedulePostOpRefresh();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-cco-auth-required'],
    });
  } catch {
    /* ignore */
  }
})();
