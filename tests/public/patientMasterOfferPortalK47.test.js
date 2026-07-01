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

test('patient master offer panel shows K47 visible share blocker hint near copy actions', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /data-customer-portal-share-action-hint/);
  assert.match(source, /patient-master-share-action-hint/);
  assert.match(source, /patient-master-share-action-hint\$\{shareReady \? ' is-ready' : ''\}/);
  assert.match(source, /Delning låst: \$\{escapeHtml\(shareGateBlockerText\)\}/);
  assert.match(
    source,
    /Kundportalen är slutgranskad\. Kopiera portallänk eller kundmeddelande manuellt\./
  );
  assert.match(
    source,
    /data-customer-portal-share-blockers="\$\{escapeHtml\(shareGateBlockerText\)\}"/
  );
});
