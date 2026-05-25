/**
 * J-8.1: STAFF-panel för daglig rapport — saknade formulär/samtycken.
 */
(() => {
  'use strict';

  const API_PATH = '/api/v1/ops/cco-care/missing-forms-report';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';

  const MISSING_LABELS = {
    health_declaration: 'Hälsodeklaration saknas',
    health_declaration_signature: 'Hälsodeklaration ej signerad',
    consultation_plan: 'Behandlingsplan saknas',
    consultation_plan_signature: 'Behandlingsplan ej signerad',
    treatment_agreement: 'Behandlingsavtal saknas eller ej bokningsbart',
  };

  let sheetEl = null;
  let listEl = null;
  let summaryEl = null;
  let open = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAuthToken() {
    try {
      const local = String(window.localStorage.getItem(TOKEN_KEY) || '').trim();
      if (local && local !== '__preview_local__') return local;
      const session = String(window.sessionStorage.getItem(TOKEN_KEY) || '').trim();
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

  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement('div');
    sheetEl.className = 'cco-missing-forms-sheet';
    sheetEl.setAttribute('data-missing-forms-sheet', '1');
    sheetEl.hidden = true;
    sheetEl.innerHTML = `
      <button type="button" class="cco-missing-forms-backdrop" data-missing-forms-close aria-label="Stäng"></button>
      <div class="cco-missing-forms-panel" role="dialog" aria-modal="true" aria-labelledby="cco-missing-forms-title">
        <header class="cco-missing-forms-head">
          <div>
            <p class="cco-missing-forms-kicker">CCO care · J-8.1</p>
            <h2 id="cco-missing-forms-title">Saknade formulär</h2>
          </div>
          <button type="button" class="cco-missing-forms-close" data-missing-forms-close aria-label="Stäng">✕</button>
        </header>
        <p class="cco-missing-forms-summary" data-missing-forms-summary>Laddar rapport…</p>
        <ul class="cco-missing-forms-list" data-missing-forms-list></ul>
      </div>
    `;
    document.body.appendChild(sheetEl);
    summaryEl = sheetEl.querySelector('[data-missing-forms-summary]');
    listEl = sheetEl.querySelector('[data-missing-forms-list]');
    sheetEl.querySelectorAll('[data-missing-forms-close]').forEach((node) => {
      node.addEventListener('click', () => setOpen(false));
    });
    return sheetEl;
  }

  function setOpen(next) {
    open = Boolean(next);
    ensureSheet();
    sheetEl.hidden = !open;
    sheetEl.dataset.open = open ? 'true' : 'false';
    document.documentElement.toggleAttribute('data-missing-forms-open', open);
    if (open) void loadReport();
  }

  function renderRows(report) {
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    if (!rows.length) {
      listEl.innerHTML =
        '<li class="cco-missing-forms-empty">Inga patienter med saknade formulär i urvalet.</li>';
      return;
    }
    listEl.innerHTML = rows
      .slice(0, 100)
      .map((row) => {
        const name = escapeHtml(row.displayName || row.patientId || 'Okänd');
        const missing = escapeHtml(formatMissing(row.missing));
        const patientId = escapeHtml(row.patientId || '');
        return `
          <li class="cco-missing-forms-item">
            <button type="button" class="cco-missing-forms-item-button" data-missing-forms-patient="${patientId}">
              <span class="cco-missing-forms-item-name">${name}</span>
              <span class="cco-missing-forms-item-meta">${missing}</span>
            </button>
          </li>`;
      })
      .join('');

    listEl.querySelectorAll('[data-missing-forms-patient]').forEach((button) => {
      button.addEventListener('click', () => {
        const patientId = button.getAttribute('data-missing-forms-patient');
        if (!patientId) return;
        setOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'customers');
        url.searchParams.set('patientId', patientId);
        window.location.assign(url.toString());
      });
    });
  }

  async function loadReport() {
    const token = getAuthToken();
    summaryEl.textContent = 'Laddar rapport…';
    listEl.innerHTML = '';
    if (!token) {
      summaryEl.textContent = 'Logga in som STAFF/OWNER för att se rapporten.';
      return;
    }
    try {
      const response = await fetch(API_PATH, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        summaryEl.textContent = `Kunde inte hämta rapport (HTTP ${response.status}).`;
        return;
      }
      const body = await response.json();
      const report = body?.report || body;
      const count = Number(report?.patientsWithMissing || 0);
      const scanned = Number(report?.patientCount || 0);
      summaryEl.textContent = `${count} patienter med saknade steg (skannade ${scanned}).`;
      renderRows(report);
    } catch (error) {
      summaryEl.textContent = error?.message || 'Kunde inte hämta rapport.';
    }
  }

  function bindTriggers() {
    document.querySelectorAll('[data-missing-forms-open]').forEach((node) => {
      node.addEventListener('click', (event) => {
        event.preventDefault();
        setOpen(true);
      });
    });
  }

  window.ArcanaMissingFormsOps = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    reload: () => loadReport(),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTriggers, { once: true });
  } else {
    bindTriggers();
  }
})();
