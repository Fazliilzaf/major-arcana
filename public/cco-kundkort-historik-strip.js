/* global window, document, fetch */
/**
 * Read-only import/historik status on kundkort (kunder.html).
 * No Drive links · no new imports · counts from presentation ops snapshot.
 */
(function () {
  if (!/\/kunder\.html$/i.test(window.location.pathname)) return;

  const STRIP_ID = 'cco-kundkort-historik-strip';

  function render(ops) {
    if (document.getElementById(STRIP_ID)) return;
    const h = ops?.historik || {};
    const reviewTotal = ops?.historikReviewQueueTotal ?? '1497';
    const el = document.createElement('div');
    el.id = STRIP_ID;
    el.setAttribute('role', 'status');
    el.style.cssText =
      'margin:8px 12px 0;padding:10px 12px;font-size:12px;line-height:1.45;' +
      'border:1px solid rgba(120,100,80,0.25);border-radius:8px;' +
      'background:rgba(255,252,248,0.92);color:rgba(40,35,30,0.88);';
    el.innerHTML =
      '<strong>Importerad historik (read-only)</strong> · ' +
      'halso@ <code>' +
      (h.halso || 'IMPORTED_SAFE_MATCH') +
      '</code> · GetAccept <code>' +
      (h.getAccept || 'IMPORTED') +
      '</code> · Drive journaler <code>' +
      (h.driveJournals || 'IMPORTED_SAFE_MATCH') +
      '</code> · Drive dokument <code>' +
      (h.driveDocuments || 'IMPORTED_PARTIAL') +
      '</code> · Drive bilder <code>' +
      (h.drivePhotos || 'NEEDS_REVIEW') +
      '</code> · review queue ~' +
      reviewTotal +
      ' osäkra kundmatchningar. Per-post: imp./review på assets. Ingen ny riskimport utan GO.';
    const host =
      document.querySelector('.app-shell') ||
      document.querySelector('main') ||
      document.body.firstElementChild;
    if (host) host.insertAdjacentElement('afterbegin', el);
  }

  fetch('/cco-presentation-ops-status.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((ops) => render(ops || {}))
    .catch(() =>
      render({
        historik: {
          halso: 'IMPORTED_SAFE_MATCH',
          getAccept: 'IMPORTED',
          driveJournals: 'IMPORTED_SAFE_MATCH',
          drivePhotos: 'NEEDS_REVIEW',
        },
        historikReviewQueueTotal: 1497,
      })
    );
})();
