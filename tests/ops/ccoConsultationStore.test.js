const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildConsultationCaseReadout,
  normalizeSideEffectReview,
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

test('ORD-136: de tre F:en lagras som tre separata fält', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-tref-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const updated = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-3f',
      customerId: 'anna@example.com',
      expectations: 'Förväntar sig en tätare hårlinje.',
      hopes: 'Hoppas på ett naturligt resultat.',
      preconditions: 'Har tidigare gjort PRP utan komplikationer.',
    });

    assert.equal(updated.expectations, 'Förväntar sig en tätare hårlinje.');
    assert.equal(updated.hopes, 'Hoppas på ett naturligt resultat.');
    assert.equal(updated.preconditions, 'Har tidigare gjort PRP utan komplikationer.');
    // De tre får aldrig slås ihop — var och en är ett eget fält.
    assert.ok(!updated.notes.includes('Förväntar'), 'F:en får inte hamna i notes');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-136: presentationsval registreras och kan vara flera', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-pres-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const updated = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-pres',
      customerId: 'anna@example.com',
      presentations: ['krona_dhi', 'vikar_fue'],
    });

    assert.deepEqual(updated.presentations, ['krona_dhi', 'vikar_fue']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-136: biverkningsgenomgången kan inte markeras klar utan vem/när/version', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-biverkan-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const base = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-biverkan',
      customerId: 'anna@example.com',
    };

    // Ett kryss ("completed: true") utan de tre uppgifterna ska misslyckas.
    await assert.rejects(
      () => store.recordSideEffectReview({ ...base, completed: true }),
      /vem, när|tidsstämpel|tjänstespec-version/
    );
    await assert.rejects(
      () => store.recordSideEffectReview({ ...base, sideEffectReview: { completed: true } }),
      /vem, när|tidsstämpel|tjänstespec-version/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-136: fullständig biverkningsgenomgång registrerar vem, när och version', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-consultation-biverkan-ok-'));
  try {
    const store = await createCcoConsultationStore({
      filePath: path.join(tempDir, 'consultations.json'),
    });

    const updated = await store.recordSideEffectReview({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-biverkan-ok',
      customerId: 'anna@example.com',
      reviewedBy: 'dr.andersson',
      reviewedAt: '2026-08-28T10:15:00.000Z',
      serviceSpecVersion: '1.4.0',
    });

    assert.deepEqual(updated.sideEffectReview, {
      reviewedBy: 'dr.andersson',
      reviewedAt: '2026-08-28T10:15:00.000Z',
      serviceSpecVersion: '1.4.0',
    });
    assert.equal(updated.events.at(-1).type, 'side_effect_review_recorded');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('normalizeSideEffectReview kräver alla tre uppgifter', () => {
  assert.equal(normalizeSideEffectReview({ completed: true }), null);
  assert.equal(normalizeSideEffectReview({ reviewedBy: 'x', reviewedAt: 'y' }), null);
  assert.deepEqual(normalizeSideEffectReview({ reviewedBy: 'x', reviewedAt: 'y', serviceSpecVersion: 'z' }), {
    reviewedBy: 'x',
    reviewedAt: 'y',
    serviceSpecVersion: 'z',
  });
});
