/**
 * V12 Customer Workspace — Light Shell feature flag (default OFF, opt-in).
 *
 * Isolerad nyckel/attribut för det nya ljusa skalet från mockups
 * (V12-WORKSPACE-JOURNEY-SPINE-2026-06-21.html + V12-ABDIRAHMAN-JAMA-PREVIEW-2026-06-21.html).
 * Ändrar inga funktioner, bara vilket CSS-tema som laddas.
 *
 *   ?v12lightshell=on  → localStorage arcana.v12lightshell.enabled = '1'  (sticky ON)
 *   ?v12lightshell=off → localStorage arcana.v12lightshell.enabled = '0'  (sticky OFF)
 *   inget              → enabled = (localStorage === '1')   (default OFF, opt-in)
 *
 * Resultat:
 *   document.documentElement[data-v12-workspace-light-shell] = 'on' | 'off'
 *   window.__ARCANA_V12_WORKSPACE_LIGHT_SHELL_ENABLED__      = boolean
 */
(function (global) {
  'use strict';

  var KEY = 'arcana.v12lightshell.enabled';
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

  var query = readQuery('v12lightshell');
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

  document.documentElement.setAttribute('data-v12-workspace-light-shell', enabled ? 'on' : 'off');
  global.__ARCANA_V12_WORKSPACE_LIGHT_SHELL_ENABLED__ = enabled;

  global.CcoV12WorkspaceLightShellFlag = {
    KEY: KEY,
    isEnabled: function isEnabled() {
      return enabled;
    },
  };
})(typeof window !== 'undefined' ? window : global);
