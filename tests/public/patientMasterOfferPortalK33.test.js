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

test('patient master offer panel explains K33 share decision state', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function renderCustomerPortalShareDecision\(values = \{\}\)/);
  assert.match(source, /data-customer-portal-share-decision/);
  assert.match(source, /Redo att dela: portallänk och kundmeddelande är upplåsta/);
  assert.match(source, /nollställs delningschecken automatiskt/);
  assert.match(source, /Väntar på: \$\{escapeHtml\(missing\.join\(' · '\)\)\}/);
  assert.match(source, /Portallänk och kundmeddelande är låsta tills allt är granskat/);
  assert.match(source, /decisionEl\.textContent = allChecked/);
});
