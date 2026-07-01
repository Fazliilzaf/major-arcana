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

test('patient master offer panel invalidates K32 share checklist when portal content changes', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function buildCustomerPortalShareChecklistSignature\(/);
  assert.match(source, /buildCustomerPortalReadinessItems\(/);
  assert.match(
    source,
    /message: buildCustomerPortalShareMessage\(customerPortalUrl, runtime\.detail\?\.card\)/
  );
  assert.match(source, /data-customer-portal-share-checklist-signature/);
  assert.match(source, /if \(signature && saved\.signature !== signature\) return \{\}/);
  assert.match(source, /JSON\.stringify\(signature \? \{ signature, values \} : values\)/);
  assert.match(
    source,
    /isCustomerPortalShareChecklistComplete\(\s*linkedOffer,\s*customerPortalShareSignature\s*\)/
  );
});
