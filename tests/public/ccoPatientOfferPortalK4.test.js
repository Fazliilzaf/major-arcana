'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const portalPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'cco-patient-offer-portal-v3.html'
);

function readPortal() {
  return fs.readFileSync(portalPath, 'utf8');
}

test('customer offer portal renders from offerPlan contract hooks', () => {
  const source = readPortal();
  assert.match(source, /var DEMO_OFFER_PLAN = \{/);
  assert.match(source, /schemaVersion: 'offer-plan\.v1'/);
  assert.match(source, /window\.ARCANA_CUSTOMER_OFFER_PLAN \|\| DEMO_OFFER_PLAN/);
  assert.match(source, /function renderOfferPlanToPortal\(planInput\)/);
  assert.match(source, /data-offer-zones/);
  assert.match(source, /data-offer-graft-bar/);
  assert.match(source, /data-offer-zone-legend/);
  assert.match(source, /data-offer-quoted-amount/);
  assert.match(source, /data-offer-planning-note/);
});

test('customer offer portal keeps K4 Swedish zone and price defaults', () => {
  const source = readPortal();
  assert.match(source, /Hårlinje/);
  assert.match(source, /Mittparti/);
  assert.match(source, /Krona/);
  assert.match(source, /hårsäckar/);
  assert.match(source, /59 000 kr/);
  assert.match(source, /−5 000 kr/);
  assert.match(source, /54 000 kr/);
  assert.match(source, /Planering från konsultation och ritade bilder/);
});

test('customer offer portal escapes offerPlan values before innerHTML rendering', () => {
  const source = readPortal();
  assert.match(source, /function escapeHtml\(value\)/);
  assert.match(source, /escapeHtml\(safeText\(item\.label/);
  assert.match(source, /escapeHtml\(formatGrafts\(item\.grafts\)\)/);
  assert.match(source, /escapeHtml\(method\)/);
});

test('customer offer portal applies K8 live status context', () => {
  const source = readPortal();
  assert.match(source, /window\.ARCANA_CUSTOMER_OFFER_CONTEXT \|\| \{\}/);
  assert.match(source, /function applyCustomerOfferContext\(contextInput\)/);
  assert.match(source, /data-portal-quote-status/);
  assert.match(source, /data-portal-esign-status/);
  assert.match(source, /data-portal-cooling-status/);
  assert.match(source, /data-portal-next-step/);
  assert.match(source, /Betänketid pågår/);
  assert.match(source, /Öppna säker signering/);
});

test('customer offer portal wires K9 token-protected document downloads', () => {
  const source = readPortal();
  assert.match(source, /data-offer-document-pdf/);
  assert.match(source, /data-offer-document-link/);
  assert.match(source, /offerDocumentPdfUrl/);
  assert.match(source, /offerDocumentUrl/);
  assert.match(source, /Ladda ner offert-PDF/);
  assert.match(source, /Öppna offertunderlag/);
});

test('customer offer portal renders K10 live evidence file list', () => {
  const source = readPortal();
  assert.match(source, /data-portal-files-panel/);
  assert.match(source, /data-portal-files-list/);
  assert.match(source, /function renderPortalFiles\(filesInput\)/);
  assert.match(source, /portal-file-link/);
  assert.match(source, /Mina underlag/);
  assert.match(source, /renderPortalFiles\(context\.portalFiles\)/);
});

test('customer offer portal renders K13 live consultation photo gallery', () => {
  const source = readPortal();
  assert.match(source, /data-portal-photos-panel/);
  assert.match(source, /data-portal-photos-list/);
  assert.match(source, /function renderPortalPhotos\(photosInput\)/);
  assert.match(source, /portal-photo-card/);
  assert.match(source, /Ritade konsultationsbilder/);
  assert.match(source, /Bilderna kommer från konsultationens behandlingsplan/);
  assert.match(source, /renderPortalPhotos\(context\.portalPhotos\)/);
});

test('customer offer portal renders K14 live plan evidence from photos and zones', () => {
  const source = readPortal();
  assert.match(source, /data-portal-plan-evidence/);
  assert.match(source, /Plan från ritningarna/);
  assert.match(source, /data-plan-evidence-total-grafts/);
  assert.match(source, /data-plan-evidence-price/);
  assert.match(source, /data-plan-evidence-method/);
  assert.match(source, /data-plan-evidence-zones/);
  assert.match(source, /function renderPlanEvidence\(planInput, photosInput\)/);
  assert.match(source, /resolveOfferPlanTotals\(planInput\)/);
  assert.match(source, /renderPlanEvidence\(/);
  assert.match(source, /window\.ARCANA_CUSTOMER_OFFER_PLAN \|\| DEMO_OFFER_PLAN/);
  assert.match(source, /context\.portalPhotos/);
});

test('customer offer portal renders K15 live next action CTA', () => {
  const source = readPortal();
  assert.match(source, /data-portal-next-action/);
  assert.match(source, /data-next-action-button/);
  assert.match(source, /function resolvePortalNextAction\(contextInput\)/);
  assert.match(source, /function renderPortalNextAction\(contextInput\)/);
  assert.match(source, /Redo att signera\?/);
  assert.match(source, /Läs igenom allt i lugn och ro/);
  assert.match(source, /Offerten är signerad/);
  assert.match(source, /renderPortalNextAction\(context\)/);
});

test('customer offer portal renders K16 live journey gates', () => {
  const source = readPortal();
  assert.match(source, /data-portal-journey-gates/);
  assert.match(source, /data-portal-journey-gates-list/);
  assert.match(source, /function resolvePortalJourneyGates\(contextInput\)/);
  assert.match(source, /function renderPortalJourneyGates\(contextInput\)/);
  assert.match(source, /Avtal och behandlingssamtycke/);
  assert.match(source, /Friskförsäkran på operationsdagen/);
  assert.match(source, /Fotosamtycke/);
  assert.match(source, /VIP-bokning och operationstid/);
  assert.match(source, /renderPortalJourneyGates\(context\)/);
});

test('customer offer portal renders K17 operation day readiness panel', () => {
  const source = readPortal();
  assert.match(source, /data-operation-day-panel/);
  assert.match(source, /data-operation-day-checks/);
  assert.match(source, /function resolveOperationDayReadiness\(contextInput, planInput\)/);
  assert.match(source, /function renderOperationDayPanel\(contextInput, planInput\)/);
  assert.match(source, /Friskförsäkran samma dag/);
  assert.match(source, /Fylls i och signeras på plats samma dag som hårtransplantationen/);
  assert.match(source, /Inget journalinnehåll skapas automatiskt från portalen/);
  assert.match(source, /renderOperationDayPanel\(context, window\.ARCANA_CUSTOMER_OFFER_PLAN/);
});

test('customer offer portal renders K18 aftercare and follow-up readiness panel', () => {
  const source = readPortal();
  assert.match(source, /data-aftercare-panel/);
  assert.match(source, /data-aftercare-steps/);
  assert.match(source, /function resolveAftercareReadiness\(contextInput\)/);
  assert.match(source, /function renderAftercarePanel\(contextInput\)/);
  assert.match(source, /Eftervård och uppföljning/);
  assert.match(source, /Bildinlämning/);
  assert.match(source, /4, 6 och 12 månaders uppföljning/);
  assert.match(source, /personalen granskar alltid uppföljningar innan journal/);
  assert.match(source, /renderAftercarePanel\(context\)/);
});
