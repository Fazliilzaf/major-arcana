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

test('patient master offer panel renders K28 customer portal share message preview', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function renderCustomerPortalSharePreview\(customerPortalUrl\)/);
  assert.match(source, /data-customer-portal-share-preview/);
  assert.match(source, /data-customer-portal-share-preview-text/);
  assert.match(source, /Förhandsgranska innan kopiering/);
  assert.match(source, /Detta skickas inte automatiskt/);
  assert.match(source, /renderCustomerPortalSharePreview\(customerPortalUrl\)/);
});
