/**
 * V11-RAIL Fas 3 · Block 0 — feature flag (opt-in).
 *
 * Isolerad från cco-v9-flag.js per canon §5 ("clean namespace", enda
 * legacy-kontaktpunkt är mount/switch). Sätter ett data-attribut som
 * mount-switchen i patient-master-ui.js läser; ändrar inte v9/v10-flaggor.
 *
 *   ?v11rail=on  → localStorage arcana.v11rail.enabled = '1'  (sticky ON)
 *   ?v11rail=off → localStorage arcana.v11rail.enabled = '0'  (sticky OFF)
 *   inget        → enabled = (localStorage === '1')           (default OFF, opt-in)
 *
 * Resultat:
 *   document.documentElement[data-v11-rail] = 'on' | 'off'
 *   window.__ARCANA_V11_RAIL_ENABLED__      = boolean
 */
(function (global) {
  'use strict';

  var KEY = 'arcana.v11rail.enabled';
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

  var query = readQuery('v11rail');
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

  document.documentElement.setAttribute('data-v11-rail', enabled ? 'on' : 'off');
  global.__ARCANA_V11_RAIL_ENABLED__ = enabled;

  global.CcoV11RailFlag = {
    KEY: KEY,
    isEnabled: function isEnabled() {
      return enabled;
    },
  };
})(typeof window !== 'undefined' ? window : global);
