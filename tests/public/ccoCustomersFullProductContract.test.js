'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const PATIENT_UI = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);
const SUBNAV = path.join(ROOT, 'public', 'admin', 'cco-subnav.js');

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const ui = fs.readFileSync(PATIENT_UI, 'utf8');
const subnav = fs.readFileSync(SUBNAV, 'utf8');

test('admin#cco Kunder monterar hela skarpa kundprodukten', () => {
  assert.match(
    subnav,
    /CUSTOMER_FLAGS = 'v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on'/
  );
  assert.doesNotMatch(subnav, /demoOpDay|demo=on/);
  assert.match(html, /data-shell-view="customers"/);
  assert.match(html, /data-customer-list/);
  assert.match(html, /data-patient-master-rail/);
});

test('hela kundpopulationen använder patient-master med fortsatt paginering', () => {
  assert.match(ui, /const PAGE_SIZE = 60/);
  assert.match(ui, /initialParams\.set\('phase', 'list'\)/);
  assert.match(ui, /runtime\.offset \+= PAGE_SIZE/);
  assert.match(ui, /data-patient-load-more/);
  assert.match(ui, /runtime\.total/);
});

test('kundrad öppnar V11-dossier och V11-sektion öppnar V12 Content Canon', () => {
  assert.match(ui, /window\.CcoV11RailKomplett\.render\(railCtx\)/);
  assert.match(ui, /data-v11-rail-shell="1"/);
  assert.match(ui, /bindV12WorkspaceRailLauncher\(root, ctx\)/);
  assert.match(ui, /openV12WorkspaceFromRail\(root, ctx, moduleName\)/);
  assert.match(ui, /window\.CcoV12Canon\.render\(ctx\)/);
  assert.match(ui, /data-v12-workspace-shell="1"/);
  assert.match(ui, /data-customer-product-loading="v11"/);
});

test('sena V11/V12-renderare ersätter laddningsläget utan legacy-fallback', () => {
  const adaptersIndex = html.indexOf('src="./app/cco-v11-rail-adapters.js');
  const railIndex = html.indexOf('src="./app/cco-v11-rk.js');
  const canonIndex = html.indexOf('src="./app/cco-v12-canon.js');

  assert.ok(adaptersIndex !== -1 && adaptersIndex < railIndex);
  assert.ok(railIndex < canonIndex);
  assert.match(html, /arcana:customer-product-renderers-ready/);
  assert.match(ui, /addEventListener\('arcana:customer-product-renderers-ready'/);
  assert.match(ui, /refreshFullCustomerProductWhenReady/);
  assert.doesNotMatch(ui, /Scaffold aktiv \(\?v11rail=on\)/);
});

test('patientId-djuplänk bevarar admin-, V11- och V12-kontraktet', () => {
  assert.match(ui, /url\.searchParams\.set\('view', 'customers'\)/);
  assert.match(ui, /\['v9', 'demo', 'embed', 'v11rail', 'v12workspace', 'flags', 'segment'\]/);
  assert.match(ui, /url\.searchParams\.set\('patientId', patientId\)/);
  assert.match(ui, /syncSelectedPatientDeepLink\(key\)/);
  assert.match(ui, /ccoCustomerPatient: id/);
  assert.match(ui, /rail\.querySelector\('\[data-v11-rail-shell="1"\]'\)/);
  assert.match(ui, /rail\.querySelector\('\[data-v12-workspace-shell="1"\]'\)/);
});
