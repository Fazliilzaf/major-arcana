'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const scriptPath = path.join(ROOT, 'scripts', 'verify-internalize-run-prod.js');
const {
  ALIAS_HEURISTIC_NOTE,
  buildScanDescriptor,
  classifyOverallStatus,
  evaluateAliasGap,
  isClientoPatientId,
  isCcoViewUrl,
  maskClientoPatientId,
  patientHasFileSignals,
  resolvePatientId,
  shouldScanPatient,
  summarizeAliasHeuristic,
} = require('../../scripts/verify-internalize-run-prod');

test('verify-internalize-run-prod script documents scan modes and direct node --json', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');
  assert.match(script, /scanMode: 'hasFiles'/);
  assert.match(script, /--scan-mode MODE/);
  assert.match(script, /använd node direkt, inte npm run/);
  assert.match(script, /known_alias_heuristic/);
  assert.match(script, /collectAssetStoreAliases\/heuristik/);
});

test('resolvePatientId prefers patientId over id', () => {
  assert.equal(resolvePatientId({ id: 'legacy', patientId: 'pm-1' }), 'pm-1');
  assert.equal(resolvePatientId({ id: 'legacy' }), 'legacy');
});

test('default scan mode is hasFiles and all mode scans everyone', () => {
  const hasFiles = buildScanDescriptor({ scanMode: 'hasFiles' });
  assert.equal(hasFiles.mode, 'hasFiles');
  assert.equal(hasFiles.limited, true);

  const all = buildScanDescriptor({ scanMode: 'all' });
  assert.equal(all.mode, 'all');
  assert.equal(all.limited, false);

  assert.equal(shouldScanPatient({ fileSummary: { totalFiles: 0 } }, 'hasFiles'), false);
  assert.equal(shouldScanPatient({ fileSummary: { totalFiles: 0 } }, 'all'), true);
  assert.equal(shouldScanPatient({ driveLinked: true }, 'hasFiles'), true);
});

test('evaluateAliasGap flags known alias-heuristic without import fail', () => {
  const gap = evaluateAliasGap({
    pmPatientId: 'pm-uuid',
    assetPatientId: 'cliento_abc1238274',
    clientoSourceId: null,
    clientoCanonical: null,
    discoveredViaAssetsApi: true,
    inBundle: true,
  });
  assert.equal(gap.classification, 'known_alias_heuristic');
  assert.equal(gap.heuristicDiscovery, true);
  assert.equal(gap.importFail, false);
  assert.equal(gap.discoveryPath, 'collectAssetStoreAliases/heuristik');
});

test('summarizeAliasHeuristic aggregates known pattern count', () => {
  const assets = [
    {
      assetId: 'a1',
      patientId: 'pm-1',
      assetPatientId: 'cliento_11118274',
      aliasGap: evaluateAliasGap({
        pmPatientId: 'pm-1',
        assetPatientId: 'cliento_11118274',
        discoveredViaAssetsApi: true,
        inBundle: true,
      }),
    },
  ];
  const summary = summarizeAliasHeuristic(assets);
  assert.equal(summary.count, 1);
  assert.equal(summary.knownPattern, true);
  assert.equal(summary.importFail, false);
  assert.equal(summary.note, ALIAS_HEURISTIC_NOTE);
  assert.equal(summary.assets[0].assetPatientId, 'cliento_...8274');
});

test('isCcoViewUrl rejects drive links', () => {
  assert.equal(isCcoViewUrl('/api/v1/cco/assets/x/download?inline=1'), true);
  assert.equal(isCcoViewUrl('https://drive.google.com/file/d/abc'), false);
});

test('classifyOverallStatus keeps run-level PASS with alias heuristic discovery', () => {
  const aliasHeuristic = { count: 10, knownPattern: true };
  assert.equal(
    classifyOverallStatus({
      runPass: true,
      discoveryPass: true,
      bundlePass: true,
      downloadPass: true,
      noDriveLinks: true,
      assetsFound: 10,
      expectedCount: 10,
      aliasHeuristic,
    }),
    'PASS'
  );
  assert.equal(
    classifyOverallStatus({
      runPass: true,
      discoveryPass: false,
      bundlePass: false,
      downloadPass: false,
      noDriveLinks: false,
      assetsFound: 9,
      expectedCount: 10,
      aliasHeuristic: { count: 0, knownPattern: false },
    }),
    'PARTIAL'
  );
});

test('isClientoPatientId and maskClientoPatientId', () => {
  assert.equal(isClientoPatientId('cliento_abc'), true);
  assert.equal(isClientoPatientId('pm-1'), false);
  assert.equal(maskClientoPatientId('cliento_1234567890ab'), 'cliento_...90ab');
});

test('patientHasFileSignals accepts common list-card signals', () => {
  assert.equal(patientHasFileSignals({ fileSummary: { totalFiles: 3 } }), true);
  assert.equal(patientHasFileSignals({ hasJournalHistory: true }), true);
  assert.equal(patientHasFileSignals({}), false);
});
