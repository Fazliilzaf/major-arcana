/**
 * V11-RAIL Fas 3 · Block 0 — data-adapter-lager (tomt scaffold).
 *
 * Per canon §5: varje sektion (A–S + V) får en egen data-adapter som
 * exponerar ett rent input/output-kontrakt mellan live-datakällor
 * (bcard, extras, gateSignals, bookings ...) och renderaren i
 * cco-v11-rail.js. Inga adaptrar implementerade i Block 0 — endast
 * namespace + en konsekvent empty-state-helper enligt inventory §2.
 *
 * Block 1+ fyller på: buildProfileFromBcard, buildStatsFromExtras,
 * buildActiveVisitFromBookings, splitGateSignalsCritical, debtSignal, ...
 */
(function (global) {
  'use strict';

  /**
   * Konsekvent empty-state-markup för en sektion (canon §5:
   * "Missing data produces an explicit empty state, not a layout compromise").
   * @param {string} section - kort sektionsnamn för aria/debug
   * @param {string} [hint] - valfri ledtext
   * @returns {string} HTML-sträng i .v11-rail__*-namespace
   */
  function v11RailEmpty(section, hint) {
    var label = section ? String(section) : 'Sektion';
    var sub = hint ? '<div class="v11-rail__empty-hint">' + String(hint) + '</div>' : '';
    return (
      '<div class="v11-rail__empty" role="status" data-v11-rail-section="' +
      label +
      '">' +
      '<div class="v11-rail__empty-title">Ingen data</div>' +
      sub +
      '</div>'
    );
  }

  global.CcoV11RailAdapters = {
    v11RailEmpty: v11RailEmpty,
    // Block 1+ section adapters registreras här.
  };
})(typeof window !== 'undefined' ? window : global);
