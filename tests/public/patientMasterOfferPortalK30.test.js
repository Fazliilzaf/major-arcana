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

test('patient master offer panel renders K30 manual share checklist without backend writes', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /CUSTOMER_PORTAL_SHARE_CHECKS/);
  assert.match(source, /Jag har granskat portalen/);
  assert.match(source, /Bilder, zoner och pris stämmer/);
  assert.match(source, /Kundmeddelandet är granskat/);
  assert.match(source, /data-customer-portal-share-checklist/);
  assert.match(
    source,
    /Delningscheck \$\{checkedCount\}\/\$\{CUSTOMER_PORTAL_SHARE_CHECKS\.length\}/
  );
  assert.match(source, /window\.localStorage\?\.setItem\(/);
  assert.match(source, /JSON\.stringify\(signature \? \{ signature, values \} : values\)/);
  assert.match(
    source,
    /renderCustomerPortalShareChecklist\(linkedOffer, customerPortalUrl, planEntry, photos\)/
  );
  assert.doesNotMatch(source, /data-patient-action="send-customer-portal-message"/);
});
