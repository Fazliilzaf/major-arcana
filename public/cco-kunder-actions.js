/**
 * P1.1 — Kunder action matrix (desktop + mobil).
 * Each action: status real|partial|disabled|blocked, route/reason/RBAC — no fake toasts.
 */
(function (global) {
  'use strict';

  const DEFAULT_TENANT = 'hairtpclinic';

  const RBAC = {
    merge: 'customers.merge',
    gdpr: 'customers.gdpr_export',
    photo: 'customers.photo_upload',
    payment: 'billing.read',
  };

  const DOSSIER_ACTION_IDS = [
    'journal',
    'timeline',
    'assets',
    'calendar',
    'form',
    'agreement',
    'photo',
    'book',
    'rebook',
  ];

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function titleFor(action) {
    const parts = [];
    if (action.disabledReason) parts.push(action.disabledReason);
    if (action.requiredData) parts.push(`Kräver: ${action.requiredData}`);
    if (action.rbac) parts.push(`RBAC: ${action.rbac}`);
    return escapeHtml(parts.join(' · ') || action.label);
  }

  function def(partial) {
    return { status: 'disabled', kind: 'button', ...partial };
  }

  /**
   * @param {object} card
   * @param {{ tenantId?: string, role?: string, surface?: 'desktop'|'mobile' }} ctx
   */
  function buildMatrix(card, ctx = {}) {
    const patientId = card?.patientId;
    const tenantId = ctx.tenantId || DEFAULT_TENANT;
    const role = ctx.role || 'staff';
    const journalBlocked = Boolean(card?.journalBlocked);
    const hasKomm = Boolean(global.CcoKommPanel);

    const journalHref = patientId
      ? `/journal-feed-demo.html?customerId=${encodeURIComponent(patientId)}&tenant=${encodeURIComponent(tenantId)}&role=${encodeURIComponent(role)}`
      : null;
    const timelineHref = patientId
      ? `/journal-feed-demo.html?customerId=${encodeURIComponent(patientId)}&tenant=${encodeURIComponent(tenantId)}&view=timeline`
      : null;
    const calendarHref = patientId
      ? `/kalender.html?patientId=${encodeURIComponent(patientId)}`
      : '/kalender.html';

    const journalStatus = !patientId ? 'disabled' : journalBlocked ? 'blocked' : 'real';
    const journalReason = journalBlocked
      ? card.journalBlockReason || 'Journal spärrad'
      : !patientId
        ? 'Saknar patientId'
        : null;

    return [
      def({
        id: 'dossier',
        label: 'Öppna kundkort',
        status: patientId ? 'real' : 'disabled',
        kind: 'handler',
        handler: 'dossier',
        disabledReason: 'Saknar patientId',
      }),
      def({
        id: 'journal',
        label: 'Journal',
        status: journalStatus,
        kind: 'link',
        href: journalHref,
        route: journalHref,
        disabledReason: journalReason,
        requiredData: 'patientId',
      }),
      def({
        id: 'timeline',
        label: 'Timeline',
        status: journalStatus,
        kind: 'link',
        href: timelineHref,
        route: timelineHref,
        disabledReason: journalReason,
        requiredData: 'patientId',
      }),
      def({
        id: 'assets',
        label: 'Filer/assets',
        status: patientId ? 'real' : 'disabled',
        kind: 'handler',
        handler: 'assets',
        route: patientId ? `/api/v1/cco/patients/${patientId}/assets` : null,
        disabledReason: 'Saknar patientId',
        requiredData: 'patientId',
      }),
      def({
        id: 'communication',
        label: 'Kommunikation',
        status: patientId && hasKomm ? 'partial' : 'disabled',
        kind: 'handler',
        handler: 'communication',
        disabledReason: patientId ? 'Öppnas i dossier (kommunikationspanel)' : 'Saknar patientId',
        requiredData: 'patientId, CcoKommPanel',
      }),
      def({
        id: 'calendar',
        label: 'Kalender',
        status: 'real',
        kind: 'link',
        href: calendarHref,
        route: calendarHref,
      }),
      def({
        id: 'book',
        label: 'Boka',
        status: 'disabled',
        disabledReason: 'Kopplas i Kalender P1',
        requiredData: 'booking write GO',
      }),
      def({
        id: 'rebook',
        label: 'Omboka',
        status: 'disabled',
        disabledReason: 'Kopplas i Kalender P1',
        requiredData: 'booking write GO',
      }),
      def({
        id: 'form',
        label: 'Skicka formulär',
        status: 'disabled',
        disabledReason: 'Kräver formulärmotor',
        requiredData: 'cco-forms send route',
      }),
      def({
        id: 'agreement',
        label: 'Avtal',
        status: card?.hasAgreement ? 'real' : 'disabled',
        kind: card?.hasAgreement ? 'handler' : 'button',
        handler: card?.hasAgreement ? 'assets' : undefined,
        disabledReason: 'Kräver avtalsflöde P1',
        requiredData: card?.hasAgreement ? null : 'agreement document',
      }),
      def({
        id: 'offer',
        label: 'Skapa offert',
        status: 'disabled',
        disabledReason: 'Kommer i P1',
        requiredData: 'cco-commercial offer route',
      }),
      def({
        id: 'photo',
        label: 'Ta bild',
        status: 'disabled',
        disabledReason: 'Kräver Photo Review',
        requiredData: 'photo capture + patient link',
        rbac: RBAC.photo,
      }),
      def({
        id: 'export',
        label: 'Exportera urval',
        status: 'disabled',
        disabledReason: 'Ej kopplat ännu',
      }),
      def({
        id: 'bulk',
        label: 'Massåtgärd',
        status: 'disabled',
        disabledReason: 'Ej kopplat ännu',
      }),
      def({
        id: 'merge',
        label: 'Merge/dedupe',
        status: 'disabled',
        disabledReason: 'Kommer i P1',
        rbac: RBAC.merge,
      }),
      def({
        id: 'gdpr',
        label: 'GDPR-export',
        status: 'disabled',
        disabledReason: 'Kommer i P1',
        rbac: RBAC.gdpr,
      }),
      def({
        id: 'access',
        label: 'Spärra åtkomst',
        status: journalBlocked ? 'blocked' : 'disabled',
        disabledReason: journalBlocked ? journalReason : 'Kräver journal-admin P1',
        requiredData: 'journal.lock RBAC',
      }),
      def({
        id: 'payment',
        label: 'Betalning',
        status: 'disabled',
        disabledReason: 'Kräver Fortnox',
        requiredData: 'fortnox read (write ej i scope)',
        rbac: RBAC.payment,
      }),
    ];
  }

  /** Dossier action bar subset (desktop + mobil). */
  function buildDossierBar(card, ctx = {}) {
    const byId = Object.fromEntries(buildMatrix(card, ctx).map((a) => [a.id, a]));
    return DOSSIER_ACTION_IDS.map((id) => byId[id]).filter(Boolean);
  }

  function listCatalog() {
    return buildMatrix({ patientId: 'catalog' }, {}).map((a) => ({
      id: a.id,
      label: a.label,
      defaultStatus: a.status,
      rbac: a.rbac || null,
    }));
  }

  function renderActionsHtml(
    actions,
    { linkClass = 'quick-pill', buttonClass = 'quick-pill' } = {}
  ) {
    return actions
      .map((action) => {
        const title = titleFor(action);
        const statusAttr = ` data-kunder-status="${escapeHtml(action.status)}" data-kunder-action="${escapeHtml(action.id)}"`;

        if (action.status === 'real' && action.kind === 'link' && action.href) {
          return `<a class="${linkClass}" href="${escapeHtml(action.href)}" title="${title}"${statusAttr}>${escapeHtml(action.label)}</a>`;
        }
        if (
          (action.status === 'real' || action.status === 'partial') &&
          action.kind === 'handler' &&
          action.handler
        ) {
          const partialClass = action.status === 'partial' ? ' kunder-action--partial' : '';
          return `<button type="button" class="${buttonClass}${partialClass}" title="${title}"${statusAttr} data-kunder-handler="${escapeHtml(action.handler)}">${escapeHtml(action.label)}</button>`;
        }
        const partialClass = action.status === 'partial' ? ' kunder-action--partial' : '';
        const blockedClass = action.status === 'blocked' ? ' kunder-action--blocked' : '';
        return `<button type="button" class="${buttonClass}${partialClass}${blockedClass}" disabled title="${title}"${statusAttr}>${escapeHtml(action.label)}</button>`;
      })
      .join('');
  }

  function renderMatrixLegend(actions) {
    const counts = { real: 0, partial: 0, disabled: 0, blocked: 0 };
    actions.forEach((a) => {
      if (counts[a.status] != null) counts[a.status] += 1;
    });
    return `<p class="kunder-action-legend" data-kunder-action-legend>${counts.real} aktiva · ${counts.partial} partial · ${counts.disabled} disabled · ${counts.blocked} spärrade</p>`;
  }

  function bindDossierHandlers(root, handlers = {}) {
    if (!root) return;
    root.querySelectorAll('[data-kunder-handler]').forEach((btn) => {
      const handler = btn.dataset.kunderHandler;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (handler === 'assets' && handlers.scrollAssets) handlers.scrollAssets();
        if (handler === 'communication' && handlers.scrollCommunication)
          handlers.scrollCommunication();
      });
    });
  }

  global.CcoKunderActions = {
    buildMatrix,
    buildDossierBar,
    listCatalog,
    renderActionsHtml,
    renderMatrixLegend,
    bindDossierHandlers,
    handlesKunderActions: true,
    DOSSIER_ACTION_IDS,
  };
})(typeof window !== 'undefined' ? window : global);
