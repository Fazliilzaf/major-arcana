/**
 * ccoEncounterCompositeBuilder — stub (2026-06-02)
 *
 * Pausad. buildEncounterComposite returnerar tom struktur.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

async function buildEncounterComposite({ customerId, encounterId } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    customerId: customerId || null,
    encounterId: encounterId || null,
    composite: null,
    note: 'Encounter composite builder pausad (stub).',
  };
}

module.exports = { buildEncounterComposite, SCHEMA_VERSION };
