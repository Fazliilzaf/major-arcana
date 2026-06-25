/**
 * V12 Customer Workspace — Block 0 · feature flag (default ON, opt-out).
 *
 * Speglar cco-v11-rail-flag.js men med EGEN nyckel och EGET attribut. Isolerad
 * från v11rail/v9-flaggor (canon §5 — clean namespace). Sätter ett data-attribut
 * som mount-switchen i patient-master-ui.js läser; ändrar inget i V11/v9.
 *
 *   ?v12workspace=on  → localStorage arcana.v12workspace.enabled = '1'  (sticky ON)
 *   ?v12workspace=off → localStorage arcana.v12workspace.enabled = '0'  (sticky OFF, kill-switch)
 *   inget             → enabled = (localStorage !== '0')   (default ON, opt-out)
 *
 * Resultat:
 *   document.documentElement[data-v12-workspace] = 'on' | 'off'
 *   window.__ARCANA_V12_WORKSPACE_ENABLED__      = boolean
 */
(function (global) {
  'use strict';

  var KEY = 'arcana.v12workspace.enabled';
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

  var query = readQuery('v12workspace');
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

  var enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== '0';
  } catch (_error) {
    enabled = true;
  }

  document.documentElement.setAttribute('data-v12-workspace', enabled ? 'on' : 'off');
  global.__ARCANA_V12_WORKSPACE_ENABLED__ = enabled;

  global.CcoV12WorkspaceFlag = {
    KEY: KEY,
    isEnabled: function isEnabled() {
      return enabled;
    },
  };
})(typeof window !== 'undefined' ? window : global);
