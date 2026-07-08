'use strict';

/**
 * ccoPortalCustomerPayload — bygger den kundvända nivå-2-payloaden ur ett
 * commercialCase. READ-ONLY. Samma `offerPlan`-källa som PDF/signeringssida
 * (se docs/customer-portal-offer-flow-k1-k2-2026-07-01.md) → ingen andra sanning.
 *
 * Innehåller INGET medicinskt/journal utöver offerten här — journal läggs på i
 * ett senare steg och bara bakom nivå-2 (BankID). Payloaden är rå data; portalen
 * escape:ar dynamiska värden vid rendering.
 */

const { getCoolingOffMeta, canAcceptOffer } = require('./ccoOfferEsign');

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/**
 * Härled kundens signeringsstatus ur quoteStatus + betänketid.
 *   missing/draft  → 'preparing'  (offert ej redo)
 *   sent + cooling → 'cooling_off'
 *   sent + klar    → 'ready_to_sign'
 *   accepted       → 'signed'
 */
function deriveSigningStatus(commercialCase, nowMs) {
  const quoteStatus = text(commercialCase.quoteStatus);
  const cooling = getCoolingOffMeta(commercialCase, nowMs);
  if (quoteStatus === 'accepted') {
    return { status: 'signed', canAccept: false, coolingOff: cooling };
  }
  if (quoteStatus !== 'sent') {
    return { status: 'preparing', canAccept: false, coolingOff: cooling };
  }
  const accept = canAcceptOffer(commercialCase, { nowMs });
  return {
    status: cooling.active ? 'cooling_off' : 'ready_to_sign',
    canAccept: accept.allowed === true,
    coolingOff: cooling,
  };
}

/**
 * @param {{patientId:string, displayName?:string, commercialCase:object, nowMs?:number}} ref
 * @returns {{patientId, displayName, hasOffer, offerPlan, quoteStatus, signing, updatedAt}}
 */
function buildLevelTwoPayload(ref = {}) {
  const patientId = text(ref.patientId);
  const nowMs = Number.isFinite(ref.nowMs) ? ref.nowMs : Date.now();
  const commercialCase = asObject(ref.commercialCase);

  const base = {
    patientId,
    displayName: text(ref.displayName) || null,
    hasOffer: false,
    offerPlan: null,
    quoteStatus: 'missing',
    signing: { status: 'preparing', canAccept: false, coolingOff: getCoolingOffMeta({}, nowMs) },
    updatedAt: null,
  };
  if (!commercialCase) return base;

  const offerPlan = asObject(commercialCase.offerPlan);
  const signing = deriveSigningStatus(commercialCase, nowMs);
  return {
    patientId,
    displayName: text(ref.displayName) || text(commercialCase.customerName) || null,
    hasOffer: Boolean(offerPlan),
    offerPlan: offerPlan || null,
    quoteStatus: text(commercialCase.quoteStatus) || 'missing',
    signing,
    updatedAt: text(commercialCase.updatedAt) || null,
  };
}

module.exports = { buildLevelTwoPayload, deriveSigningStatus };
