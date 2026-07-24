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
const SHELL = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'cco-conversations-v2-shell.js'
);

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
  // sgrid-cellerna neutraliseras till "—" när tråden inte fyller dem (annars
  // står "Egzona K."/"SLA 38 min"/"42 tkr" kvar och motsäger riktig LTV).
  assert.match(
    body,
    /vEl\.textContent = v != null && v !== '' && v !== '—' \? v : '—'/,
    'obesvarade sgrid-celler ska neutraliseras till "—"'
  );
  assert.match(body, /key !== 'värde'/, 'Värde-cellen ska fyllas med riktig LTV från patient-master');
  // Riktiga fält binds från den hämtade kundposten.
  // HÄMTA på det kanoniska patient-ID:t (ctx.patientId), ALDRIG på customerId
  // (kan vara e-post) eller activeCustomerId-demofallbacken (CUST-DEMO-002).
  assert.match(
    body,
    /fetchPatientMasterCard\(ctx\.patientId\)/,
    'Svarstudio ska hämta på det kanoniska patient-ID:t, inte customerId/demofallback'
  );
  assert.doesNotMatch(
    body,
    /fetchPatientMasterCard\(customerId\)/,
    'får inte hämta på customerId (kan vara e-post eller CUST-DEMO-002-demofallback)'
  );
  assert.match(body, /card\.displayName/, 'ska binda riktigt namn');
  assert.match(body, /card\.lifetimeValue/, 'ska binda riktig LTV');
  assert.match(body, /card\.flags/, 'VIP ska bara visas vid en riktig flagga');

  // Race-guard: den parallella dossier-mini-hämtningen (på e-post/customerId) får
  // inte skriva över det kanoniska patient-master-namnet, oavsett svarsordning.
  // (Dossier-renderaren ligger utanför body-slicen — kolla hela källan.)
  assert.match(source, /patientMasterNameBound = true/, 'patient-master ska markera att namnet är kanoniskt bundet');
  assert.match(
    source,
    /if \(name && !patientMasterNameBound\) setText\('\.kk-name', name\)/,
    'dossier-mini får inte skriva över det kanoniska namnet'
  );
});

test('launcher-kontexten (buildLauncherThreadContext) exponerar ett kanoniskt patientId (endast vid match)', () => {
  const shell = fs.readFileSync(SHELL, 'utf8');
  // confirmedPatientId sätts bara vid bekräftad handoff; kontexten exponerar det
  // som ett kanoniskt patientId skilt från customerId (som kan bli e-post).
  assert.match(shell, /var confirmedPatientId = handoffConfirmed/);
  assert.match(
    shell,
    /patientId: confirmedPatientId,/,
    'buildLauncherThreadContext ska exponera patientId: confirmedPatientId'
  );
});
