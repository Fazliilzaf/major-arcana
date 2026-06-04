/**
 * CCO Care panel — J-8.1 missing forms, J-7 reminders, J-8.2 draft proposals (global).
 */
(() => {
  'use strict';

  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const TABS = Object.freeze(['forms', 'reminders', 'drafts']);

  const MISSING_LABELS = {
    health_declaration: 'Hälsodeklaration saknas',
    health_declaration_signature: 'Hälsodeklaration ej signerad',
    consultation_plan: 'Behandlingsplan saknas',
    consultation_plan_signature: 'Behandlingsplan ej signerad',
    treatment_agreement: 'Behandlingsavtal saknas eller ej bokningsbart',
  };

  let sheetEl = null;
  let activeTab = 'forms';
  let open = false;
  let pendingDraftCount = 0;
  let userRole = '';

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAuthToken() {
    try {
      const local = normalizeText(window.localStorage.getItem(TOKEN_KEY));
      if (local && local !== '__preview_local__') return local;
      const session = normalizeText(window.sessionStorage.getItem(TOKEN_KEY));
      if (session && session !== '__preview_local__') return session;
    } catch {
      /* ignore */
    }
    return '';
  }

  function formatMissing(keys) {
    return (Array.isArray(keys) ? keys : [])
      .map((key) => MISSING_LABELS[key] || key)
      .filter(Boolean)
      .join(' · ');
  }

  function formatWhen(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(iso)
      );
    } catch {
      return iso;
    }
  }

  async function apiRequest(path, options = {}) {
    const token = getAuthToken();
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.className = 'cco-care-panel-sheet';
    sheetEl.setAttribute('data-cco-care-panel', '1');
    sheetEl.hidden = true;
    sheetEl.innerHTML = `
      <button type="button" class="cco-care-panel-backdrop" data-cco-care-close aria-label="Stäng"></button>
      <div class="cco-care-panel-panel" role="dialog" aria-modal="true" aria-labelledby="cco-care-panel-title">
        <header class="cco-care-panel-head">
          <div>
            <p class="cco-care-panel-kicker">CCO Care</p>
            <h2 id="cco-care-panel-title">Klinik &amp; journal</h2>
          </div>
          <button type="button" class="cco-care-panel-close" data-cco-care-close aria-label="Stäng">✕</button>
        </header>
        <div class="cco-care-panel-tabs" role="tablist" aria-label="CCO Care-vyer">
          <button type="button" class="cco-care-panel-tab is-active" data-cco-care-tab="forms" role="tab">Formulär</button>
          <button type="button" class="cco-care-panel-tab" data-cco-care-tab="reminders" role="tab">Påminnelser</button>
          <button type="button" class="cco-care-panel-tab" data-cco-care-tab="drafts" role="tab">Journalutkast</button>
        </div>
        <p class="cco-care-panel-summary" data-cco-care-summary>Laddar…</p>
        <div class="cco-care-panel-actions" data-cco-care-actions hidden></div>
        <ul class="cco-care-panel-list" data-cco-care-list></ul>
      </div>
    `;
    document.body.appendChild(sheetEl);
    sheetEl.querySelectorAll('[data-cco-care-close]').forEach((node) => {
      node.addEventListener('click', () => setOpen(false));
    });
    sheetEl.querySelectorAll('[data-cco-care-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        setTab(button.getAttribute('data-cco-care-tab') || 'forms', { reload: true });
      });
    });
    return sheetEl;
  }

  function els() {
    ensureSheet();
    return {
      summary: sheetEl.querySelector('[data-cco-care-summary]'),
      list: sheetEl.querySelector('[data-cco-care-list]'),
      actions: sheetEl.querySelector('[data-cco-care-actions]'),
      tabs: sheetEl.querySelectorAll('[data-cco-care-tab]'),
    };
  }

  function setTab(tab, { reload = false } = {}) {
    const next = TABS.includes(tab) ? tab : 'forms';
    activeTab = next;
    const { tabs } = els();
    tabs.forEach((button) => {
      const isActive = button.getAttribute('data-cco-care-tab') === next;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (reload) void loadActiveTab();
  }

  function setOpen(next, tab = activeTab) {
    open = Boolean(next);
    ensureSheet();
    sheetEl.hidden = !open;
    sheetEl.dataset.open = open ? 'true' : 'false';
    document.documentElement.toggleAttribute('data-cco-care-open', open);
    if (open) {
      setTab(tab, { reload: true });
    }
  }

  function openPatient(patientId) {
    const id = normalizeText(patientId);
    if (!id) return;
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'customers');
    url.searchParams.set('patientId', id);
    window.location.assign(url.toString());
  }

  function renderEmpty(message) {
    const { list } = els();
    list.innerHTML = `<li class="cco-care-panel-empty">${escapeHtml(message)}</li>`;
  }

  function syncBadge() {
    document.querySelectorAll('[data-cco-care-badge]').forEach((node) => {
      if (pendingDraftCount > 0) {
        node.textContent = String(pendingDraftCount);
        node.hidden = false;
      } else {
        node.textContent = '';
        node.hidden = true;
      }
    });
  }

  async function resolveUserRole() {
    if (userRole) return userRole;
    try {
      const payload = await apiRequest('/api/v1/auth/me');
      userRole = normalizeText(payload?.user?.role || payload?.role);
    } catch {
      userRole = '';
    }
    return userRole;
  }

  async function loadFormsTab() {
    const { summary, list, actions } = els();
    summary.textContent = 'Laddar saknade formulär…';
    list.innerHTML = '';
    actions.hidden = true;
    actions.innerHTML = '';
    if (!getAuthToken()) {
      summary.textContent = 'Logga in som STAFF/OWNER för att se rapporten.';
      renderEmpty('Ingen session.');
      return;
    }
    try {
      const body = await apiRequest('/api/v1/ops/cco-care/missing-forms-report');
      const report = body?.report || body;
      const generatedAt = normalizeText(body?.generatedAt || report?.generatedAt);
      const count = Number(report?.patientsWithMissing || 0);
      const scanned = Number(report?.patientCount || 0);
      summary.textContent = `${count} patienter med saknade steg (skannade ${scanned})${
        generatedAt ? ` · ${formatWhen(generatedAt)}` : ''
      }`;
      const rows = Array.isArray(report?.rows) ? report.rows : [];
      if (!rows.length) {
        renderEmpty('Inga patienter med saknade formulär i urvalet.');
      } else {
        list.innerHTML = rows
          .slice(0, 100)
          .map(
            (row) => `
          <li class="cco-care-panel-item">
            <button type="button" class="cco-care-panel-item-button" data-cco-care-patient="${escapeHtml(row.patientId || '')}">
              <span class="cco-care-panel-item-name">${escapeHtml(row.displayName || row.patientId || 'Okänd')}</span>
              <span class="cco-care-panel-item-meta">${escapeHtml(formatMissing(row.missing))}</span>
            </button>
          </li>`
          )
          .join('');
        list.querySelectorAll('[data-cco-care-patient]').forEach((button) => {
          button.addEventListener('click', () => openPatient(button.getAttribute('data-cco-care-patient')));
        });
      }
      const role = await resolveUserRole();
      if (role === 'OWNER') {
        actions.hidden = false;
        actions.innerHTML =
          '<button type="button" class="cco-care-panel-refresh" data-cco-care-run-forms>Uppdatera rapport (OWNER)</button>';
        actions.querySelector('[data-cco-care-run-forms]')?.addEventListener('click', async () => {
          summary.textContent = 'Kör schemalagd missing-forms…';
          try {
            await apiRequest('/api/v1/ops/cco-care/run-missing-forms', { method: 'POST', body: '{}' });
            await loadFormsTab();
          } catch (error) {
            summary.textContent = error?.message || 'Kunde inte köra jobbet.';
          }
        });
      }
    } catch (error) {
      summary.textContent = error?.message || 'Kunde inte hämta rapport.';
      renderEmpty('Fel vid laddning.');
    }
  }

  async function loadRemindersTab() {
    const { summary, list, actions } = els();
    summary.textContent = 'Laddar påminnelser…';
    list.innerHTML = '';
    actions.hidden = true;
    actions.innerHTML = '';
    if (!getAuthToken()) {
      summary.textContent = 'Logga in som STAFF/OWNER för att se påminnelser.';
      renderEmpty('Ingen session.');
      return;
    }
    try {
      const body = await apiRequest('/api/v1/ops/cco-care/reminders');
      const queue = body?.queue || {};
      const generatedAt = normalizeText(body?.generatedAt || queue?.generatedAt);
      const visit = Array.isArray(queue?.visitReminders) ? queue.visitReminders : [];
      const aftercare = Array.isArray(queue?.aftercareReminders) ? queue.aftercareReminders : [];
      const total = Number(queue?.total ?? visit.length + aftercare.length);
      summary.textContent = `${total} väntande påminnelser${
        generatedAt ? ` · ${formatWhen(generatedAt)}` : ''
      }`;
      const cachedDigest = normalizeText(body?.lastScheduledRun?.digestHtml || body?.lastScheduledRun?.summary);
      if (cachedDigest) {
        actions.hidden = false;
        actions.innerHTML = `<p class="cco-care-panel-digest">${escapeHtml(cachedDigest.replace(/<[^>]+>/g, ' ').slice(0, 220))}…</p>`;
      }
      const rows = [
        ...visit.map((row) => ({ ...row, kind: 'Besök' })),
        ...aftercare.map((row) => ({ ...row, kind: 'Eftervård' })),
      ];
      if (!rows.length) {
        renderEmpty('Inga aktiva påminnelser i kön.');
        return;
      }
      list.innerHTML = rows
        .slice(0, 80)
        .map((row) => {
          const patientId = normalizeText(row.patientId);
          const name =
            normalizeText(row.customerName) ||
            normalizeText(row.displayName) ||
            patientId ||
            'Okänd';
          const meta = normalizeText(row.message) || normalizeText(row.startsAt) || row.kind;
          return `
          <li class="cco-care-panel-item">
            <button type="button" class="cco-care-panel-item-button" ${
              patientId ? `data-cco-care-patient="${escapeHtml(patientId)}"` : ''
            }>
              <span class="cco-care-panel-item-name">${escapeHtml(name)} · ${escapeHtml(row.kind)}</span>
              <span class="cco-care-panel-item-meta">${escapeHtml(meta)}</span>
            </button>
          </li>`;
        })
        .join('');
      list.querySelectorAll('[data-cco-care-patient]').forEach((button) => {
        button.addEventListener('click', () => openPatient(button.getAttribute('data-cco-care-patient')));
      });
    } catch (error) {
      summary.textContent = error?.message || 'Kunde inte hämta påminnelser.';
      renderEmpty('Fel vid laddning.');
    }
  }

  async function loadDraftsTab() {
    const { summary, list } = els();
    summary.textContent = 'Laddar journalutkast…';
    list.innerHTML = '';
    if (!getAuthToken()) {
      summary.textContent = 'Logga in som STAFF/OWNER för att se utkast.';
      renderEmpty('Ingen session.');
      pendingDraftCount = 0;
      syncBadge();
      return;
    }
    try {
      const body = await apiRequest(
        '/api/v1/ops/cco-care/draft-proposals?status=pending&limit=20'
      );
      const proposals = Array.isArray(body?.proposals) ? body.proposals : [];
      pendingDraftCount = proposals.length;
      syncBadge();
      const generatedAt = normalizeText(body?.generatedAt);
      summary.textContent = `${proposals.length} väntande journalutkast${
        generatedAt ? ` · ${formatWhen(generatedAt)}` : ''
      }`;
      if (!proposals.length) {
        renderEmpty('Inga väntande journalutkast.');
        return;
      }
      list.innerHTML = proposals
        .map((row) => {
          const patientId = normalizeText(row.patientId);
          const name = normalizeText(row.displayName) || patientId || 'Okänd';
          const missing = formatMissing(row.missing);
          return `
          <li class="cco-care-panel-item">
            <button type="button" class="cco-care-panel-item-button" data-cco-care-patient="${escapeHtml(patientId)}">
              <span class="cco-care-panel-item-name">${escapeHtml(name)}</span>
              <span class="cco-care-panel-item-meta">${escapeHtml(missing || 'Granska utkast')}</span>
            </button>
          </li>`;
        })
        .join('');
      list.querySelectorAll('[data-cco-care-patient]').forEach((button) => {
        button.addEventListener('click', () => openPatient(button.getAttribute('data-cco-care-patient')));
      });
    } catch (error) {
      summary.textContent = error?.message || 'Kunde inte hämta utkast.';
      renderEmpty('Fel vid laddning.');
      pendingDraftCount = 0;
      syncBadge();
    }
  }

  async function loadActiveTab() {
    if (activeTab === 'reminders') return loadRemindersTab();
    if (activeTab === 'drafts') return loadDraftsTab();
    return loadFormsTab();
  }

  async function prefetchBadge() {
    if (!getAuthToken()) return;
    try {
      const body = await apiRequest(
        '/api/v1/ops/cco-care/draft-proposals?status=pending&limit=20'
      );
      pendingDraftCount = Array.isArray(body?.proposals) ? body.proposals.length : 0;
      syncBadge();
    } catch {
      /* ignore */
    }
  }

  function bindTriggers() {
    document.querySelectorAll('[data-cco-care-open]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.preventDefault();
        const tab = node.getAttribute('data-cco-care-tab') || 'forms';
        setOpen(true, tab);
      });
    });
    document.querySelectorAll('[data-missing-forms-open]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(true, 'forms');
      });
    });
  }

  window.ArcanaCcoCarePanel = Object.freeze({
    open: (tab = 'forms') => setOpen(true, tab),
    close: () => setOpen(false),
    reload: () => loadActiveTab(),
    setTab,
    prefetchBadge,
  });

  window.ArcanaMissingFormsOps = Object.freeze({
    open: () => setOpen(true, 'forms'),
    close: () => setOpen(false),
    reload: () => loadFormsTab(),
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindTriggers();
      void prefetchBadge();
    }, { once: true });
  } else {
    bindTriggers();
    void prefetchBadge();
  }
})();
