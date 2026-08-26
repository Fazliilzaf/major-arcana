/**
 * V13 Kundvy — Block 0 · feature flag (default PÅ sedan 2026-08-26).
 *
 * Speglar cco-v12-workspace-flag.js med EGEN nyckel och EGET attribut. Isolerad
 * från v11rail/v12workspace-flaggor. Sätter ett data-attribut som
 * mount-switchen i patient-master-ui.js läser; ändrar inget i V11/V12.
 *
 *   ?v13=on  → localStorage arcana.v13.enabled = '1'  (sticky ON)
 *   ?v13=off → localStorage arcana.v13.enabled = '0'  (sticky OFF)
 *   inget    → enabled = (localStorage !== '0')   (default PÅ)
 *
 * Fazlis beslut 2026-08-26: V13 är kundvyn, både den lilla spalten och den
 * stora arbetsytan. Tidigare var den opt-in med standard AV, vilket gjorde
 * att bara den som själv skrivit ?v13=on såg den — resten av personalen
 * satt kvar i den gamla dossiervyn. `?v13=off` är kvar som nödutgång och
 * är fortfarande sticky: den som stänger av behåller det tills hen slår på.
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

  // Default PÅ: bara ett uttryckligt '0' (alltså någon som skrivit ?v13=off)
  // stänger av. Saknad nyckel = ny webbläsare = V13.
  var enabled = true;
  try {
    enabled = localStorage.getItem(KEY) !== '0';
  } catch (_error) {
    // Privat läge utan localStorage: ge V13 ändå — annars faller hela
    // personalen tillbaka till den gamla vyn i inkognito.
    enabled = true;
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
