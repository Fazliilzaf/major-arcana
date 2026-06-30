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

test('patient master offer panel renders K7 status and next-step controls', () => {
  const source = fs.readFileSync(patientMasterUiPath, 'utf8');

  assert.match(source, /function renderOfferNextStep\(linkedOffer, customerPortalUrl\)/);
  assert.match(source, /Nästa: skapa behandlingsavtal och samtycke från accepterad offert\./);
  assert.match(source, /Kunden kan läsa portalen nu\. Signering öppnar efter betänketiden/);
  assert.match(source, /Portal \$\{customerPortalUrl \? 'klar' : 'saknas'\}/);
  assert.match(source, /Signering \$\{escapeHtml\(esignStatus\)\}/);
  assert.match(source, /data-patient-action="copy-customer-portal-link"/);
  assert.match(source, /Kopiera portallänk/);
  assert.match(source, /function copyCustomerPortalLink\(url\)/);
  assert.match(source, /new URL\(rawUrl, window\.location\.origin\)\.toString\(\)/);
  assert.match(source, /Kundportallänk kopierad\./);
});

test('K7 offer next-step styling is scoped to patient master offer card', () => {
  const css = fs.readFileSync(polishCssPath, 'utf8');

  assert.match(css, /\.patient-master-offer-next-step/);
  assert.match(css, /\.patient-master-offer-next-step \.patient-master-status-badge/);
  assert.match(css, /\.patient-master-offer-next-step \.patient-master-status-badge\.is-accent/);
});
