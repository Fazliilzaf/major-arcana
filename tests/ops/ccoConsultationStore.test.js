const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildConsultationCaseReadout,
  createCcoConsultationStore,
} = require('../../src/ops/ccoConsultationStore');

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

test('buildConsultationCaseReadout prioriterar dokument och samtycke som blockerande konsultationsyta', () => {
  const readout = buildConsultationCaseReadout({
    consultationType: 'Fysisk konsultation',
    consultationStatus: 'ready',
    requestedTreatment: 'PRP håravfall',
    clinicalStatus: 'needs_validation',
    documentStatus: 'needs_validation',
    consentStatus: 'required',
    requiredActions: ['Kontrollera samtycke och dokumentunderlag'],
    notes: 'Dokumentkedjan måste vara klar före konsultation.',
  });

  assert.equal(readout.phase, 'documents_blocked');
  assert.equal(readout.queueBucket, 'critical');
  assert.equal(readout.waitingOn, 'patient');
  assert.match(readout.nextStep, /samtycke|dokument/i);
  assert.equal(readout.operatorActions[0].action, 'resolve_consultation_documents');
  assert.equal(readout.operatorActions[0].type, 'surface_action');
  assert.equal(readout.operatorActions[0].surfaceAction, 'consultation_open');
  assert.equal(readout.operatorActions[1].label, 'Samtyckesnot');
  assert.equal(readout.operatorActions[1].surfaceAction, 'note_open');
  assert.equal(readout.operatorActions[1].noteTemplate, 'samtycke');
});

test('buildConsultationCaseReadout lämnar konsultation vidare till booking när den är klar', () => {
  const readout = buildConsultationCaseReadout({
    consultationType: 'Videokonsultation',
    consultationStatus: 'complete',
    requestedTreatment: 'Hårtransplantation',
    clinicalStatus: 'validated',
    documentStatus: 'validated',
    consentStatus: 'confirmed',
    notes: 'Konsultationen är klar och behandlingsplanen kan fortsätta.',
  });

  assert.equal(readout.phase, 'closed');
  assert.equal(readout.queueBucket, 'closed');
  assert.equal(readout.waitingOn, 'booking');
  assert.match(readout.nextStep, /bokning|behandlingsplan/i);
  assert.match(readout.handoffCopy, /bokning|behandlingsplan/i);
});

test('buildConsultationCaseReadout lyfter klinisk validering med konsultations- och note-vägar', () => {
  const readout = buildConsultationCaseReadout({
    consultationStatus: 'needs_review',
    clinicalStatus: 'needs_validation',
    documentStatus: 'validated',
    consentStatus: 'confirmed',
  });

  assert.equal(readout.phase, 'clinical_validation');
  assert.equal(readout.operatorActions[0].surfaceAction, 'consultation_open');
  assert.equal(readout.operatorActions[1].surfaceAction, 'note_open');
});

test('buildConsultationCaseReadout skickar redo konsultation direkt till planering och bokningshandoff', () => {
  const readout = buildConsultationCaseReadout({
    consultationStatus: 'ready',
    clinicalStatus: 'validated',
    documentStatus: 'validated',
    consentStatus: 'confirmed',
    requiredActions: ['Boka konsultation denna vecka'],
  });

  assert.equal(readout.phase, 'ready_for_consultation');
  assert.equal(readout.operatorActions[0].label, 'Planera konsultation');
  assert.equal(readout.operatorActions[0].surfaceAction, 'schedule_open');
  assert.equal(readout.operatorActions[1].label, 'Bokningshandoff');
  assert.equal(readout.operatorActions[1].surfaceAction, 'booking_surface');
});
