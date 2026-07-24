'use strict';

/* "Inkopplingen": panelerna ska KONSUMERA den redan lösta patient-ID-kopplingen
 * (Cursors resolver + worklist-overlay + patient-master-API är redan live) och
 * visa RIKTIG kund i stället för hårdkodad demo. Svarstudio är första ytan:
 * fabricerade demo-widgets (VIP-högt-värde/engagemang/SLA/AI-"nästa steg")
 * neutraliseras, och verkliga fält (namn, LTV, VIP-flagga) binds från patient-
 * master via patient.id. Fail-closed: patientId sätts bara vid exakt e-postmatch,
 * så ett '@' (e-post) hämtar inget → aldrig fel patient. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER = path.join(__dirname, '..', '..', 'public', 'konversationer-bottom-actions.js');

test('launchern hämtar riktig kundpost via patient-master-API på patient.id (fail-closed på e-post)', () => {
  const source = fs.readFileSync(LAUNCHER, 'utf8');
  assert.match(source, /async function fetchPatientMasterCard\(patientId\)/);
  assert.match(
    source,
    /'\/api\/v1\/cco-patient-master\/patient\?patientId='/,
    'ska anropa den befintliga patient-master-endpointen'
  );
  // Fail-closed: en e-post (innehåller @) är inte ett patient-ID → hämta inget.
  assert.match(source, /indexOf\('@'\) !== -1\) return null/);
  assert.match(source, /adminAuthHeaders\(/, 'ska använda admin-bearer-bryggan (samma som övriga live-anrop)');
});

test('Svarstudio neutraliserar fabricerade demo-widgets och binder riktiga fält från patient-master', () => {
  const source = fs.readFileSync(LAUNCHER, 'utf8');
  const start = source.indexOf('async function mountSvarstudioV2(');
  const body = source.slice(start, source.indexOf('async function ', start + 10));
  assert.ok(start > -1, 'mountSvarstudioV2 ska finnas');

  // Fabricerade demo-chips/spills döljs på riktig tråd (saknar riktig källa).
  for (const sel of ['.wb-chip--engage', '.wb-chip--sla', '.sp-vip']) {
    assert.ok(body.includes(sel), 'ska neutralisera fabricerad demo-widget: ' + sel);
  }
  // Riktiga fält binds från den hämtade kundposten.
  assert.match(body, /fetchPatientMasterCard\(customerId\)/, 'Svarstudio ska hämta kundposten via patient-ID');
  assert.match(body, /card\.displayName/, 'ska binda riktigt namn');
  assert.match(body, /card\.lifetimeValue/, 'ska binda riktig LTV');
  assert.match(body, /card\.flags/, 'VIP ska bara visas vid en riktig flagga');
});
