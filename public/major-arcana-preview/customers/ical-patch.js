// CCO Kunder-modul — iCal-patch (STUB)
//
// ÄRLIG STUB. Modulen skrevs aldrig (se docs/handover/SAKNADE-MODULER-2026-06-24.md).
// Monterar den förväntade iCal-endpointen så require() resolvar, men returnerar
// 501 i stället för en fejkad kalender. Ersätt med riktig iCal-generering när
// kontraktet är känt.
//
// Signatur som server.js förväntar: module.exports = function(app, opts)

'use strict';

const STUB_NOTE =
  'cco-customers iCal-patch är inte implementerad (stub). Se docs/handover/SAKNADE-MODULER-2026-06-24.md.';

module.exports = function mountCustomersIcalPatch(app, _options = {}) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('mountCustomersIcalPatch: en Express-app krävs.');
  }

  app.get('/api/v1/cco-customers/:id/calendar.ics', (req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      stub: true,
      route: 'customer-ical',
      note: STUB_NOTE,
    });
  });

  app.locals = app.locals || {};
  app.locals.ccoCustomersIcalPatch = { stub: true, note: STUB_NOTE };

  console.warn(
    '[cco-customers] ical-patch monterad som STUB (501 ej implementerad) — se SAKNADE-MODULER-2026-06-24.md'
  );
};
