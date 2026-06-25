// CCO Kunder-modul — server-patch (STUB)
//
// OBS: Detta är en ÄRLIG STUB. Den ursprungliga modulen skrevs aldrig (se
// docs/handover/SAKNADE-MODULER-2026-06-24.md). Stubben monterar de förväntade
// bas-endpointsen så att require() i server.js resolvar och blocket inte längre
// faller tyst — men den returnerar 501 (ej implementerad) i stället för att hitta
// på kund-/PHI-data. Ersätt med en riktig implementation när kontraktet är känt.
//
// Signatur som server.js förväntar: module.exports = function(app, { dataDir, uploadDir })

'use strict';

const STUB_NOTE =
  'cco-customers server-patch är inte implementerad (stub). Se docs/handover/SAKNADE-MODULER-2026-06-24.md.';

function notImplemented(routeLabel) {
  return (req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      stub: true,
      route: routeLabel,
      note: STUB_NOTE,
    });
  };
}

module.exports = function mountCustomersServerPatch(app, options = {}) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('mountCustomersServerPatch: en Express-app krävs.');
  }
  const { dataDir = null, uploadDir = null } = options;

  // Bas-endpoints som frontend-previewen anropar men som saknar backend.
  // Subrouterna (/:id/timeline, /journal-feed, m.fl.) definieras redan i server.js
  // och rörs INTE här (undviker kollision / shadowing).
  app.get('/api/v1/cco-customers', notImplemented('list'));
  app.get('/api/v1/cco-customers/:id', notImplemented('dossier'));
  app.post('/api/v1/cco-customers/:id/photos', notImplemented('photo-upload'));
  app.get('/api/v1/cco-customers/:id/photos', notImplemented('photo-list'));

  // Exponera stub-status så att en framtida hälsokoll kan upptäcka att modulen är ofullständig.
  app.locals = app.locals || {};
  app.locals.ccoCustomersServerPatch = { stub: true, dataDir, uploadDir, note: STUB_NOTE };

  console.warn(
    '[cco-customers] server-patch monterad som STUB (501 ej implementerad) — se SAKNADE-MODULER-2026-06-24.md'
  );
};
