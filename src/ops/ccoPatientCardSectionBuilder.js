/**
 * ccoPatientCardSectionBuilder — stub (2026-06-02)
 *
 * Pausad. buildPatientCardSections returnerar tom array så portal-routes
 * och read-only patientkort-endpoints inte kraschar.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

async function buildPatientCardSections({ customerId } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    customerId: customerId || null,
    sections: [],
    note: 'Patient card section builder pausad (stub).',
  };
}

module.exports = { buildPatientCardSections, SCHEMA_VERSION };
