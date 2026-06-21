/**
 * V11-RAIL Fas 3 · Block 0 — renderer (tomt scaffold).
 *
 * Per canon §5: ren `.v11-rail__*`-renderare utan beroende på legacy
 * .kkref / .cr-v10 / v9/v10-override-klasser. Enda legacy-kontaktpunkten
 * är mount-switchen i patient-master-ui.js som väljer denna renderare
 * när ?v11rail=on.
 *
 * Block 0 implementerar INGEN A–S/V-sektion. `render()` returnerar tom
 * sträng så att mount-switchen visar en explicit scaffold-empty-state.
 * Block 1+ bygger renderProfile, renderStats, renderActiveVisit, ...
 */
(function (global) {
  'use strict';

  /**
   * Renderar V11-rail-innehåll för en kund.
   * @param {object} [ctx] - { card, journalEntries, occasionTimeline, driveFiles, patient, tab, lite }
   * @returns {string} inner-HTML i .v11-rail__*-namespace (tom i Block 0)
   */
  function render(ctx) {
    void ctx;
    // Block 0: inget UI implementerat. Mount-switchen visar scaffold-empty-state.
    return '';
  }

  global.CcoV11Rail = {
    BLOCK: 0,
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
