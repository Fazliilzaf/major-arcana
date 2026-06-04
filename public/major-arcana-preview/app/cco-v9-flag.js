/**
 * ORD-16 steg 1 — v9 feature flag (default off).
 * ?v9=on  → localStorage arcana.v9.enabled = '1'
 * ?v9=off → removes key
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
      localStorage.removeItem(KEY);
    } catch (_error) {
      /* private mode */
    }
  }

  var enabled = false;
  try {
    enabled = localStorage.getItem(KEY) === '1';
  } catch (_error) {
    enabled = false;
  }

  document.documentElement.setAttribute('data-v9-enabled', enabled ? 'on' : 'off');
  window.__ARCANA_V9_ENABLED__ = enabled;
})();
