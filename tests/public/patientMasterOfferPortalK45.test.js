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

test('patient master offer panel exposes K45 share blockers on locked copy actions', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /const shareGateBlockerText = shareGateBlockers\.join\(' · '\)/);
  assert.match(source, /Delning låst\. Saknas: \$\{shareGateBlockerText\}/);
  assert.match(
    source,
    /data-customer-portal-share-blockers="\$\{escapeHtml\(shareGateBlockerText\)\}"/
  );
  assert.match(
    source,
    /const shareReady = shareChecklistComplete && shareGateBlockers\.length === 0/
  );
  assert.match(source, /const shareGateAttrs = shareReady/);

  assert.match(source, /data-patient-action="copy-customer-portal-link"/);
  assert.match(source, /data-patient-action="copy-customer-portal-message"/);
  assert.match(source, /data-customer-portal-share-gated="true"/);
  assert.match(source, /data-customer-portal-share-blockers/);
});
