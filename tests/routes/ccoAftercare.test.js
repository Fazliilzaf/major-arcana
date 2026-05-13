const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoAftercareRouter } = require('../../src/routes/ccoAftercare');
const { createCcoAftercareStore } = require('../../src/ops/ccoAftercareStore');
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-aftercare-route-'));
  const aftercareStore = await createCcoAftercareStore({
    filePath: path.join(tempDir, 'aftercare.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoAftercareRouter({
      aftercareStore,
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

test('cco aftercare route uppdaterar eftervård i samma Patient 360-kort', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-aftercare-1&customerId=anna%40example.com&customerName=Anna';
      const caseResponse = await fetch(`${baseUrl}/cco-aftercare/case?${qs}`);
      assert.equal(caseResponse.status, 200);
      const casePayload = await caseResponse.json();
      assert.equal(casePayload.aftercareCase.aftercareStatus, 'needs_review');

      const updateResponse = await fetch(`${baseUrl}/cco-aftercare/case?${qs}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: 'PRP uppföljning',
          aftercareStatus: 'scheduled',
          contactStatus: 'confirmed',
          outcomeStatus: 'needs_attention',
          scheduledForIso: '2026-03-27T10:30:00.000Z',
          doctorName: 'Dr. Eriksson',
          notes: 'Kunden beskriver ökad känslighet efter behandling.',
          requiredActions: ['Verifiera eftervårdsutfall med ansvarig kliniker'],
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.aftercareCase.aftercareStatus, 'scheduled');
      assert.equal(updatePayload.patient360.modules.aftercare.status, 'blocked');
      assert.equal(updatePayload.patient360.modules.clinical.status, 'needs_validation');
      assert.equal(
        updatePayload.patient360.attention.what,
        'Eskalera eftervårdsutfall och boka nästa åtgärd'
      );
      assert.equal(updatePayload.patient360.attention.where, 'Eftervård');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
