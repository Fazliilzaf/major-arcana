const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);

const cssPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'cco-polish.css'
);

const customerPortalPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'cco-patient-offer-portal-v3.html'
);

const quoteDemoPath = path.join(__dirname, '..', '..', 'public', 'customer-quote.html');

const offerEsignPath = path.join(__dirname, '..', '..', 'src', 'ops', 'ccoOfferEsign.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('K8 locks cooling-off start evidence in patient master staff view', () => {
  const source = read(sourcePath);
  const css = read(cssPath);

  assert.match(source, /function getCustomerPortalEvidenceDate\(linkedOffer\)/);
  assert.match(source, /offerPlan\.informationDeliveredAt/);
  assert.match(source, /linkedOffer\?\.quoteSentAt/);
  assert.match(source, /data-customer-portal-k8-evidence/);
  assert.match(source, /data-customer-portal-info-sent-at/);
  assert.match(source, /Info\/offert skickad/);
  assert.match(source, /Signering från/);
  assert.match(css, /\.patient-master-portal-evidence/);
  assert.match(css, /\.patient-master-portal-evidence-text/);
});

test('K9 renders staff preview summary before customer portal sharing', () => {
  const source = read(sourcePath);
  const css = read(cssPath);

  assert.match(
    source,
    /function renderCustomerPortalStaffPreviewSummary\(\s*linkedOffer,\s*customerPortalUrl,\s*planEntry,\s*photos\s*\)/
  );
  assert.match(source, /data-customer-portal-k9-preview-summary/);
  assert.match(source, /Staff preview/);
  assert.match(source, /Portal\/token finns/);
  assert.match(source, /Pris/);
  assert.match(source, /Hårsäckar\/zoner/);
  assert.match(source, /Konsultationsbilder/);
  assert.match(source, /Startdatum/);
  assert.match(source, /summarizeCustomerPortalZones\(linkedOffer, planEntry\)/);
  assert.match(source, /summarizeCustomerPortalPhotos\(photos\)/);
  assert.match(css, /\.patient-master-portal-preview-summary/);
  assert.match(css, /\.patient-master-portal-preview-summary dl/);
});

test('K10 keeps customer portal visual sign-off locked for mobile, iPad and web', () => {
  const customerPortal = read(customerPortalPath);
  const quoteDemo = read(quoteDemoPath);
  const offerEsign = read(offerEsignPath);
  const css = read(cssPath);

  for (const source of [customerPortal, quoteDemo, offerEsign]) {
    assert.match(source, /<html lang="sv">/);
    assert.match(source, /viewport-fit=cover/);
    assert.match(source, /@media\s*\(/);
    assert.match(source, /Betänketid/);
    assert.match(source, /hårsäckar/);
  }

  assert.match(customerPortal, /@media \(min-width: 768px\)/);
  assert.match(customerPortal, /@media \(min-width: 1120px\)/);
  assert.match(customerPortal, /Ritade konsultationsbilder/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(
    css,
    /\.patient-master-portal-preview-summary dl\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
  );
});
