/**
 * ORD-26 — Kundkort slide-over Kunddossiér
 * Public API; render/bind lives in cco-v9-customers-parity.js (ORD-24 path).
 */
(function (global) {
  'use strict';

  function isEnabled() {
    return document.documentElement.getAttribute('data-v9-enabled') === 'on';
  }

  function parity() {
    return global.CcoV9CustomersParity || null;
  }

  global.CcoKundkortSlideOver = {
    isEnabled,
    render(card, journalEntries, dossierBundle, occasionTimeline, driveFiles) {
      return parity()?.renderKundkortSlideOverHtml?.(
        card,
        journalEntries,
        dossierBundle,
        occasionTimeline,
        driveFiles
      );
    },
    bind(root, handlers) {
      return parity()?.bindKundkortSlideOver?.(root, handlers);
    },
  };
})(typeof window !== 'undefined' ? window : global);
