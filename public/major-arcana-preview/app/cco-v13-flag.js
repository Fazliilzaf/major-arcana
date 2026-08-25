/**
 * V13 Kundvy — Block 0 · feature flag (opt-in, default OFF).
 *
 * Speglar cco-v12-workspace-flag.js med EGEN nyckel och EGET attribut. Isolerad
 * från v11rail/v12workspace-flaggor. Sätter ett data-attribut som
 * mount-switchen i patient-master-ui.js läser; ändrar inget i V11/V12.
 *
 *   ?v13=on  → localStorage arcana.v13.enabled = '1'  (sticky ON)
 *   ?v13=off → localStorage arcana.v13.enabled = '0'  (sticky OFF)
 *   inget    → enabled = (localStorage === '1')   (default OFF, opt-in)
 *
 * Resultat:
 *   document.documentElement[data-v13-view] = 'on' | 'off'
 *   window.__ARCANA_V13_ENABLED__           = boolean
 */
(function (global) {
  'use strict';

  var KEY = 'arcana.v13.enabled';
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

  var query = readQuery('v13');
  if (query === 'on') {
    try {
      localStorage.setItem(KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (query === 'off') {
    try {
      localStorage.setItem(KEY, '0');
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

  document.documentElement.setAttribute('data-v13-view', enabled ? 'on' : 'off');
  global.__ARCANA_V13_ENABLED__ = enabled;

  global.CcoV13Flag = {
    KEY: KEY,
    isEnabled: function isEnabled() {
      return enabled;
    },
  };
})(typeof window !== 'undefined' ? window : global);
