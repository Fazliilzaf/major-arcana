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

test('patient master offer panel renders K23 portal readiness before sharing', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(
    source,
    /function buildCustomerPortalReadinessItems\(linkedOffer, planEntry, photos, customerPortalUrl\)/
  );
  assert.match(
    source,
    /function renderCustomerPortalReadiness\(linkedOffer, planEntry, photos, customerPortalUrl\)/
  );
  assert.match(source, /data-customer-portal-readiness/);
  assert.match(source, /data-customer-portal-readiness-items/);
  assert.match(source, /Portalberedskap \$\{readyCount\}\/\$\{items\.length\}/);
  assert.match(source, /Redo att dela med kund/);
  assert.match(source, /Granska innan utskick/);
  assert.match(source, /Kundportal/);
  assert.match(source, /Offertunderlag/);
  assert.match(source, /Hårsäckar/);
  assert.match(source, /Bilder/);
  assert.match(
    source,
    /renderCustomerPortalReadiness\(linkedOffer, planEntry, photos, customerPortalUrl\)/
  );
});
