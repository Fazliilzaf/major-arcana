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

test('patient master offer panel gates K31 share copy actions until checklist is complete', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function isCustomerPortalShareChecklistComplete\(linkedOffer\)/);
  assert.match(source, /CUSTOMER_PORTAL_SHARE_CHECKS\.every\(\(item\) => values\[item\.key\]\)/);
  assert.match(source, /function syncCustomerPortalShareActionState\(scope, allChecked\)/);
  assert.match(source, /data-customer-portal-share-gated="true"/);
  assert.match(
    source,
    /const shareChecklistComplete = isCustomerPortalShareChecklistComplete\(linkedOffer\)/
  );
  assert.match(source, /const shareGateAttrs = shareChecklistComplete/);
  assert.match(source, /Bocka av delningschecken innan länken eller meddelandet kopieras/);
  assert.match(source, /syncCustomerPortalShareActionState\(checklist, allChecked\)/);
});
