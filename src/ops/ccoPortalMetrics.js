'use strict';

/**
 * ccoPortalMetrics — adoptionsmätning för den fria portal-kanalen (följdsteg).
 * Samlar volym + engagemang från de tre portal-storarna så vi kan följa hur väl
 * portalen ersätter SMS/mail och om nudgen fungerar. Ren läs-aggregering.
 *
 * Ger en enkel "besparings-proxy": varje portal-meddelande är ett meddelande som
 * annars kunde ha gått som SMS. `estimatedSmsAvoided` = inbound + outbound.
 */

function buildPortalMetrics(stores = {}) {
  const { portalMessageStore = null, portalNudgeStore = null, portalAccessStore = null } = stores;

  const messages = portalMessageStore?.stats?.() || {
    customers: 0,
    patientsEngaged: 0,
    inbound: 0,
    outbound: 0,
    total: 0,
  };
  const nudges = portalNudgeStore?.stats?.() || { prepared: 0 };
  const access = portalAccessStore?.stats?.() || { total: 0, active: 0, revoked: 0 };

  // Konverteringsgrad: hur stor andel av de nudgade kunderna som faktiskt
  // engagerade sig (skrev i portalen). Skyddar mot division med noll.
  const nudgeConversion =
    nudges.prepared > 0
      ? Math.round((messages.patientsEngaged / nudges.prepared) * 100) / 100
      : null;

  return {
    generatedAt: null, // stämplas av anroparen (Date är otillgängligt i vissa körningar)
    messages,
    nudges,
    access,
    derived: {
      estimatedSmsAvoided: messages.total,
      nudgeConversion,
    },
  };
}

module.exports = { buildPortalMetrics };
