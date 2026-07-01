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

test('patient master offer panel exposes K27 copy-only customer portal share message', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /data-patient-action="copy-customer-portal-message"/);
  assert.match(source, /Kopiera kundmeddelande/);
  assert.match(source, /function buildCustomerPortalShareMessage\(url\)/);
  assert.match(source, /Din personliga kundportal är nu redo/);
  assert.match(source, /Granska innan du skickar/);
  assert.match(
    source,
    /copyCustomerPortalShareMessage\(actionButton\.dataset\.customerPortalUrl\)/
  );
  assert.doesNotMatch(source, /data-patient-action="send-customer-portal-message"/);
});
