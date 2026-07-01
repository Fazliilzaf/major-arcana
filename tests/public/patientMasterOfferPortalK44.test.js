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

test('patient master offer panel locks K44 share message to the customer portal URL', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function renderCustomerPortalSharePreview\(customerPortalUrl\)/);
  assert.match(
    source,
    /buildCustomerPortalShareMessage\(customerPortalUrl, runtime\.detail\?\.card\)/
  );
  assert.match(source, /data-customer-portal-share-preview-text/);
  assert.match(source, /data-customer-portal-link-kind="customer">Kundlänk/);

  assert.match(source, /function copyCustomerPortalShareMessage\(url\)/);
  assert.match(
    source,
    /const message = buildCustomerPortalShareMessage\(rawUrl, runtime\.detail\?\.card\)/
  );
  assert.match(
    source,
    /copyCustomerPortalShareMessage\(actionButton\.dataset\.customerPortalUrl\)/
  );
  assert.match(source, /Din personliga kundportal är nu redo/);
  assert.match(source, /Hair TP Clinic/);

  assert.doesNotMatch(source, /buildCustomerPortalShareMessage\(customerPortalPreviewUrl/);
  assert.doesNotMatch(source, /copyCustomerPortalShareMessage\(customerPortalPreviewUrl/);
});
