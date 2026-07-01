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

test('patient master offer panel personalizes K29 customer portal share message when name exists', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function getCustomerPortalGreetingName\(card\)/);
  assert.match(source, /const displayName = displayNameForList\(card\)/);
  assert.match(source, /displayName === 'Namn saknas'/);
  assert.match(source, /greetingName \? `Hej \$\{greetingName\},` : 'Hej,'/);
  assert.match(
    source,
    /buildCustomerPortalShareMessage\(customerPortalUrl, runtime\.detail\?\.card\)/
  );
  assert.match(source, /buildCustomerPortalShareMessage\(rawUrl, runtime\.detail\?\.card\)/);
});
