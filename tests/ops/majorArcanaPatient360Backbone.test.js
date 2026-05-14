const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..', '..');
const appSource = fs.readFileSync(path.join(rootDir, 'public/major-arcana-preview/app.js'), 'utf8');
const cssSource = fs.readFileSync(
  path.join(rootDir, 'public/major-arcana-preview/styles.css'),
  'utf8'
);

test('Major Arcana kundpanelen har Patient 360-ryggrad från BOOK Systemets CCO', () => {
  assert.match(
    appSource,
    /function buildPreviewPatient360Backbone\(thread, focusReadState = \{\}\)/
  );
  assert.match(appSource, /function buildPreviewPatient360Journey\(backbone\)/);
  assert.match(
    appSource,
    /function getJourneyPrimaryActionConfig\(thread, focusReadState = \{\}\)/
  );
  assert.match(
    appSource,
    /function renderPreviewPatient360Backbone\(thread, focusReadState = \{\}\)/
  );
  assert.match(
    appSource,
    /renderRuntimeCustomerPanel\(selectedFocusThread, focusReadState\);\s*renderPreviewPatient360Backbone\(selectedFocusThread, focusReadState\);/
  );
  assert.match(appSource, /Patientresa/);
  assert.match(appSource, /Nästa domänsteg/);
  assert.match(appSource, /Kund-\/patientkort/);
  assert.match(appSource, /Samlad tidslinje/);
  assert.match(appSource, /Bokning/);
  assert.match(appSource, /Konsultation/);
  assert.match(appSource, /Eftervård/);
  assert.match(appSource, /data-patient360-module=/);
  assert.match(appSource, /Vad/);
  assert.match(appSource, /Var/);
  assert.match(appSource, /När/);
  assert.match(appSource, /Validering/);
});

test('Patient 360-renderern deklarerar domänsurfaces innan operationskortet byggs', () => {
  const operationSurfaceDecl = appSource.indexOf(
    'const operationSurface = getPreviewOperationWorkspaceSurface(thread, focusReadState);'
  );
  const consultationSurfaceDecl = appSource.indexOf(
    'const consultationSurface = getPreviewConsultationWorkspaceSurface(thread, focusReadState);'
  );
  const commercialSurfaceDecl = appSource.indexOf(
    'const commercialSurface = getPreviewCommercialWorkspaceSurface(thread, focusReadState);'
  );
  const operationCardMarkup = appSource.indexOf('const operationCardMarkup = operationSurface');

  assert.notEqual(operationSurfaceDecl, -1);
  assert.notEqual(consultationSurfaceDecl, -1);
  assert.notEqual(commercialSurfaceDecl, -1);
  assert.notEqual(operationCardMarkup, -1);
  assert.ok(
    operationSurfaceDecl < operationCardMarkup &&
      consultationSurfaceDecl < operationCardMarkup &&
      commercialSurfaceDecl < operationCardMarkup,
    'Domänsurfaces måste deklareras innan Patient 360-korten läser dem, annars kraschar previewn och faller tillbaka till ett nästan ostylat shell.'
  );
});

test('Patient 360-yta behåller kompakt mailklientkänsla och använder statusfärg utan tung panel', () => {
  assert.match(
    cssSource,
    /\.patient360-compact\s*\{[\s\S]*margin-top:\s*12px;[\s\S]*padding:\s*10px 12px;[\s\S]*border-radius:\s*12px;[\s\S]*background:[\s\S]*linear-gradient/
  );
  assert.match(
    cssSource,
    /\.patient360-journey-row\s*\{[\s\S]*display:\s*grid;[\s\S]*border-bottom:/
  );
  assert.match(cssSource, /\.patient360-journey-chip\[data-state="active"\]\s*\{[\s\S]*#9f5f78/);
  assert.match(cssSource, /\.patient360-journey-chip\[data-state="next"\]\s*\{[\s\S]*#4f73b3/);
  assert.match(
    cssSource,
    /\.patient360-attention-row,\s*\.patient360-module-row\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*\}/
  );
  assert.match(
    cssSource,
    /\.patient360-module-chip\[data-status="needs_validation"\]\s*\{[\s\S]*#9f5f78/
  );
  assert.match(
    cssSource,
    /\.patient360-module-chip\[data-status="needs_action"\]\s*\{[\s\S]*#4f73b3/
  );
  assert.match(
    cssSource,
    /\.patient360-module-chip\[data-status="inactive"\]\s*\{[\s\S]*opacity:\s*0\.64;/
  );
});
