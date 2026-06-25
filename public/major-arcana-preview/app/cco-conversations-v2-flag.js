/**
 * CCO Konversationer v2 — feature flag (CUTOVER: default ON, opt-out).
 *
 * Speglar cco-v12-workspace-flag.js cutover-mönstret. Efter P0b–P4 är v2
 * verifierat och owner-godkänt ⇒ default PÅ för alla, med kill-switch kvar.
 *
 *   ?conversations=v2  → localStorage arcana.conversationsV2.enabled = '1'  (sticky ON)
 *   ?conversations=off → localStorage arcana.conversationsV2.enabled = '0'  (sticky OFF, kill-switch)
 *   inget              → enabled = (localStorage !== '0')   (default ON, opt-out)
 *
 * Resultat:
 *   document.documentElement[data-conversations-v2] = 'on' | 'off'
 *   window.__ARCANA_CONVERSATIONS_V2_ENABLED__      = boolean
 *
 * Mount-switchen (runtime-dom-live-composition.js · renderRuntimeConversationShell)
 * läser attributet/flaggan. Kill-switch: ?conversations=off återställer legacy.
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
  // Explicit URL-intent för DENNA laddning. Görs auktoritativ nedan så att
  // kill-switchen (?conversations=off) gäller även om localStorage-skrivningen
  // misslyckas (private mode/kvot/blockerad) — annars skulle en saknad nyckel
  // räknas som default ON och tysta ned opt-out:en (Bugbot #232).
  var forced = null;
  if (query === 'v2') {
    forced = true;
    try {
      localStorage.setItem(KEY, '1');
    } catch (_error) {
      /* private mode */
    }
  } else if (query === 'off') {
    forced = false;
    try {
      localStorage.setItem(KEY, '0');
    } catch (_error) {
      /* private mode */
    }
  }

  // CUTOVER — default ON (opt-out): bara explicit '0' (kill-switch) stänger av.
  // URL-intenten vinner över storage för aktuell laddning (överlever storage-fel).
  var enabled = true;
  if (forced !== null) {
    enabled = forced;
  } else {
    try {
      enabled = localStorage.getItem(KEY) !== '0';
    } catch (_error) {
      enabled = true;
    }
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
