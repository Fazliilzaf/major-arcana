const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const patientMasterUiPath = path.join(
  repoRoot,
  'public/major-arcana-preview/app/patient-master-ui.js'
);
const polishCssPath = path.join(repoRoot, 'public/major-arcana-preview/cco-polish.css');

test('patient master offer panel renders K11 customer portal activity from existing quote opens', () => {
  const source = fs.readFileSync(patientMasterUiPath, 'utf8');

  assert.match(source, /function renderOfferPortalActivity\(linkedOffer\)/);
  assert.match(source, /const quoteOpens = asArray\(linkedOffer\.quoteOpens\)/);
  assert.match(source, /normalizeText\(event\?\.type\) === 'offer_opened'/);
  assert.match(source, /offerPortalActivityLabel\(latestSource\)/);
  assert.match(source, /Kundportalaktivitet/);
  assert.match(source, /Portal öppnad/);
  assert.match(source, /PDF öppnad/);
  assert.match(source, /Bild öppnad/);
  assert.match(source, /Signeringssida öppnad/);
  assert.match(source, /renderOfferPortalActivity\(linkedOffer\)/);
});

test('K11 customer portal activity styling is scoped to patient master offer card', () => {
  const css = fs.readFileSync(polishCssPath, 'utf8');

  assert.match(css, /\.patient-master-offer-activity/);
  assert.match(css, /\.patient-master-offer-activity \.patient-master-status-badge/);
  assert.match(css, /\.patient-master-offer-activity \.patient-master-status-badge\.is-accent/);
});
