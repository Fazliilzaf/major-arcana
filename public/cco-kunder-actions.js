/**
 * P1.1 — Kunder action matrix (desktop + mobil). Real routes only; no fake toasts.
 */
(function (global) {
  'use strict';

  const DEFAULT_TENANT = 'hairtpclinic';

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {object} card — enriched patient readout
   * @param {{ tenantId?: string, role?: string, surface?: 'desktop'|'mobile' }} ctx
   */
  function buildMatrix(card, ctx = {}) {
    const patientId = card?.patientId;
    const tenantId = ctx.tenantId || DEFAULT_TENANT;
    const role = ctx.role || 'staff';
    const journalHref = patientId
      ? `/journal-feed-demo.html?customerId=${encodeURIComponent(patientId)}&tenant=${encodeURIComponent(tenantId)}&role=${encodeURIComponent(role)}`
      : null;
    const timelineHref = patientId
      ? `/journal-feed-demo.html?customerId=${encodeURIComponent(patientId)}&tenant=${encodeURIComponent(tenantId)}&view=timeline`
      : null;
    const calendarHref = patientId
      ? `/kalender.html?patientId=${encodeURIComponent(patientId)}`
      : '/kalender.html';

    return [
      {
        id: 'dossier',
        label: 'Öppna kundkort',
        status: 'real',
        kind: 'handler',
        handler: 'dossier',
      },
      {
        id: 'journal',
        label: 'Journal',
        status: journalHref ? 'real' : 'disabled',
        kind: 'link',
        href: journalHref,
        disabledReason: 'Saknar patientId',
      },
      {
        id: 'timeline',
        label: 'Timeline',
        status: timelineHref ? 'real' : 'disabled',
        kind: 'link',
        href: timelineHref,
        disabledReason: 'Saknar patientId',
      },
      {
        id: 'assets',
        label: 'Assets',
        status: patientId ? 'real' : 'disabled',
        kind: 'handler',
        handler: 'assets',
        disabledReason: 'Saknar patientId',
      },
      {
        id: 'calendar',
        label: 'Kalender',
        status: 'real',
        kind: 'link',
        href: calendarHref,
      },
      {
        id: 'book',
        label: 'Boka',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kopplas i Kalender P1',
      },
      {
        id: 'rebook',
        label: 'Omboka',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kopplas i Kalender P1',
      },
      {
        id: 'send_form',
        label: 'Skicka formulär',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kommer i P1',
      },
      {
        id: 'offer',
        label: 'Skapa offert',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kommer i P1',
      },
      {
        id: 'photo',
        label: 'Ta bild',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Ej kopplat · kommer i P1',
      },
      {
        id: 'export',
        label: 'Exportera urval',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Ej kopplat ännu',
      },
      {
        id: 'bulk',
        label: 'Massåtgärd',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Ej kopplat ännu',
      },
      {
        id: 'merge',
        label: 'Merge/dedupe',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kommer i P1',
      },
      {
        id: 'gdpr',
        label: 'GDPR-export',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Kommer i P1',
      },
      {
        id: 'payment',
        label: 'Betalning',
        status: 'disabled',
        kind: 'button',
        disabledReason: 'Fortnox-write ej i scope',
      },
    ];
  }

  function renderActionsHtml(
    actions,
    { linkClass = 'quick-pill', buttonClass = 'quick-pill' } = {}
  ) {
    return actions
      .map((action) => {
        const title = escapeHtml(action.disabledReason || '');
        if (action.status === 'real' && action.kind === 'link' && action.href) {
          return `<a class="${linkClass}" href="${escapeHtml(action.href)}" data-kunder-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</a>`;
        }
        if (action.status === 'real' && action.kind === 'handler') {
          return `<button type="button" class="${buttonClass}" data-kunder-action="${escapeHtml(action.id)}" data-kunder-handler="${escapeHtml(action.handler)}">${escapeHtml(action.label)}</button>`;
        }
        return `<button type="button" class="${buttonClass}" disabled title="${title}" data-kunder-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`;
      })
      .join('');
  }

  function bindDossierHandlers(root, handlers = {}) {
    if (!root) return;
    root.querySelectorAll('[data-kunder-handler]').forEach((btn) => {
      const handler = btn.dataset.kunderHandler;
      btn.addEventListener('click', () => {
        if (handler === 'dossier' && handlers.openDossier) handlers.openDossier();
        if (handler === 'assets' && handlers.scrollAssets) handlers.scrollAssets();
      });
    });
  }

  global.CcoKunderActions = {
    buildMatrix,
    renderActionsHtml,
    bindDossierHandlers,
    handlesKunderActions: true,
  };
})(typeof window !== 'undefined' ? window : global);
