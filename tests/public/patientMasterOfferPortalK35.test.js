const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const patientMasterPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);

const polishPath = path.join(
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

test('K35 locks customer portal pages to Swedish mobile/iPad/web readiness', () => {
  const customerPortal = read(customerPortalPath);
  const quoteDemo = read(quoteDemoPath);
  const offerEsign = read(offerEsignPath);

  for (const source of [customerPortal, quoteDemo, offerEsign]) {
    assert.match(source, /<html lang="sv">/);
    assert.match(source, /viewport-fit=cover/);
    assert.match(source, /env\(safe-area-inset-(?:top|bottom)/);
    assert.match(source, /overflow-x:\s*(?:clip|auto)/);
    assert.match(source, /@media\s*\(/);
    assert.match(source, /Betänketid/);
    assert.match(source, /hårsäckar/);
  }

  assert.match(customerPortal, /@media \(min-width: 768px\)/);
  assert.match(customerPortal, /@media \(min-width: 1120px\)/);
  assert.match(customerPortal, /Din plan · Hair TP Clinic/);
  assert.match(customerPortal, /Ritade konsultationsbilder/);
  assert.match(quoteDemo, /Din offert · Hair TP Clinic/);
  assert.match(offerEsign, /Din offert · Hair TP Clinic/);
});

test('K35 locks staff preview/share controls to touch-safe responsive layout', () => {
  const source = read(patientMasterPath);
  const css = read(polishPath);

  assert.match(source, /data-customer-portal-preview="staff"/);
  assert.match(source, /Förhandsgranska kundportal/);
  assert.match(source, /data-customer-portal-final-share-readiness/);
  assert.match(source, /data-customer-portal-final-share-readiness-text/);
  assert.match(source, /Kopiera portallänk/);
  assert.match(source, /Kopiera kundmeddelande/);

  assert.match(css, /\.patient-master-final-share-readiness\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(css, /\.patient-master-final-share-readiness-text\s*\{[\s\S]*?flex:\s*1 1 14rem;/);
  assert.match(css, /\.patient-master-final-share-readiness-text\s*\{[\s\S]*?min-width:\s*0;/);
  assert.match(
    css,
    /\.patient-master-final-share-readiness-text\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/
  );
  assert.match(css, /@media \(max-width: 767px\)\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /@media \(max-width: 767px\)\s*\{[\s\S]*?white-space:\s*normal;/);
  assert.match(
    css,
    /@media \(max-width: 767px\)\s*\{[\s\S]*?\.patient-master-final-share-readiness\s*\{[\s\S]*?align-items:\s*flex-start;/
  );
});
