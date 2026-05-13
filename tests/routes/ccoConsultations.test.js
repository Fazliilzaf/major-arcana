const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConsultationsRouter } = require('../../src/routes/ccoConsultations');
const { createCcoConsultationStore } = require('../../src/ops/ccoConsultationStore');
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultations-route-'));
  const consultationStore = await createCcoConsultationStore({
    filePath: path.join(tempDir, 'consultations.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConsultationsRouter({
      consultationStore,
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

test('cco consultations route uppdaterar konsultation och dokument till samma Patient 360-kort', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-consult-1&customerId=anna%40example.com&customerName=Anna';
      const caseResponse = await fetch(`${baseUrl}/cco-consultations/case?${qs}`);
      assert.equal(caseResponse.status, 200);
      const casePayload = await caseResponse.json();
      assert.equal(casePayload.consultationCase.consultationStatus, 'needs_review');

      const updateResponse = await fetch(`${baseUrl}/cco-consultations/case?${qs}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          consultationType: 'Fysisk konsultation',
          requestedTreatment: 'PRP håravfall',
          consultationStatus: 'ready',
          clinicalStatus: 'needs_validation',
          notes: 'Kunden behöver klinisk kontroll före råd.',
          requiredActions: ['Verifiera kliniskt underlag'],
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.consultationCase.consultationStatus, 'ready');
      assert.equal(updatePayload.patient360.modules.consultation.status, 'ready');
      assert.equal(updatePayload.patient360.modules.clinical.status, 'needs_validation');

      const documentResponse = await fetch(`${baseUrl}/cco-consultations/document-check?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentStatus: 'needs_validation',
          consentStatus: 'required',
          detail: 'GDPR-samtycke saknas innan konsultation.',
        }),
      });
      assert.equal(documentResponse.status, 200);
      const documentPayload = await documentResponse.json();
      assert.equal(documentPayload.consultationCase.documentStatus, 'needs_validation');
      assert.equal(documentPayload.patient360.modules.documents.status, 'blocked');
      assert.equal(
        documentPayload.patient360.attention.what,
        'Kontrollera samtycke och dokumentunderlag'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
