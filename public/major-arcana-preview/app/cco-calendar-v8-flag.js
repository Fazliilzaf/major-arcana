'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-calendar-v8-flag.js — feature-flag för facit-trogen v8-kalender.
 * Default OFF. Opt-in via ?calendar=v8 (persistas i localStorage), opt-out via
 * ?calendar=off. Sätter data-calendar-v8="on" på <html> FÖRE render så att
 * legacy-kalendern kan gömmas utan flimmer. Speglar konversations-v2-flaggan.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var q = String(params.get('calendar') || '').toLowerCase();
    var KEY = 'arcana.calendar.v8';
    if (q === 'v8' || q === 'on') localStorage.setItem(KEY, '1');
    if (q === 'off' || q === 'legacy') localStorage.setItem(KEY, '0');
    var enabled = localStorage.getItem(KEY) === '1'; // default OFF tills cutover
    if (enabled) {
      document.documentElement.setAttribute('data-calendar-v8', 'on');
      window.__ARCANA_CALENDAR_V8_ENABLED__ = true;
    }
  } catch (e) {
    /* tyst — flaggan är best-effort */
  }
})();
