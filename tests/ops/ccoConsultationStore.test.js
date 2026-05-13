const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoConsultationStore } = require('../../src/ops/ccoConsultationStore');

test('ccoConsultationStore skapar och uppdaterar konsultationsärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-store-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      consultationStatus: 'needs_review',
      consultationType: 'Fysisk konsultation',
    });
    const second = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      clinicalStatus: 'needs_validation',
      requiredActions: ['Verifiera kliniskt underlag'],
    });

    assert.equal(first.consultationCaseId, second.consultationCaseId);
    assert.equal(second.consultationStatus, 'needs_review');
    assert.equal(second.clinicalStatus, 'needs_validation');
    assert.deepEqual(second.requiredActions, ['Verifiera kliniskt underlag']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoConsultationStore registrerar dokumentkontroll som egen händelse', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-docs-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const updated = await store.recordDocumentCheck({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-2',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      documentStatus: 'needs_validation',
      consentStatus: 'required',
      notes: 'GDPR-samtycke behöver bekräftas innan konsultation.',
    });

    assert.equal(updated.documentStatus, 'needs_validation');
    assert.equal(updated.consentStatus, 'required');
    assert.equal(updated.events.at(-1).type, 'document_check_recorded');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
