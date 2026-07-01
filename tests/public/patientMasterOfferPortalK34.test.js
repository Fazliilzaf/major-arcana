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

const cssPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'cco-polish.css'
);

test('patient master offer panel renders K34 final share readiness gate', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(source, /function getCustomerPortalShareBlockers\(/);
  assert.match(source, /function renderCustomerPortalFinalShareReadiness\(/);
  assert.match(source, /data-customer-portal-final-share-readiness/);
  assert.match(source, /data-customer-portal-readiness-blockers/);
  assert.match(source, /Delning låst/);
  assert.match(source, /Slutkontroll redo/);
  assert.match(source, /Delning låst\. Saknas: \$\{shareGateBlockers\.join\(' · '\)\}/);
  assert.match(
    source,
    /syncCustomerPortalShareActionState\(checklist, allChecked && readinessBlockers\.length === 0\)/
  );
  assert.match(css, /\.patient-master-final-share-readiness/);
  assert.match(css, /\.patient-master-final-share-readiness\.is-ready/);
});
