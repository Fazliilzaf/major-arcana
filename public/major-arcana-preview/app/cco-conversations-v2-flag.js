/**
 * CCO Konversationer v2 — feature flag (default OFF, opt-in).
 *
 * Speglar cco-v12-workspace-flag.js men med EGEN nyckel/attribut OCH
 * omvänd default: konversationsvyn är en live patient-kommunikations-yta,
 * så v2-skalet är OPT-IN tills det är verifierat och owner-godkänt.
 *
 *   ?conversations=v2  → localStorage arcana.conversationsV2.enabled = '1'  (sticky ON)
 *   ?conversations=off → localStorage arcana.conversationsV2.enabled = '0'  (sticky OFF)
 *   inget              → enabled = (localStorage === '1')   (default OFF, opt-in)
 *
 * Resultat:
 *   document.documentElement[data-conversations-v2] = 'on' | 'off'
 *   window.__ARCANA_CONVERSATIONS_V2_ENABLED__      = boolean
 *
 * Mount-switchen (runtime-dom-live-composition.js · renderRuntimeConversationShell)
 * läser attributet/flaggan; default OFF ⇒ befintlig konversationsvy är orörd.
 */
(function (global) {
  'use strict';

  var KEY = 'arcana.conversationsV2.enabled';
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

  var query = readQuery('conversations');
  if (query === 'v2') {
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

  // Default OFF (opt-in): bara explicit '1' aktiverar v2-skalet.
  var enabled = false;
  try {
    enabled = localStorage.getItem(KEY) === '1';
  } catch (_error) {
    enabled = false;
  }

  document.documentElement.setAttribute('data-conversations-v2', enabled ? 'on' : 'off');
  global.__ARCANA_CONVERSATIONS_V2_ENABLED__ = enabled;

  global.CcoConversationsV2Flag = {
    KEY: KEY,
    isEnabled: function isEnabled() {
      return enabled;
    },
  };
})(typeof window !== 'undefined' ? window : global);
