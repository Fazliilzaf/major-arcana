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

test('patient master offer panel renders K24 customer portal next action', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function getCustomerPortalReadinessAction\(items, customerPortalUrl\)/);
  assert.match(source, /data-customer-portal-readiness-action/);
  assert.match(source, /Nästa: dela kundportalen/);
  assert.match(source, /Skicka offerten för signering så portaltoken skapas\./);
  assert.match(source, /Skapa eller uppdatera offertunderlaget från behandlingsplanen\./);
  assert.match(source, /Sätt priset innan portalen delas med kund\./);
  assert.match(source, /Fyll zoner och hårsäckar i planen innan utskick\./);
  assert.match(source, /Koppla ritade konsultationsbilder till offerten\./);
});
