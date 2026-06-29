const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoOperationStore,
  buildOperationCaseReadout,
} = require('../../src/ops/ccoOperationStore');

test('cco operation store skapar och uppdaterar operationsärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-operation-store-'));
  const filePath = path.join(tempDir, 'cco-operations.json');

  try {
    const store = await createCcoOperationStore({ filePath });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      procedureType: 'Hårtransplantation',
    });

    const second = await store.upsertCase({
      ...first,
      operationStatus: 'planned',
      clearanceStatus: 'blocked',
      requiredActions: ['Verifiera operationsberedskap med ansvarig kliniker'],
    });

    assert.equal(second.operationCaseId, first.operationCaseId);
    assert.equal(second.operationStatus, 'planned');
    assert.equal(second.clearanceStatus, 'blocked');
    assert.deepEqual(second.requiredActions, [
      'Verifiera operationsberedskap med ansvarig kliniker',
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('operation readout prioriterar blockerad klarering och bygger operatorlage', () => {
  const readout = buildOperationCaseReadout({
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-op-1',
    customerId: 'anna@example.com',
    customerName: 'Anna',
    procedureType: 'Hårtransplantation',
    operationStatus: 'planned',
    clearanceStatus: 'blocked',
    outcomeStatus: 'unknown',
    scheduledForIso: '2026-06-29T08:00:00.000Z',
    doctorName: 'Dr. Eriksson',
    theatreName: 'Rum 2',
  });

  assert.equal(readout.phase, 'clearance_blocked');
  assert.equal(readout.queueBucket, 'critical');
  assert.equal(readout.waitingOn, 'clinic');
  assert.match(readout.nextStep, /klarering/i);
  assert.equal(readout.operatorActions[0].action, 'resolve_operation_clearance');
  assert.equal(readout.operatorActions[0].type, 'surface_action');
  assert.equal(readout.operatorActions[0].surfaceAction, 'operation_open');
  assert.equal(readout.operatorActions[1].surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1].noteDestination, 'medicinsk');
});

test('operation readout gor avslutad operation till eftervards-handoff', () => {
  const readout = buildOperationCaseReadout({
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-op-2',
    customerId: 'anna@example.com',
    customerName: 'Anna',
    procedureType: 'Hårtransplantation',
    operationStatus: 'complete',
    clearanceStatus: 'cleared',
    outcomeStatus: 'stable',
    doctorName: 'Dr. Eriksson',
    theatreName: 'Rum 2',
  });

  assert.equal(readout.phase, 'closed');
  assert.equal(readout.queueBucket, 'closed');
  assert.equal(readout.waitingOn, 'aftercare');
  assert.match(readout.nextStep, /eftervård/i);
  assert.equal(readout.operatorActions[0].key, 'review_aftercare_handoff');
  assert.equal(readout.operatorActions[0].surfaceAction, 'aftercare_open');
});

test('operation readout gor planerad operation till tydlig handoff och tid-delning', () => {
  const readout = buildOperationCaseReadout({
    tenantId: 'tenant-a',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-op-3',
    customerId: 'anna@example.com',
    customerName: 'Anna',
    procedureType: 'Hårtransplantation',
    operationStatus: 'ready',
    clearanceStatus: 'cleared',
    outcomeStatus: 'unknown',
    scheduledForIso: '2030-06-29T08:00:00.000Z',
    doctorName: 'Dr. Eriksson',
    theatreName: 'Rum 2',
  });

  assert.equal(readout.phase, 'ready_for_operation');
  assert.equal(readout.operatorActions[0].key, 'confirm_operation_handoff');
  assert.equal(readout.operatorActions[0].surfaceAction, 'operation_open');
  assert.equal(readout.operatorActions[0].label, 'Lås handoff');
  assert.equal(readout.operatorActions[1].key, 'share_operation_time');
  assert.equal(readout.operatorActions[1].surfaceAction, 'schedule_open');
});
