/**
 * ORD-16 steg 1 — v9 feature flag.
 * ORD-20 (2026-06-04): default ON (owner-override av 2v-stabilitetsfönster).
 * ORD-23 (2026-06-04): 7-dagars TTL på sticky off + preference helpers.
 *   ?v9=on  → localStorage arcana.v9.enabled = '1'   (sticky ON)
 *   ?v9=off → localStorage arcana.v9.enabled = '0'   (sticky OFF, kill-switch)
 *   inget   → enabled = (localStorage !== '0')       (default ON, men respect sticky off)
 *
 * Rek. 9 — mockup/demo-only UI (watch, overlays, mockup-label, caption):
 *   ?demo=on  → localStorage arcana.v9.demo = '1'  (sticky ON)
 *   ?demo=off → localStorage arcana.v9.demo = '0'  (sticky OFF)
 *   ?demo=off → localStorage arcana.v9.demo = '0'  (sticky OFF)
 *   inget     → demo OFF (prod-port: renderas inte)
 *
 * ORD-27 — v9 polish (gloss-lift, mikro-effekter, 3D-avatar):
 *   ?v9polish=on  → localStorage arcana.v9.polish = '1'
 *   ?v9polish=off → localStorage arcana.v9.polish = '0'
 *   inget         → polish OFF (opt-in via URL)
 */
(function (global) {
  'use strict';

  var V9_KEY = 'arcana.v9.enabled';
  var V9_DISABLED_AT_KEY = 'arcana.v9.disabledAt';
  var DEMO_KEY = 'arcana.v9.demo';
  var POLISH_KEY = 'arcana.v9.polish';
  var V9_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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

  function markV9Disabled() {
    try {
      localStorage.setItem(V9_DISABLED_AT_KEY, String(Date.now()));
    } catch (_error) {
      /* private mode */
    }
  }

  function clearV9DisabledAt() {
    try {
      localStorage.removeItem(V9_DISABLED_AT_KEY);
    } catch (_error) {
      /* private mode */
    }
  }

  function maybeExpireStickyOff() {
    try {
      if (localStorage.getItem(V9_KEY) !== '0') return;
      var raw = localStorage.getItem(V9_DISABLED_AT_KEY);
      if (!raw) return;
      var ts = Number(raw);
      if (!Number.isFinite(ts)) return;
      if (Date.now() - ts >= V9_TTL_MS) {
        localStorage.removeItem(V9_KEY);
        localStorage.removeItem(V9_DISABLED_AT_KEY);
      }
    } catch (_error) {
      /* private mode */
    }
  }

  var v9Query = readQuery('v9');
  if (v9Query === 'on') {
    try {
      localStorage.setItem(V9_KEY, '1');
      clearV9DisabledAt();
    } catch (_error) {
      /* private mode */
    }
  } else if (v9Query === 'off') {
    try {
      localStorage.setItem(V9_KEY, '0');
      markV9Disabled();
    } catch (_error) {
      /* private mode */
    }
  } else {
    maybeExpireStickyOff();
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

  var polishQuery = readQuery('v9polish');
  if (polishQuery === 'on') {
    try {
      localStorage.setItem(POLISH_KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (polishQuery === 'off') {
    try {
      localStorage.setItem(POLISH_KEY, '0');
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

  var polishEnabled = false;
  try {
    polishEnabled = localStorage.getItem(POLISH_KEY) === '1';
  } catch (_error) {
    polishEnabled = false;
  }

  document.documentElement.setAttribute('data-v9-enabled', v9Enabled ? 'on' : 'off');
  document.documentElement.setAttribute('data-v9-demo', demoEnabled ? 'on' : 'off');
  document.documentElement.setAttribute('data-v9-polish', polishEnabled ? 'on' : 'off');
  global.__ARCANA_V9_ENABLED__ = v9Enabled;
  global.__ARCANA_V9_DEMO_ENABLED__ = v9Enabled && demoEnabled;
  global.__ARCANA_V9_POLISH_ENABLED__ = v9Enabled && polishEnabled;

  global.CcoV9Flag = {
    markV9Disabled: markV9Disabled,
    clearV9DisabledAt: clearV9DisabledAt,
    maybeExpireStickyOff: maybeExpireStickyOff,
    TTL_MS: V9_TTL_MS,
  };
})(typeof window !== 'undefined' ? window : global);
