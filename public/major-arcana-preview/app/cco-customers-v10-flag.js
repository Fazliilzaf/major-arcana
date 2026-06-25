'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-customers-v10-flag.js — feature-flag för facit-trogen v10-kund-mobil.
 * Default OFF. Opt-in via ?customers=v10 (persistas i localStorage), opt-out
 * via ?customers=off. Sätter data-customers-v10="on" på <html> FÖRE render så
 * att legacy-kundvyn kan gömmas utan flimmer. Speglar kalender-v8-flaggan.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var q = String(params.get('customers') || '').toLowerCase();
    var KEY = 'arcana.customers.v10';
    if (q === 'v10' || q === 'on') localStorage.setItem(KEY, '1');
    if (q === 'off' || q === 'legacy') localStorage.setItem(KEY, '0');
    var enabled = localStorage.getItem(KEY) === '1'; // default OFF tills cutover
    if (enabled) {
      document.documentElement.setAttribute('data-customers-v10', 'on');
      window.__ARCANA_CUSTOMERS_V10_ENABLED__ = true;
    }
  } catch (e) {
    /* tyst — flaggan är best-effort */
  }
})();
