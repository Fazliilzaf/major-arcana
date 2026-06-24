// CCO Kunder-modul — real-data-adapter (STUB)
//
// ÄRLIG STUB. Modulen skrevs aldrig (se docs/handover/SAKNADE-MODULER-2026-06-24.md).
// Aktiveras endast opt-in via env ARCANA_CCO_USE_REAL_DATA=true, så den är normalt
// vilande. Stubben gör require() resolvbart och monterar 501-routes i stället för
// att koppla in riktig Cliento/Drive-data. Ersätt med riktig adapter när kontraktet
// (customerStore/bookingStore/driveClient-API) är fastställt.
//
// Exports som server.js förväntar: { createCcoRealDataAdapter, mountRealDataRoutes }

'use strict';

const STUB_NOTE =
  'cco-customers real-data-adapter är inte implementerad (stub). Se docs/handover/SAKNADE-MODULER-2026-06-24.md.';

function createCcoRealDataAdapter(options = {}) {
  const {
    customerStore = null,
    bookingStore = null,
    tenantId = null,
    driveClient = null,
  } = options;
  return {
    stub: true,
    tenantId,
    hasCustomerStore: Boolean(customerStore),
    hasBookingStore: Boolean(bookingStore),
    hasDriveClient: Boolean(driveClient),
    note: STUB_NOTE,
    // Förväntade datametoder — kasta tydligt hellre än att returnera fejkad data.
    listCustomers() {
      throw new Error(STUB_NOTE);
    },
    getCustomer() {
      throw new Error(STUB_NOTE);
    },
  };
}

function mountRealDataRoutes(app, _adapter) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('mountRealDataRoutes: en Express-app krävs.');
  }
  const handler = (req, res) =>
    res.status(501).json({ error: 'not_implemented', stub: true, note: STUB_NOTE });

  app.get('/api/v1/cco-customers-real', handler);
  app.get('/api/v1/cco-customers-real/:id', handler);

  app.locals = app.locals || {};
  app.locals.ccoCustomersRealDataAdapter = { stub: true, note: STUB_NOTE };

  console.warn(
    '[cco-customers] real-data-adapter monterad som STUB (501 ej implementerad) — se SAKNADE-MODULER-2026-06-24.md'
  );
}

module.exports = { createCcoRealDataAdapter, mountRealDataRoutes };
