/**
 * ccoCustomerJourneyOverview — stub (2026-06-02)
 *
 * Pausad. buildCustomerOverview returnerar tom struktur så att portal-
 * dashboard-route inte kraschar utan visar "väntar data".
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function buildCustomerOverview({ customer, patientCard } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    customerId: customer?.customerId || customer?.id || null,
    summary: {
      stage: 'unknown',
      stageLabel: 'Information ej tillgänglig (stub)',
      nextStep: null,
    },
    sections: [],
    timeline: [],
    bookings: [],
    documents: [],
    annotations: [],
    plans: [],
  };
}

module.exports = { buildCustomerOverview, SCHEMA_VERSION };
