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
