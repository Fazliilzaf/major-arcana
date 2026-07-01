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

test('patient master offer panel renders K48 final portal QA summary', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(
    source,
    /function renderCustomerPortalFinalQaStatus\(\s*linkedOffer,\s*customerPortalUrl,\s*planEntry,\s*photos,\s*values = \{\}\s*\)/
  );
  assert.match(source, /data-customer-portal-final-qa-status/);
  assert.match(
    source,
    /const systemReady = readinessItems\.filter\(\(item\) => item\.ready\)\.length/
  );
  assert.match(
    source,
    /const manualReady = CUSTOMER_PORTAL_SHARE_CHECKS\.filter\(\(item\) => values\[item\.key\]\)\.length/
  );
  assert.match(source, /QA \$\{readyCount\}\/\$\{total\}/);
  assert.match(source, /Slutlig portal-QA klar\./);
  assert.match(source, /Portal-QA pågår: systemberedskap \+ personalcheck\./);
  assert.match(
    source,
    /renderCustomerPortalFinalQaStatus\(\s*linkedOffer,\s*customerPortalUrl,\s*planEntry,\s*photos,\s*shareChecklistValues\s*\)/
  );
});
