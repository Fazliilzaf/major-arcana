/**
 * ORD-16 steg 1 — v9 feature flag.
 * ORD-20 (2026-06-04): default ON (owner-override av 2v-stabilitetsfönster).
 *   ?v9=on  → localStorage arcana.v9.enabled = '1'   (sticky ON)
 *   ?v9=off → localStorage arcana.v9.enabled = '0'   (sticky OFF, kill-switch)
 *   inget   → enabled = (localStorage !== '0')       (default ON, men respect sticky off)
 *
 * Rek. 9 — mockup/demo-only UI (watch, overlays, mockup-label, caption):
 *   ?demo=on  → localStorage arcana.v9.demo = '1'  (sticky ON)
 *   ?demo=off → localStorage arcana.v9.demo = '0'  (sticky OFF)
 *   inget     → demo OFF (prod-port: renderas inte)
 */
(function () {
  'use strict';

  var V9_KEY = 'arcana.v9.enabled';
  var DEMO_KEY = 'arcana.v9.demo';
  var params;

  try {
    params = new URLSearchParams(window.location.search || '');
  } catch (_error) {
    params = null;
  }

  function readQuery(name) {
    return params
      ? String(params.get(name) || '')
          .trim()
          .toLowerCase()
      : '';
  }

  var v9Query = readQuery('v9');
  if (v9Query === 'on') {
    try {
      localStorage.setItem(V9_KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (v9Query === 'off') {
    try {
      localStorage.setItem(V9_KEY, '0');
    } catch (_error) {
      /* private mode */
    }
  }

  var demoQuery = readQuery('demo');
  if (demoQuery === 'on') {
    try {
      localStorage.setItem(DEMO_KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (demoQuery === 'off') {
    try {
      localStorage.setItem(DEMO_KEY, '0');
    } catch (_error) {
      /* private mode */
    }
  }

  var v9Enabled = true;
  try {
    v9Enabled = localStorage.getItem(V9_KEY) !== '0';
  } catch (_error) {
    v9Enabled = true;
  }

  var demoEnabled = false;
  try {
    demoEnabled = localStorage.getItem(DEMO_KEY) === '1';
  } catch (_error) {
    demoEnabled = false;
  }

  document.documentElement.setAttribute('data-v9-enabled', v9Enabled ? 'on' : 'off');
  document.documentElement.setAttribute('data-v9-demo', demoEnabled ? 'on' : 'off');
  window.__ARCANA_V9_ENABLED__ = v9Enabled;
  window.__ARCANA_V9_DEMO_ENABLED__ = v9Enabled && demoEnabled;
})();
