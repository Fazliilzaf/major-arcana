'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-customers-v10-flag.js — feature-flag för facit-trogen v10-kund-mobil.
 * CUTOVER: default ON (opt-out). Kill-switch ?customers=off stänger av (sticky).
 *
 *   ?customers=v10 → sticky ON   ·   ?customers=off → sticky OFF (kill-switch)
 *   inget          → enabled = (localStorage !== '0')   (default ON)
 *
 * Sätter data-customers-v10="on"|"off" på <html> FÖRE render. URL-intenten är
 * auktoritativ för aktuell laddning även om localStorage-skrivningen misslyckas
 * (private mode/kvot/blockerad), så kill-switchen aldrig ignoreras.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var q = String(params.get('customers') || '').toLowerCase();
    var KEY = 'arcana.customers.v10';
    var forced = null; // explicit URL-intent för denna laddning
    if (q === 'v10' || q === 'on') {
      forced = true;
      try {
        localStorage.setItem(KEY, '1');
      } catch (e) {
        /* private mode */
      }
    } else if (q === 'off' || q === 'legacy') {
      forced = false;
      try {
        localStorage.setItem(KEY, '0');
      } catch (e) {
        /* private mode */
      }
    }
    // CUTOVER — default ON (opt-out): bara explicit '0' (kill-switch) stänger av.
    var enabled = true;
    if (forced !== null) {
      enabled = forced;
    } else {
      try {
        enabled = localStorage.getItem(KEY) !== '0';
      } catch (e) {
        enabled = true;
      }
    }
    document.documentElement.setAttribute('data-customers-v10', enabled ? 'on' : 'off');
    window.__ARCANA_CUSTOMERS_V10_ENABLED__ = enabled;
  } catch (e) {
    /* tyst — flaggan är best-effort */
  }
})();
