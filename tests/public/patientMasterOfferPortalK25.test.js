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

test('patient master offer panel exposes K25 staff-only customer portal preview', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function buildCustomerPortalPreviewUrlFromOffer\(linkedOffer\)/);
  assert.match(
    source,
    /\/api\/v1\/cco-commercial\/customer-offer-portal\/preview\?token=\$\{encodeURIComponent\(linkedOffer\.esignToken\)\}/
  );
  assert.match(source, /Förhandsgranska kundportal/);
  assert.match(source, /data-customer-portal-preview="staff"/);
  assert.match(source, /customerPortalPreviewUrl \|\| customerPortalUrl/);
});
