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

test('patient master offer panel separates K43 staff preview from customer share links', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function buildCustomerPortalPreviewUrlFromOffer\(linkedOffer\)/);
  assert.match(source, /customer-offer-portal\/preview\?token=/);
  assert.match(source, /data-customer-portal-preview="staff"/);
  assert.match(source, /data-customer-portal-link-kind="staff-preview"/);
  assert.match(source, /Personalpreview\. Skicka inte denna länk till kund\./);

  assert.match(source, /function getCustomerPortalUrl\(linkedOffer\)/);
  assert.match(source, /customer-offer-portal\?token=/);
  assert.match(source, /data-customer-portal-link-kind="customer"/);
  assert.match(source, /data-patient-action="copy-customer-portal-link"/);
  assert.match(source, /data-patient-action="copy-customer-portal-message"/);
  assert.match(source, /data-customer-portal-url="\$\{escapeHtml\(customerPortalUrl\)\}"/);
  assert.doesNotMatch(
    source,
    /data-patient-action="copy-customer-portal-link"[\s\S]{0,240}customerPortalPreviewUrl/
  );
  assert.doesNotMatch(
    source,
    /data-patient-action="copy-customer-portal-message"[\s\S]{0,240}customerPortalPreviewUrl/
  );
});
