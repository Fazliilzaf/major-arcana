'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-booking-v1-flag.js — feature-flag för facit-trogen v1-boknings-mobil.
 * Default OFF. Opt-in via ?booking=v1 (persistas i localStorage), opt-out via
 * ?booking=off. Sätter data-booking-v1="on" på <html> FÖRE render. Speglar
 * kalender-v8-flaggan. Bokningsvyn delar datakälla med kalendern
 * (ArcanaBookingCalendarShared) men presenteras som en list-/dagvy på mobil.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var q = String(params.get('booking') || '').toLowerCase();
    var KEY = 'arcana.booking.v1';
    if (q === 'v1' || q === 'on') localStorage.setItem(KEY, '1');
    if (q === 'off' || q === 'legacy') localStorage.setItem(KEY, '0');
    var enabled = localStorage.getItem(KEY) === '1'; // default OFF tills cutover
    if (enabled) {
      document.documentElement.setAttribute('data-booking-v1', 'on');
      window.__ARCANA_BOOKING_V1_ENABLED__ = true;
    }
  } catch (e) {
    /* tyst — flaggan är best-effort */
  }
})();
