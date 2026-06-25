'use strict';
/* ════════════════════════════════════════════════════════════════════════
 * cco-booking-v1-flag.js — feature-flag för facit-trogen v1-boknings-mobil.
 * CUTOVER: default ON (opt-out). Kill-switch ?booking=off stänger av (sticky).
 *
 *   ?booking=v1 → sticky ON   ·   ?booking=off → sticky OFF (kill-switch)
 *   inget       → enabled = (localStorage !== '0')   (default ON)
 *
 * Sätter data-booking-v1="on"|"off" på <html> FÖRE render. Bokningsvyn delar
 * datakälla med kalendern (ArcanaBookingCalendarShared) men presenteras som en
 * list-/dagvy på mobil (≤834px). URL-intenten är auktoritativ för aktuell
 * laddning även om localStorage-skrivningen misslyckas, så kill-switchen
 * aldrig ignoreras.
 * ════════════════════════════════════════════════════════════════════════ */
(function () {
  try {
    var params = new URLSearchParams(window.location.search || '');
    var q = String(params.get('booking') || '').toLowerCase();
    var KEY = 'arcana.booking.v1';
    var forced = null; // explicit URL-intent för denna laddning
    if (q === 'v1' || q === 'on') {
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
    document.documentElement.setAttribute('data-booking-v1', enabled ? 'on' : 'off');
    window.__ARCANA_BOOKING_V1_ENABLED__ = enabled;
  } catch (e) {
    /* tyst — flaggan är best-effort */
  }
})();
