/**
 * Major Arcana Preview — Operational Insights Dashboard (OI2).
 *
 * Pollar /api/v1/capabilities/CcoOperationalKpis var 30:e sekund.
 * Renderar KPI-kort, sparkline (7d), top-domains, alerts.
 *
 * Open via:
 *   - Cmd+K → "Operations dashboard"
 *   - location.hash === '#ops'
 *   - window.MajorArcanaPreviewOpsDashboard.open()
 *
 * Public API (window.MajorArcanaPreviewOpsDashboard):
 *   - mount()
 *   - open()
 *   - close()
 *   - refresh()
 */
(() => {
  'use strict';

  const POLL_INTERVAL_MS = 30 * 1000;
  const ENDPOINT = '/api/v1/capabilities/CcoOperationalKpis/run';

  let dialog = null;
  let pollHandle = null;
  let lastData = null;

  function injectStyles() {
    if (document.getElementById('cco-ops-dashboard-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-ops-dashboard-styles';
    style.textContent = `
.cco-ops-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--cco-z-modal, 10000);
  background: var(--cco-bg-overlay, rgba(43,37,31,0.55));
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 16px;
  overflow-y: auto;
  font-family: var(--cco-font-sans, sans-serif);
}
.cco-ops-dialog[aria-hidden="true"] { display: none; }
.cco-ops-panel {
  width: min(1100px, 100%);
  background: var(--cco-bg-surface, #ffffff);
  color: var(--cco-text-primary, #2b251f);
  border-radius: var(--cco-radius-xl, 16px);
  box-shadow: var(--cco-shadow-2xl, 0 32px 80px rgba(43,37,31,0.22));
  overflow: hidden;
}
.cco-ops-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cco-border-subtle, rgba(43,37,31,0.08));
  gap: 12px;
}
.cco-ops-title {
  margin: 0;
  font-size: var(--cco-text-xl, 19px);
  font-weight: var(--cco-weight-semibold, 600);
}
.cco-ops-meta {
  font-size: var(--cco-text-sm, 12px);
  color: var(--cco-text-tertiary, #8a8174);
  white-space: nowrap;
}
.cco-ops-actions { display: inline-flex; gap: 8px; align-items: center; }
.cco-ops-btn {
  background: var(--cco-bg-surface-sunken, #f5efe6);
  border: 1px solid var(--cco-border-default, rgba(43,37,31,0.15));
  color: var(--cco-text-primary, #2b251f);
  font: var(--cco-weight-medium, 500) var(--cco-text-sm, 12px) var(--cco-font-sans, sans-serif);
  padding: 6px 12px;
  border-radius: var(--cco-radius-sm, 4px);
  cursor: pointer;
  transition: all var(--cco-duration-fast, 150ms);
}
.cco-ops-btn:hover { background: var(--cco-bg-surface, #fff); border-color: var(--cco-border-strong, rgba(43,37,31,0.3)); }
.cco-ops-btn:focus-visible { outline: 2px solid var(--cco-focus-ring, #4a8268); outline-offset: 2px; }
.cco-ops-btn--close {
  background: transparent;
  border: none;
  font-size: 22px;
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cco-radius-sm, 4px);
}
.cco-ops-btn--close:hover { background: var(--cco-bg-surface-sunken, #f5efe6); }

.cco-ops-body { padding: 20px; max-height: 80vh; overflow-y: auto; }
.cco-ops-loading {
  text-align: center;
  padding: 60px 20px;
  color: var(--cco-text-tertiary, #8a8174);
}

.cco-ops-alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.cco-ops-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--cco-radius-md, 8px);
  font-size: var(--cco-text-base, 14px);
  border-left: 4px solid;
}
.cco-ops-alert--warning { background: var(--cco-status-warning-bg, rgba(200,130,30,0.12)); border-color: var(--cco-status-warning, #c8821e); }
.cco-ops-alert--info { background: var(--cco-status-info-bg, rgba(74,123,168,0.12)); border-color: var(--cco-status-info, #4a7ba8); }
.cco-ops-alert--success { background: var(--cco-status-success-bg, rgba(74,130,104,0.12)); border-color: var(--cco-status-success, #4a8268); }
.cco-ops-alert--danger { background: var(--cco-status-danger-bg, rgba(185,74,74,0.12)); border-color: var(--cco-status-danger, #b94a4a); }

.cco-ops-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.cco-ops-kpi {
  padding: 14px 16px;
  background: var(--cco-bg-surface-sunken, #f5efe6);
  border-radius: var(--cco-radius-md, 8px);
  border: 1px solid var(--cco-border-subtle, rgba(43,37,31,0.08));
}
.cco-ops-kpi-label {
  font-size: var(--cco-text-xs, 11px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cco-text-tertiary, #8a8174);
  margin: 0 0 6px 0;
  font-weight: var(--cco-weight-medium, 500);
}
.cco-ops-kpi-value {
  font-size: var(--cco-text-3xl, 30px);
  font-weight: var(--cco-weight-semibold, 600);
  margin: 0;
  line-height: var(--cco-leading-tight, 1.2);
  color: var(--cco-text-primary, #2b251f);
  font-variant-numeric: tabular-nums;
}
.cco-ops-kpi-delta {
  font-size: var(--cco-text-sm, 12px);
  color: var(--cco-text-secondary, #5d544a);
  margin-top: 4px;
}
.cco-ops-kpi-delta--up { color: var(--cco-status-success, #4a8268); }
.cco-ops-kpi-delta--down { color: var(--cco-status-danger, #b94a4a); }

.cco-ops-section {
  background: var(--cco-bg-surface-sunken, #f5efe6);
  border: 1px solid var(--cco-border-subtle, rgba(43,37,31,0.08));
  border-radius: var(--cco-radius-md, 8px);
  padding: 16px;
  margin-bottom: 16px;
}
.cco-ops-section-title {
  margin: 0 0 12px 0;
  font-size: var(--cco-text-base, 14px);
  font-weight: var(--cco-weight-semibold, 600);
  color: var(--cco-text-primary, #2b251f);
}

.cco-ops-sparkline {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 60px;
  padding: 4px 0;
}
.cco-ops-spark-bar {
  flex: 1;
  background: var(--cco-color-accent, #4a8268);
  border-radius: 3px 3px 0 0;
  position: relative;
  min-height: 2px;
  transition: opacity 150ms;
}
.cco-ops-spark-bar:hover { opacity: 0.75; }
.cco-ops-spark-bar--zero {
  background: var(--cco-border-default, rgba(43,37,31,0.15));
}
.cco-ops-spark-labels {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  font-size: var(--cco-text-xs, 11px);
  color: var(--cco-text-tertiary, #8a8174);
}
.cco-ops-spark-label { flex: 1; text-align: center; font-variant-numeric: tabular-nums; }

.cco-ops-twocol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 720px) { .cco-ops-twocol { grid-template-columns: 1fr; } }

.cco-ops-list { list-style: none; padding: 0; margin: 0; }
.cco-ops-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: var(--cco-text-base, 14px);
  border-bottom: 1px solid var(--cco-border-subtle, rgba(43,37,31,0.08));
}
.cco-ops-list-item:last-child { border-bottom: none; }
.cco-ops-list-key { color: var(--cco-text-primary, #2b251f); font-weight: var(--cco-weight-medium, 500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
.cco-ops-list-bar {
  flex: 1;
  height: 6px;
  background: var(--cco-border-subtle, rgba(43,37,31,0.08));
  border-radius: 3px;
  margin: 0 12px;
  overflow: hidden;
}
.cco-ops-list-bar-fill {
  height: 100%;
  background: var(--cco-color-accent, #4a8268);
  border-radius: 3px;
}
.cco-ops-list-count {
  font-variant-numeric: tabular-nums;
  font-weight: var(--cco-weight-semibold, 600);
  color: var(--cco-text-secondary, #5d544a);
  min-width: 32px;
  text-align: right;
}

.cco-ops-empty {
  padding: 12px;
  text-align: center;
  color: var(--cco-text-tertiary, #8a8174);
  font-size: var(--cco-text-sm, 12px);
}
.cco-ops-error {
  padding: 16px;
  background: var(--cco-status-danger-bg, rgba(185,74,74,0.12));
  border-left: 4px solid var(--cco-status-danger, #b94a4a);
  border-radius: var(--cco-radius-md, 8px);
  color: var(--cco-text-primary, #2b251f);
}
`.trim();
    document.head.appendChild(style);
  }

  function buildDialog() {
    if (dialog && document.body.contains(dialog)) return dialog;
    dialog = document.createElement('div');
    dialog.className = 'cco-ops-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Operations dashboard');
    dialog.setAttribute('aria-hidden', 'true');

    dialog.innerHTML = `
      <div class="cco-ops-panel">
        <div class="cco-ops-header">
          <h2 class="cco-ops-title">Operations dashboard</h2>
          <span class="cco-ops-meta" data-meta>—</span>
          <div class="cco-ops-actions">
            <button type="button" class="cco-ops-btn" data-action="enrich">Kör intelligence-backfill</button>
            <button type="button" class="cco-ops-btn" data-action="consolidate">Konsolidera kunder</button>
            <button type="button" class="cco-ops-btn" data-action="digest">Förhandsgranska digest</button>
            <button type="button" class="cco-ops-btn" data-action="refresh">Uppdatera</button>
            <button type="button" class="cco-ops-btn cco-ops-btn--close" data-action="close" aria-label="Stäng">×</button>
          </div>
        </div>
        <div class="cco-ops-body" data-body>
          <div class="cco-ops-loading">Hämtar nyckeltal…</div>
        </div>
      </div>
    `;

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    dialog.querySelector('[data-action="close"]').addEventListener('click', close);
    dialog.querySelector('[data-action="refresh"]').addEventListener('click', refresh);
    dialog.querySelector('[data-action="digest"]').addEventListener('click', previewDigest);
    dialog.querySelector('[data-action="enrich"]').addEventListener('click', runIntelligenceBackfill);
    dialog.querySelector('[data-action="consolidate"]').addEventListener('click', consolidateCustomers);

    document.body.appendChild(dialog);
    return dialog;
  }

  async function fetchKpis() {
    const tenantHeader = (() => {
      try {
        return document.cookie.match(/cco_tenant=([^;]+)/)?.[1] || '';
      } catch (_e) {
        return '';
      }
    })();
    const headers = {
      'Content-Type': 'application/json',
      'X-CCO-Channel': 'admin',
    };
    if (tenantHeader) headers['X-Tenant-Id'] = tenantHeader;
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ input: { windowDays: 7 } }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function renderSparkline(timeseries, accessor) {
    if (!Array.isArray(timeseries) || timeseries.length === 0) {
      return '<div class="cco-ops-empty">Ingen historik.</div>';
    }
    const values = timeseries.map(accessor);
    const max = Math.max(1, ...values);
    const bars = timeseries
      .map((d) => {
        const v = accessor(d);
        const h = Math.max(2, Math.round((v / max) * 60));
        const cls = v === 0 ? ' cco-ops-spark-bar--zero' : '';
        return `<div class="cco-ops-spark-bar${cls}" style="height:${h}px" title="${d.date}: ${v}"></div>`;
      })
      .join('');
    const labels = timeseries
      .map((d) => `<span class="cco-ops-spark-label">${d.date.slice(5)}</span>`)
      .join('');
    return `<div class="cco-ops-sparkline">${bars}</div><div class="cco-ops-spark-labels">${labels}</div>`;
  }

  function renderList(items, keyName = 'key') {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="cco-ops-empty">Inga poster.</div>';
    }
    const max = Math.max(1, ...items.map((i) => i.count));
    return (
      '<ul class="cco-ops-list">' +
      items
        .map((item) => {
          const key = String(item[keyName] || '—');
          const pct = Math.round((item.count / max) * 100);
          return (
            '<li class="cco-ops-list-item">' +
            '<span class="cco-ops-list-key">' +
            escapeHtml(key) +
            '</span>' +
            '<span class="cco-ops-list-bar"><span class="cco-ops-list-bar-fill" style="width:' +
            pct +
            '%"></span></span>' +
            '<span class="cco-ops-list-count">' +
            item.count +
            '</span>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function renderAlerts(alerts) {
    if (!Array.isArray(alerts) || alerts.length === 0) {
      return (
        '<div class="cco-ops-alert cco-ops-alert--success">' +
        '✓ Allt ser bra ut. Inga aktiva varningar.' +
        '</div>'
      );
    }
    return alerts
      .map(
        (a) =>
          '<div class="cco-ops-alert cco-ops-alert--' +
          (a.severity === 'warning' ? 'warning' : a.severity === 'info' ? 'info' : 'danger') +
          '">' +
          escapeHtml(a.message) +
          '</div>'
      )
      .join('');
  }

  function renderBody(payload) {
    if (!payload || payload.error) {
      return (
        '<div class="cco-ops-error">' +
        'Kunde inte hämta nyckeltal: ' +
        escapeHtml(payload?.error || 'okänt fel') +
        '</div>'
      );
    }
    const data = payload.data || {};
    const t = data.throughput || {};
    const at = data.actionsTotals || {};
    const ts = data.dailyTimeseries || [];
    const alerts = data.alerts || [];

    const deltaToday =
      t.yesterday > 0 ? Math.round(((t.today - t.yesterday) / t.yesterday) * 100) : null;
    const deltaCls = deltaToday == null ? '' : deltaToday >= 0 ? 'cco-ops-kpi-delta--up' : 'cco-ops-kpi-delta--down';
    const deltaSign = deltaToday == null ? '—' : (deltaToday >= 0 ? '+' : '') + deltaToday + ' %';

    return `
      <div class="cco-ops-alerts">${renderAlerts(alerts)}</div>

      <div class="cco-ops-grid">
        <div class="cco-ops-kpi">
          <p class="cco-ops-kpi-label">Avslut idag</p>
          <p class="cco-ops-kpi-value">${t.today || 0}</p>
          <p class="cco-ops-kpi-delta ${deltaCls}">${deltaSign} mot igår (${t.yesterday || 0})</p>
        </div>
        <div class="cco-ops-kpi">
          <p class="cco-ops-kpi-label">Avslut 7 dagar</p>
          <p class="cco-ops-kpi-value">${t.last7d || 0}</p>
          <p class="cco-ops-kpi-delta">${(t.last7dAvgPerDay || 0).toFixed(1)} per dag</p>
        </div>
        <div class="cco-ops-kpi">
          <p class="cco-ops-kpi-label">Avslut 30 dagar</p>
          <p class="cco-ops-kpi-value">${t.last30d || 0}</p>
          <p class="cco-ops-kpi-delta">trend ${t.weekOverWeekDeltaPct >= 0 ? '+' : ''}${t.weekOverWeekDeltaPct || 0}%</p>
        </div>
        <div class="cco-ops-kpi">
          <p class="cco-ops-kpi-label">Aktioner idag</p>
          <p class="cco-ops-kpi-value">${at.today || 0}</p>
          <p class="cco-ops-kpi-delta">${at.last7d || 0} senaste 7d</p>
        </div>
      </div>

      <div class="cco-ops-section">
        <h3 class="cco-ops-section-title">Avslut per dag (7d)</h3>
        ${renderSparkline(ts, (d) => d.outcomeCount)}
      </div>

      <div class="cco-ops-twocol">
        <div class="cco-ops-section">
          <h3 class="cco-ops-section-title">Outcome-fördelning (7d)</h3>
          ${renderList(data.outcomeBreakdown || [])}
        </div>
        <div class="cco-ops-section">
          <h3 class="cco-ops-section-title">Intent-fördelning (7d)</h3>
          ${renderList(data.intentBreakdown || [])}
        </div>
        <div class="cco-ops-section">
          <h3 class="cco-ops-section-title">Action-typer (7d)</h3>
          ${renderList(data.actionTypeBreakdown || [])}
        </div>
        <div class="cco-ops-section">
          <h3 class="cco-ops-section-title">Top kund-domäner (7d)</h3>
          ${renderList(data.topDomains || [], 'domain')}
        </div>
      </div>
    `;
  }

  async function runIntelligenceBackfill() {
    try {
      window.MajorArcanaPreviewToast?.info('Kör intelligence-backfill…');
      const res = await fetch('/api/v1/ops/intelligence/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'backfill' }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const r = data.result || {};
      window.MajorArcanaPreviewToast?.success(
        'Backfill klar: ' +
          r.enriched +
          ' berikade, ' +
          r.skipped +
          ' redan up-to-date, ' +
          r.failed +
          ' fel (' +
          Math.round((r.durationMs || 0) / 1000) +
          ' s).',
        { title: 'Intelligence-backfill', duration: 8000 }
      );
    } catch (err) {
      window.MajorArcanaPreviewToast?.error(
        'Backfill misslyckades: ' + (err?.message || 'okänt'),
        { title: 'Intelligence-backfill' }
      );
    }
  }

  async function consolidateCustomers() {
    const confirmed = confirm(
      'Konsolidera kunder mot contact@hairtpclinic.com?\n\n' +
        'Detta sätter preferredMailbox=contact@ för alla kunder som skrivit till mer än en mailbox. ' +
        'Reversibel — påverkar inte själva mail-trådarna.'
    );
    if (!confirmed) return;
    try {
      window.MajorArcanaPreviewToast?.info('Konsoliderar kunder…');
      const res = await fetch('/api/v1/ops/customers/consolidate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredMailbox: 'contact@hairtpclinic.com', dryRun: false }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const sampleText = (data.samples || [])
        .slice(0, 3)
        .map((s) => '• ' + (s.customerName || s.customerEmail) + ' (' + s.totalMessages + ' mail)')
        .join('\n');
      window.MajorArcanaPreviewToast?.success(
        'Konsolidering klar: ' +
          data.updated +
          ' av ' +
          data.candidatesFound +
          ' kunder uppdaterade.\n\n' +
          (sampleText ? 'Exempel:\n' + sampleText : ''),
        { title: 'Konsolidering', duration: 12000 }
      );
    } catch (err) {
      window.MajorArcanaPreviewToast?.error(
        'Konsolidering misslyckades: ' + (err?.message || 'okänt'),
        { title: 'Konsolidering' }
      );
    }
  }

  async function previewDigest() {
    if (!lastData) {
      try {
        window.MajorArcanaPreviewToast?.warning('Vänta på första uppdateringen.');
      } catch (_e) {}
      return;
    }
    try {
      const locale = window.MajorArcanaPreviewI18n?.getLocale?.() || 'sv';
      const res = await fetch('/api/v1/ops/digest/preview?format=html', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpis: lastData, locale }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const win = window.open('', '_blank', 'width=720,height=900');
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
      } else {
        try {
          window.MajorArcanaPreviewToast?.error(
            'Kunde inte öppna fönster (blockerat?)'
          );
        } catch (_e) {}
      }
    } catch (err) {
      try {
        window.MajorArcanaPreviewToast?.error('Digest-preview misslyckades: ' + err.message);
      } catch (_e) {}
    }
  }

  function diffNewAlerts(prevAlerts, nextAlerts) {
    const prevKeys = new Set((prevAlerts || []).map((a) => a.type + '::' + a.message));
    return (nextAlerts || []).filter((a) => !prevKeys.has(a.type + '::' + a.message));
  }

  async function refresh() {
    try {
      const payload = await fetchKpis();
      const prevAlerts = lastData?.data?.alerts || [];
      const nextAlerts = payload?.data?.alerts || [];
      lastData = payload;
      const body = dialog.querySelector('[data-body]');
      const meta = dialog.querySelector('[data-meta]');
      if (body) body.innerHTML = renderBody(payload);
      if (meta) meta.textContent = 'Uppdaterad ' + fmtTime(payload?.data?.generatedAt);
      // Notifiera nya alerts som dykt upp sedan senaste pollen
      const newOnes = diffNewAlerts(prevAlerts, nextAlerts);
      if (newOnes.length && window.MajorArcanaPreviewToast) {
        for (const a of newOnes) {
          const type =
            a.severity === 'warning' ? 'warning' : a.severity === 'info' ? 'info' : 'error';
          try {
            window.MajorArcanaPreviewToast[type](a.message, { title: 'KPI-larm' });
          } catch (_e) {}
        }
      }
    } catch (err) {
      const body = dialog.querySelector('[data-body]');
      if (body) {
        body.innerHTML =
          '<div class="cco-ops-error">Kunde inte hämta nyckeltal: ' + escapeHtml(err.message) + '</div>';
      }
    }
  }

  function open() {
    injectStyles();
    buildDialog();
    dialog.setAttribute('aria-hidden', 'false');
    refresh();
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(refresh, POLL_INTERVAL_MS);
  }

  function close() {
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'true');
    if (pollHandle) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
    if (location.hash === '#ops') {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (_e) {}
    }
  }

  function watchHash() {
    const checkHash = () => {
      if (location.hash === '#ops') open();
    };
    window.addEventListener('hashchange', checkHash);
    checkHash();
  }

  function registerCommandPaletteEntry() {
    if (!window.MajorArcanaPreviewCommandPalette) return;
    try {
      window.MajorArcanaPreviewCommandPalette.register?.({
        id: 'ops-dashboard',
        label: 'Operations dashboard',
        keywords: ['ops', 'kpi', 'dashboard', 'nyckeltal', 'rapport', 'metrics'],
        run: () => open(),
      });
    } catch (_e) {}
  }

  function mount() {
    injectStyles();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      watchHash();
      registerCommandPaletteEntry();
    } else {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          watchHash();
          registerCommandPaletteEntry();
        },
        { once: true }
      );
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewOpsDashboard = Object.freeze({
      mount,
      open,
      close,
      refresh,
      getLastData: () => lastData,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
