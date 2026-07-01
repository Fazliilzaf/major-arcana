'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  resolvePilotConfig,
  isPilotPatient,
  filterDrivePayloadForPilot,
  pilotSummary,
  DEFAULT_MANIFEST,
} = require('../../src/ops/ccoDriveHistoryUiPilot');

test('resolvePilotConfig loads Jonas from committed manifest when enabled', () => {
  const cfg = resolvePilotConfig({
    enableDriveHistoryUiPilot: true,
    driveHistoryUiPilotManifestPath: DEFAULT_MANIFEST,
  });
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.patientIds.includes('a6a55cae-8c12-4d7d-83da-adbcdd368b00'));
  assert.equal(cfg.patients[0]?.displayName, 'Jonas Lundvall');
});

test('env patientIds override manifest', () => {
  const cfg = resolvePilotConfig({
    enableDriveHistoryUiPilot: true,
    driveHistoryUiPilotPatientIds: ['override-id'],
    driveHistoryUiPilotManifestPath: DEFAULT_MANIFEST,
  });
  assert.deepEqual(cfg.patientIds, ['override-id']);
});

test('filterDrivePayloadForPilot strips non-pilot patients when active', () => {
  const pilotConfig = {
    enabled: true,
    patientIds: ['jonas-id'],
    patients: [],
  };
  const kept = filterDrivePayloadForPilot({
    patientId: 'jonas-id',
    driveFiles: [{ id: 'f1' }],
    occasionTimeline: [{ id: 'o1' }],
    pilotConfig,
  });
  assert.equal(kept.gated, false);
  assert.equal(kept.driveFiles.length, 1);

  const stripped = filterDrivePayloadForPilot({
    patientId: 'other-id',
    driveFiles: [{ id: 'f1' }],
    occasionTimeline: [{ id: 'o1' }],
    pilotConfig,
  });
  assert.equal(stripped.gated, true);
  assert.deepEqual(stripped.driveFiles, []);
  assert.deepEqual(stripped.occasionTimeline, []);
});

test('inactive pilot passes all patients through', () => {
  assert.equal(isPilotPatient('any-id', { enabled: false, patientIds: ['x'] }), true);
  const result = filterDrivePayloadForPilot({
    patientId: 'any-id',
    driveFiles: [{ id: 'f1' }],
    occasionTimeline: [{ id: 'o1' }],
    pilotConfig: { enabled: false, patientIds: ['x'] },
  });
  assert.equal(result.gated, false);
  assert.equal(result.driveFiles.length, 1);
});

test('pilotSummary hides ids when inactive', () => {
  const summary = pilotSummary(resolvePilotConfig({ enableDriveHistoryUiPilot: false }));
  assert.equal(summary.active, false);
  assert.deepEqual(summary.patientIds, []);
});
