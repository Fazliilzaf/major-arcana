/**
 * ccoOfferPdfFromPlan — stub (2026-06-02)
 *
 * Pausad bakom Offer-PDF-Preview-spåret. Stubben håller server.js-IIFE
 * vid liv så CF.2–CF.9-routes mountar.
 *
 * buildOfferHtml returnerar en minimal HTML-platsåtargare för att inte
 * krascha render-pipelinen vid anrop.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function buildOfferHtml({ offer, plan, customer } = {}) {
  const offerId = offer && offer.id ? String(offer.id) : 'okänd';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Offer ${offerId}</title></head>
<body style="font-family:sans-serif;padding:24px;">
<h1>Offert ${offerId}</h1>
<p><em>Offer-PDF-modulen är pausad (stub). Riktig PDF-rendering kommer i framtida release.</em></p>
</body></html>`;
}

module.exports = { buildOfferHtml, SCHEMA_VERSION };
