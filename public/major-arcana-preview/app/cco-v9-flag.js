/**
 * ORD-16 steg 1 — v9 feature flag.
 * ORD-20 (2026-06-04): default ON (owner-override av 2v-stabilitetsfönster).
 *   ?v9=on  → localStorage arcana.v9.enabled = '1'   (sticky ON)
 *   ?v9=off → localStorage arcana.v9.enabled = '0'   (sticky OFF, kill-switch)
 *   inget   → enabled = (localStorage !== '0')       (default ON, men respect sticky off)
 */
(function () {
  'use strict';

  var KEY = 'arcana.v9.enabled';
  var params;

  try {
    params = new URLSearchParams(window.location.search || '');
  } catch (_error) {
    params = null;
  }

  var query = params
    ? String(params.get('v9') || '')
        .trim()
        .toLowerCase()
    : '';

  if (query === 'on') {
    try {
      localStorage.setItem(KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (query === 'off') {
    try {
      // ORD-20: sätt '0' (sticky off) istället för removeItem så default-ON inte slår på efter reload
      localStorage.setItem(KEY, '0');
    } catch (_error) {
      /* private mode */
    }
  }

  // ORD-20: default ON. Avstängd endast om explicit ?v9=off körts (localStorage = '0').
  var enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== '0';
  } catch (_error) {
    enabled = true;
  }

  document.documentElement.setAttribute('data-v9-enabled', enabled ? 'on' : 'off');
  window.__ARCANA_V9_ENABLED__ = enabled;
})();
