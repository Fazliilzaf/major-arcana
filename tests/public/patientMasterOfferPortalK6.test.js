'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

test('patient master offer panel exposes token-protected customer portal link', () => {
  const source = readSource();

  assert.match(source, /customerPortalUrl: ''/);
  assert.match(source, /runtime\.customerPortalUrl = payload\.customerPortalUrl \|\| ''/);
  assert.match(
    source,
    /\/api\/v1\/cco-commercial\/customer-offer-portal\?token=\$\{encodeURIComponent\(linkedOffer\.esignToken\)\}/
  );
  assert.match(source, /Öppna kundportal/);
  assert.match(source, /href="\$\{escapeHtml\(customerPortalUrl\)\}"/);
});
