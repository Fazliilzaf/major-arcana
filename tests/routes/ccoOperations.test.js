const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoOperationsRouter } = require('../../src/routes/ccoOperations');
const { createCcoOperationStore } = require('../../src/ops/ccoOperationStore');
const { createCcoPatientSystemStore } = require('../../src/ops/ccoPatientSystemStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-operations-route-'));
  const operationStore = await createCcoOperationStore({
    filePath: path.join(tempDir, 'operations.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoOperationsRouter({
      operationStore,
      patientSystemStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
      },
    })
  );
  return { app, tempDir };
}

test('cco operations route uppdaterar operation i samma Patient 360-kort', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-operation-1&customerId=anna%40example.com&customerName=Anna';
      const caseResponse = await fetch(`${baseUrl}/cco-operations/case?${qs}`);
      assert.equal(caseResponse.status, 200);
      const casePayload = await caseResponse.json();
      assert.equal(casePayload.operationCase.operationStatus, 'needs_review');
      assert.equal(casePayload.operationReadout.phase, 'review');

      const updateResponse = await fetch(`${baseUrl}/cco-operations/case?${qs}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          procedureType: 'Hårtransplantation',
          operationStatus: 'planned',
          clearanceStatus: 'blocked',
          outcomeStatus: 'unknown',
          scheduledForIso: '2026-03-29T08:00:00.000Z',
          doctorName: 'Dr. Eriksson',
          theatreName: 'Rum 2',
          notes: 'Klinisk klarering behöver lösas före ingreppet.',
          requiredActions: ['Verifiera operationsberedskap med ansvarig kliniker'],
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.operationCase.operationStatus, 'planned');
      assert.equal(updatePayload.operationReadout.phase, 'clearance_blocked');
      assert.equal(updatePayload.operationReadout.queueBucket, 'critical');
      assert.equal(updatePayload.patient360.modules.operation.status, 'blocked');
      assert.equal(updatePayload.patient360.modules.clinical.status, 'needs_validation');
      assert.equal(updatePayload.patient360.attention.where, 'Operation');
      assert.equal(
        updatePayload.patient360.attention.what,
        'Stoppa operationsflödet och lös blockerande klarering'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
