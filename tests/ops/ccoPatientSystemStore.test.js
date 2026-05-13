const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  PATIENT_SYSTEM_MODULES,
  buildPatient360Readout,
  createCcoPatientSystemStore,
  deriveOrchestratedAttentionModule,
} = require('../../src/ops/ccoPatientSystemStore');

test('ccoPatientSystemStore skapar ett idempotent Patient 360-kort från BOOK Systemets CCO', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-patient-system-'));
  try {
    const store = await createCcoPatientSystemStore({
      filePath: path.join(tempDir, 'patients.json'),
    });

    const base = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      customerEmail: 'Alisina@Example.com',
      customerName: 'Alisina Ahmadi',
      phone: '0725017715',
      pipeline: {
        status: 'active',
        nextStep: 'Validera behandling och föreslå tider',
        nextContactAt: '2026-05-11T12:00:00.000Z',
      },
      modules: {
        booking: {
          status: 'needs_action',
          nextAction: 'Välj 1-3 kandidat-tider',
          confidence: 0.82,
        },
        consultation: {
          status: 'needs_validation',
          nextAction: 'Verifiera konsultationsbehov innan behandlingsråd',
          confidence: 0.62,
        },
      },
    };

    const first = await store.ensurePatient(base);
    const second = await store.ensurePatient(base);
    assert.equal(first.patientId, second.patientId);
    assert.equal(second.identity.email, 'alisina@example.com');
    assert.equal(second.identity.name, 'Alisina Ahmadi');
    assert.equal(
      PATIENT_SYSTEM_MODULES.every((moduleId) => second.modules[moduleId]),
      true
    );
    assert.equal(second.modules.clinical.validationRequired, true);
    assert.equal(second.patient360.where, 'Konsultation');
    assert.equal(second.patient360.validation, 'Kräver mänsklig validering');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoPatientSystemStore samlar bokning, konsultation och eftervård i samma tidslinje', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-patient-timeline-'));
  try {
    const store = await createCcoPatientSystemStore({
      filePath: path.join(tempDir, 'patients.json'),
    });
    const base = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      customerEmail: 'rahraf0809@gmail.com',
      customerName: 'Alisina Ahmadi',
    };

    await store.ensurePatient(base);
    await store.addTimelineEvent({
      ...base,
      module: 'booking',
      type: 'candidate_slots_selected',
      label: 'Kandidat-tider valda',
      occurredAt: '2026-05-11T09:00:00.000Z',
      confidence: 0.8,
    });
    await store.addTimelineEvent({
      ...base,
      module: 'consultation',
      type: 'clinical_validation_needed',
      label: 'Konsultationsbehov kräver validering',
      occurredAt: '2026-05-11T09:05:00.000Z',
      confidence: 0.55,
    });
    const patient = await store.addTimelineEvent({
      ...base,
      module: 'aftercare',
      type: 'followup_planned',
      label: 'Eftervårdsuppföljning planerad',
      occurredAt: '2026-05-11T09:10:00.000Z',
      confidence: 0.9,
    });

    assert.deepEqual(
      patient.timeline.map((event) => event.module),
      ['booking', 'consultation', 'aftercare']
    );
    assert.equal(patient.timeline[1].validationState, 'needs_human_validation');
    assert.equal(patient.patient360.what, 'Öppna nästa tydliga steg');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoPatientSystemStore bevarar tidigare modulstatus vid partial workspace-berikning', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-patient-partial-'));
  try {
    const store = await createCcoPatientSystemStore({
      filePath: path.join(tempDir, 'patients.json'),
    });
    const base = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      customerEmail: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      modules: {
        booking: {
          status: 'needs_action',
          nextAction: 'Välj 1-3 kandidat-tider',
          confidence: 0.82,
        },
      },
    };

    await store.upsertPatient(base);
    const merged = await store.upsertPatient({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      customerEmail: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      modules: {
        documents: {
          status: 'needs_validation',
          nextAction: 'Kontrollera samtycke innan nästa steg',
          confidence: 0.68,
        },
      },
    });

    assert.equal(merged.modules.booking.status, 'needs_action');
    assert.equal(merged.modules.documents.status, 'needs_validation');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildPatient360Readout prioriterar vad, var, när och mänsklig validering', () => {
  const readout = buildPatient360Readout({
    updatedAt: '2026-05-11T10:00:00.000Z',
    pipeline: {
      nextStep: 'Kontakta kunden',
      nextContactAt: '2026-05-11T16:00:00.000Z',
    },
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'needs_action',
        nextAction: 'Erbjud tider',
        confidence: 0.88,
      },
      documents: {
        moduleId: 'documents',
        label: 'Dokument & samtycke',
        status: 'needs_validation',
        nextAction: 'Kontrollera samtycke innan nästa steg',
        confidence: 0.68,
        validationRequired: true,
      },
    },
    timeline: [],
  });

  assert.equal(readout.what, 'Kontrollera samtycke innan nästa steg');
  assert.equal(readout.where, 'Dokument & samtycke');
  assert.equal(readout.when, '2026-05-11T16:00:00.000Z');
  assert.equal(readout.validation, 'Kräver mänsklig validering');
});

test('deriveOrchestratedAttentionModule prioriterar blockerande dokument före andra domäner', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      documents: {
        moduleId: 'documents',
        label: 'Dokument & samtycke',
        status: 'blocked',
        nextAction: 'Kontrollera samtycke och dokumentunderlag',
      },
      operation: {
        moduleId: 'operation',
        label: 'Operation',
        status: 'blocked',
        nextAction: 'Stoppa operationsflödet och lös blockerande klarering',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'documents');
});

test('deriveOrchestratedAttentionModule låter operation äga fokus när flera delsignaler är aktiva', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      operation: {
        moduleId: 'operation',
        label: 'Operation',
        status: 'scheduled',
        nextAction: 'Bekräfta operationsförberedelser och tider',
      },
      clinical: {
        moduleId: 'clinical',
        label: 'Kliniskt underlag',
        status: 'needs_validation',
        nextAction: 'Verifiera operationsberedskap med ansvarig kliniker',
      },
      aftercare: {
        moduleId: 'aftercare',
        label: 'Eftervård',
        status: 'scheduled',
        nextAction: 'Förbered eftervårdsplan inför operationen',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'operation');
});

test('deriveOrchestratedAttentionModule låter eftervård äga fokus efter bekräftad bokning', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'scheduled',
        nextAction: 'Bokningen är redan bekräftad i CCO',
        metadata: {
          bookingStatus: 'confirmed_external',
          postConfirmationMode: 'ready_to_close',
        },
      },
      aftercare: {
        moduleId: 'aftercare',
        label: 'Eftervård',
        status: 'ready',
        nextAction: 'Säkra eftervård eller slutlogg efter bekräftelse',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'aftercare');
});

test('deriveOrchestratedAttentionModule låter eftervård äga fokus före stödjande teamuppgift', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      aftercare: {
        moduleId: 'aftercare',
        label: 'Eftervård',
        status: 'scheduled',
        nextAction: 'Genomför planerad uppföljning och dokumentera utfallet',
      },
      tasks: {
        moduleId: 'tasks',
        label: 'Teamuppgifter',
        status: 'needs_action',
        nextAction: 'Håll nästa ägare och intern anteckning tydlig',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'aftercare');
});

test('deriveOrchestratedAttentionModule låter konsultation äga fokus före stödjande teamuppgift', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'ready',
        nextAction: 'Verifiera konsultationsbehov innan råd',
      },
      tasks: {
        moduleId: 'tasks',
        label: 'Teamuppgifter',
        status: 'needs_action',
        nextAction: 'Håll nästa ägare och intern anteckning tydlig',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'consultation');
});

test('deriveOrchestratedAttentionModule låter commercial äga fokus före stödjande teamuppgift', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
      tasks: {
        moduleId: 'tasks',
        label: 'Teamuppgifter',
        status: 'needs_action',
        nextAction: 'Håll nästa ägare och intern anteckning tydlig',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'commercial');
});

test('deriveOrchestratedAttentionModule låter eftervård vinna över commercial efter avslutad operation', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      operation: {
        moduleId: 'operation',
        label: 'Operation',
        status: 'complete',
        nextAction: 'Operationen är klar',
      },
      aftercare: {
        moduleId: 'aftercare',
        label: 'Eftervård',
        status: 'needs_action',
        nextAction: 'Öppna eftervårdsärendet och välj nästa steg',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'aftercare');
});

test('deriveOrchestratedAttentionModule låter klinisk validering vinna över konsultation, booking och commercial', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'scheduled',
        nextAction: 'Förbered planerad konsultation',
      },
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundsvar på föreslagna tider',
      },
      clinical: {
        moduleId: 'clinical',
        label: 'Kliniskt underlag',
        status: 'needs_validation',
        nextAction: 'Verifiera kliniskt underlag före nästa steg',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'clinical');
});

test('deriveOrchestratedAttentionModule låter konsultation vinna över booking och commercial i vänteläge', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'scheduled',
        nextAction: 'Förbered planerad konsultation',
      },
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundsvar på föreslagna tider',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'consultation');
});

test('deriveOrchestratedAttentionModule låter booking vinna över commercial när bokningen kräver validering', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'needs_validation',
        nextAction: 'Validera valda kandidat-tider',
      },
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'ready',
        nextAction: 'Verifiera konsultationsbehov innan råd',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'booking');
});

test('deriveOrchestratedAttentionModule låter commercial vinna över bokning och konsultation när inget blockerar mer', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'scheduled',
        nextAction: 'Markera när extern bokning är helt bekräftad',
      },
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'ready',
        nextAction: 'Verifiera konsultationsbehov innan råd',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'commercial');
});

test('deriveOrchestratedAttentionModule låter blockerande dokument vinna över booking, konsultation och commercial', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundsvar på föreslagna tider',
      },
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'ready',
        nextAction: 'Verifiera konsultationsbehov innan råd',
      },
      documents: {
        moduleId: 'documents',
        label: 'Dokument & samtycke',
        status: 'blocked',
        nextAction: 'Kontrollera samtycke och dokumentunderlag',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'documents');
});

test('deriveOrchestratedAttentionModule låter blockerande dokument vinna över booking, konsultation och commercial', () => {
  const attentionModule = deriveOrchestratedAttentionModule({
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundsvar på föreslagna tider',
      },
      consultation: {
        moduleId: 'consultation',
        label: 'Konsultation',
        status: 'ready',
        nextAction: 'Verifiera konsultationsbehov innan råd',
      },
      documents: {
        moduleId: 'documents',
        label: 'Dokument & samtycke',
        status: 'blocked',
        nextAction: 'Kontrollera samtycke och dokumentunderlag',
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'waiting_customer',
        nextAction: 'Invänta kundens besked om offert eller prisupplägg',
      },
    },
  });

  assert.equal(attentionModule.moduleId, 'documents');
});

test('buildPatient360Readout orkestrerar kommersiell blockerare före bokningsredo flöde', () => {
  const readout = buildPatient360Readout({
    updatedAt: '2026-05-11T10:00:00.000Z',
    pipeline: {
      nextStep: 'Öppna nästa tydliga steg',
      nextContactAt: '2026-05-11T16:00:00.000Z',
    },
    modules: {
      booking: {
        moduleId: 'booking',
        label: 'Bokning',
        status: 'ready',
        nextAction: 'Bokningsflödet kan fortsätta',
        confidence: 0.82,
      },
      commercial: {
        moduleId: 'commercial',
        label: 'Offert & betalning',
        status: 'blocked',
        nextAction: 'Lös deposition eller betalningsblockerare',
        confidence: 0.84,
      },
    },
    timeline: [],
  });

  assert.equal(readout.where, 'Offert & betalning');
  assert.equal(readout.what, 'Lös deposition eller betalningsblockerare');
});
