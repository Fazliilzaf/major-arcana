const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoWorkspaceRouter } = require('../../src/routes/ccoWorkspace');
const { createCcoNoteStore } = require('../../src/ops/ccoNoteStore');
const { createCcoFollowUpStore } = require('../../src/ops/ccoFollowUpStore');
const { createCcoAftercareStore } = require('../../src/ops/ccoAftercareStore');
const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');
const { createCcoConsultationStore } = require('../../src/ops/ccoConsultationStore');
const { createCcoOperationStore } = require('../../src/ops/ccoOperationStore');
const { createCcoCommercialStore } = require('../../src/ops/ccoCommercialStore');
const { createCcoPatientSystemStore } = require('../../src/ops/ccoPatientSystemStore');
const { createCcoWorkspacePrefsStore } = require('../../src/ops/ccoWorkspacePrefsStore');

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

async function createRouterFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-route-'));
  const noteStore = await createCcoNoteStore({
    filePath: path.join(tempDir, 'notes.json'),
  });
  const followUpStore = await createCcoFollowUpStore({
    filePath: path.join(tempDir, 'followups.json'),
  });
  const aftercareStore = await createCcoAftercareStore({
    filePath: path.join(tempDir, 'aftercare.json'),
  });
  const operationStore = await createCcoOperationStore({
    filePath: path.join(tempDir, 'operations.json'),
  });
  const commercialStore = await createCcoCommercialStore({
    filePath: path.join(tempDir, 'commercial.json'),
  });
  const bookingStore = await createCcoBookingStore({
    filePath: path.join(tempDir, 'bookings.json'),
  });
  const consultationStore = await createCcoConsultationStore({
    filePath: path.join(tempDir, 'consultations.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const workspacePrefsStore = await createCcoWorkspacePrefsStore({
    filePath: path.join(tempDir, 'prefs.json'),
  });
  const auditEvents = [];

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoWorkspaceRouter({
      noteStore,
      followUpStore,
      aftercareStore,
      operationStore,
      commercialStore,
      bookingStore,
      consultationStore,
      patientSystemStore,
      workspacePrefsStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
      },
    })
  );

  return {
    app,
    tempDir,
    auditEvents,
    bookingStore,
    consultationStore,
    aftercareStore,
    operationStore,
    commercialStore,
  };
}

test('cco workspace router sparar anteckningar och läser tillbaka dem i bootstrap', async () => {
  const fixture = await createRouterFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const saveResponse = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-test-1',
          customerId: 'anna.karlsson@email.com',
          customerName: 'Anna Karlsson',
          destinationKey: 'konversation',
          text: 'Sparad anteckning från testet. Behöver medicinsk kontroll och GDPR-samtycke före ny tid.',
          tags: ['test', 'ombokning', 'medicinsk-koll', 'gdpr'],
          priority: 'high',
          visibility: 'team',
          templateKey: 'ombokning',
        }),
      });

      assert.equal(saveResponse.status, 200);
      const savePayload = await saveResponse.json();
      assert.match(savePayload.note.text, /medicinsk kontroll/);
      assert.equal(savePayload.patient360.modules.clinical.status, 'needs_validation');
      assert.equal(savePayload.patient360.modules.documents.status, 'needs_validation');

      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-test-1&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();

      assert.equal(
        bootstrapPayload.noteDefinitions.konversation.text,
        'Sparad anteckning från testet. Behöver medicinsk kontroll och GDPR-samtycke före ny tid.'
      );
      assert.deepEqual(bootstrapPayload.noteDefinitions.konversation.tags, [
        'test',
        'ombokning',
        'medicinsk-koll',
        'gdpr',
      ]);
      assert.equal(bootstrapPayload.noteDefinitions.konversation.priority, 'Hög');
      assert.equal(bootstrapPayload.noteDefinitions.konversation.visibility, 'Team');
      assert.equal(bootstrapPayload.patient360.modules.booking.status, 'needs_action');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Kliniskt underlag');
      assert.equal(bootstrapPayload.patient360.modules.documents.status, 'needs_validation');
    });

    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.workspace.note.save'),
      true
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace router schemalägger uppföljning, hittar konflikt och sparar resizer-preferenser', async () => {
  const fixture = await createRouterFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const followUpResponse = await fetch(`${baseUrl}/cco-workspace/follow-ups`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-test-2',
          customerId: 'anna.karlsson@email.com',
          customerName: 'Anna Karlsson',
          date: '2027-03-27',
          time: '10:30',
          doctorName: 'Dr. Eriksson',
          category: 'Ombokning',
          reminderLeadMinutes: 120,
          notes: 'Bokad för uppföljning.',
        }),
      });

      assert.equal(followUpResponse.status, 200);
      const followUpPayload = await followUpResponse.json();
      assert.equal(followUpPayload.followUp.customerName, 'Anna Karlsson');
      assert.equal(followUpPayload.patient360.modules.aftercare.status, 'scheduled');
      assert.equal(followUpPayload.aftercareCase.aftercareStatus, 'scheduled');
      assert.equal(followUpPayload.aftercareReadout.phase, 'follow_up_planned');
      assert.equal(followUpPayload.aftercareReadout.blocker.key, 'follow_up_planned');
      assert.equal(followUpPayload.aftercareReadout.queueBucket, 'planned');

      const conflictResponse = await fetch(
        `${baseUrl}/cco-workspace/follow-ups/validate-conflict`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            workspaceId: 'major-arcana-preview',
            date: '2027-03-27',
            time: '10:30',
            doctorName: 'Dr. Eriksson',
          }),
        }
      );

      assert.equal(conflictResponse.status, 200);
      const conflictPayload = await conflictResponse.json();
      assert.equal(conflictPayload.ok, false);
      assert.equal(conflictPayload.conflict.customerName, 'Anna Karlsson');

      const prefsResponse = await fetch(`${baseUrl}/cco-workspace/preferences`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          leftWidth: 504,
          rightWidth: 398,
        }),
      });

      assert.equal(prefsResponse.status, 200);
      const prefsPayload = await prefsResponse.json();
      assert.equal(prefsPayload.preferences.leftWidth, 504);
      assert.equal(prefsPayload.preferences.rightWidth, 398);

      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-test-2&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.aftercareCase.aftercareStatus, 'scheduled');
      assert.equal(bootstrapPayload.aftercareReadout.phase, 'follow_up_planned');
      assert.equal(bootstrapPayload.aftercareReadout.blocker.key, 'follow_up_planned');
      assert.equal(bootstrapPayload.aftercareReadout.queueBucket, 'planned');
      assert.equal(bootstrapPayload.workspacePrefs.leftWidth, 504);
      assert.equal(bootstrapPayload.workspacePrefs.rightWidth, 398);
      assert.equal(bootstrapPayload.scheduleDraft.date, '2027-03-27');
      assert.equal(bootstrapPayload.scheduleDraft.time, '10:30');
      assert.equal(bootstrapPayload.bookingCase.status, 'needs_triage');
      assert.equal(bootstrapPayload.bookingReadout.status, 'needs_triage');
      assert.equal(bootstrapPayload.bookingCase.blocker.key, 'candidate_slots');
      assert.equal(bootstrapPayload.bookingReadout.blocker.key, 'candidate_slots');
      assert.equal(bootstrapPayload.bookingReadout.blocker.action, 'candidate_slots');
      assert.equal(bootstrapPayload.patient360.modules.tasks.status, 'needs_action');
      assert.equal(bootstrapPayload.patient360.modules.aftercare.status, 'scheduled');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Eftervård');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Genomför planerad uppföljning och dokumentera utfallet'
      );

      const resetResponse = await fetch(
        `${baseUrl}/cco-workspace/preferences?workspaceId=major-arcana-preview`,
        {
          method: 'DELETE',
        }
      );
      assert.equal(resetResponse.status, 200);

      const afterResetResponse = await fetch(
        `${baseUrl}/cco-workspace/preferences?workspaceId=major-arcana-preview`
      );
      assert.equal(afterResetResponse.status, 200);
      const afterResetPayload = await afterResetResponse.json();
      assert.equal(afterResetPayload.preferences, null);
    });

    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.workspace.follow_up.create'),
      true
    );
    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.workspace.preferences.save'),
      true
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace router faller inte tillbaka till preview-kontext när live-tråd saknas', async () => {
  const fixture = await createRouterFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.customer.conversationId, null);
      assert.equal(bootstrapPayload.customer.customerId, null);
      assert.equal(Array.isArray(bootstrapPayload.savedNotes), true);
      assert.equal(bootstrapPayload.savedNotes.length, 0);
      assert.equal(bootstrapPayload.latestFollowUp, null);
      assert.equal(bootstrapPayload.scheduleDraft.customerName, '');
      assert.equal(bootstrapPayload.scheduleDraft.date, '');
      assert.equal(bootstrapPayload.scheduleDraft.time, '');
      assert.equal(
        bootstrapPayload.noteDefinitions.konversation.linkedItems.includes('Anna Karlsson'),
        false
      );

      const notesResponse = await fetch(
        `${baseUrl}/cco-workspace/notes?workspaceId=major-arcana-preview`
      );
      assert.equal(notesResponse.status, 200);
      const notesPayload = await notesResponse.json();
      assert.deepEqual(notesPayload.notes, []);

      const followUpsResponse = await fetch(
        `${baseUrl}/cco-workspace/follow-ups?workspaceId=major-arcana-preview`
      );
      assert.equal(followUpsResponse.status, 200);
      const followUpsPayload = await followUpsResponse.json();
      assert.deepEqual(followUpsPayload.followUps, []);
      assert.equal(followUpsPayload.latestFollowUp, null);

      const saveNoteResponse = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          destinationKey: 'konversation',
          text: 'Ska inte sparas utan live-tråd',
        }),
      });
      assert.equal(saveNoteResponse.status, 400);
      const saveNotePayload = await saveNoteResponse.json();
      assert.equal(saveNotePayload.error, 'Välj en aktiv tråd först.');

      const followUpResponse = await fetch(`${baseUrl}/cco-workspace/follow-ups`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          date: '2026-03-27',
          time: '10:30',
          doctorName: 'Dr. Eriksson',
        }),
      });
      assert.equal(followUpResponse.status, 400);
      const followUpPayload = await followUpResponse.json();
      assert.equal(followUpPayload.error, 'Välj en aktiv tråd först.');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace router läcker inte tidigare tråddata till tomt live-läge', async () => {
  const fixture = await createRouterFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const saveNoteResponse = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-test-3',
          customerId: 'kons@hairtpclinic.com',
          customerName: 'Kons Hair TP Clinic',
          destinationKey: 'konversation',
          text: 'Ska bara visas när live-tråden är vald',
        }),
      });
      assert.equal(saveNoteResponse.status, 200);

      const saveFollowUpResponse = await fetch(`${baseUrl}/cco-workspace/follow-ups`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-test-3',
          customerId: 'kons@hairtpclinic.com',
          customerName: 'Kons Hair TP Clinic',
          date: '2026-03-28',
          time: '09:30',
          doctorName: 'Dr. Eriksson',
          category: 'Uppföljning',
          reminderLeadMinutes: 120,
          notes: 'Ska inte läcka till tomt live-läge',
        }),
      });
      assert.equal(saveFollowUpResponse.status, 200);

      const emptyBootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview`
      );
      assert.equal(emptyBootstrapResponse.status, 200);
      const emptyBootstrapPayload = await emptyBootstrapResponse.json();
      assert.deepEqual(emptyBootstrapPayload.savedNotes, []);
      assert.equal(emptyBootstrapPayload.latestFollowUp, null);

      const emptyNotesResponse = await fetch(
        `${baseUrl}/cco-workspace/notes?workspaceId=major-arcana-preview`
      );
      assert.equal(emptyNotesResponse.status, 200);
      const emptyNotesPayload = await emptyNotesResponse.json();
      assert.deepEqual(emptyNotesPayload.notes, []);

      const emptyFollowUpsResponse = await fetch(
        `${baseUrl}/cco-workspace/follow-ups?workspaceId=major-arcana-preview`
      );
      assert.equal(emptyFollowUpsResponse.status, 200);
      const emptyFollowUpsPayload = await emptyFollowUpsResponse.json();
      assert.deepEqual(emptyFollowUpsPayload.followUps, []);
      assert.equal(emptyFollowUpsPayload.latestFollowUp, null);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap läser first-class konsultationsärende och prioriterar dokumentflöde', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-consult-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'ready',
      clinicalStatus: 'needs_validation',
      documentStatus: 'needs_validation',
      consentStatus: 'required',
      requiredActions: ['Kontrollera samtycke och dokumentunderlag'],
      notes: 'Dokumentkedjan måste vara klar före konsultation.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-consult-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.consultationCase.consultationType, 'Fysisk konsultation');
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'ready');
      assert.equal(bootstrapPayload.patient360.modules.documents.status, 'blocked');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Dokument & samtycke');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter konsultation bära fokus före stödjande teamuppgift när inget blockerar', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-consult-tasks-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'scheduled',
      clinicalStatus: 'validated',
      documentStatus: 'validated',
      consentStatus: 'confirmed',
      requiredActions: ['Bekräfta konsultationstid med kunden'],
      notes: 'Konsultationen är planerad och behöver bara drivas vidare.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-consult-tasks-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'scheduled');
      assert.equal(bootstrapPayload.patient360.modules.tasks.status, 'needs_action');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Konsultation');
      assert.equal(bootstrapPayload.patient360.attention.what, 'Förbered planerad konsultation');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap läser first-class operationsärende och prioriterar blockerad klarering', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.operationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-operation-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      procedureType: 'Hårtransplantation',
      operationStatus: 'planned',
      clearanceStatus: 'blocked',
      outcomeStatus: 'unknown',
      scheduledForIso: '2026-03-29T08:00:00.000Z',
      doctorName: 'Dr. Eriksson',
      theatreName: 'Rum 2',
      requiredActions: ['Verifiera operationsberedskap med ansvarig kliniker'],
      notes: 'Klinisk klarering saknas före operationsdatum.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-operation-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.operationCase.procedureType, 'Hårtransplantation');
      assert.equal(bootstrapPayload.operationReadout.phase, 'clearance_blocked');
      assert.equal(bootstrapPayload.operationReadout.queueBucket, 'critical');
      assert.equal(
        bootstrapPayload.operationReadout.operatorActions[0].action,
        'resolve_operation_clearance'
      );
      assert.equal(bootstrapPayload.patient360.modules.operation.status, 'blocked');
      assert.equal(bootstrapPayload.patient360.modules.clinical.status, 'needs_validation');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Operation');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Stoppa operationsflödet och lös blockerande klarering'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap ger operation first-class handoffyta nar operationen ar klar', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.operationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-operation-complete-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      procedureType: 'Hårtransplantation',
      operationStatus: 'complete',
      clearanceStatus: 'cleared',
      outcomeStatus: 'stable',
      scheduledForIso: '2026-03-29T08:00:00.000Z',
      doctorName: 'Dr. Eriksson',
      theatreName: 'Rum 2',
      requiredActions: ['Slutför operationsloggen'],
      notes: 'Operationen är klar och eftervården ska ta över.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-operation-complete-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.operationReadout.phase, 'closed');
      assert.equal(bootstrapPayload.operationReadout.queueBucket, 'closed');
      assert.equal(bootstrapPayload.operationReadout.waitingOn, 'aftercare');
      assert.match(bootstrapPayload.operationReadout.nextStep, /eftervård/i);
      assert.match(bootstrapPayload.operationReadout.handoffCopy, /eftervård/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap läser first-class kommersiellt ärende och prioriterar betalningsblockerare', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'PRP paket',
      commercialStatus: 'deposit_pending',
      quoteStatus: 'sent',
      paymentStatus: 'blocked',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Lös deposition eller betalningsblockerare'],
      notes: 'Depositionen behöver lösas innan nästa steg kan bokas.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.commercialCase.offerType, 'PRP paket');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'blocked');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Offert & betalning');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Lös deposition eller betalningsblockerare'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter commercial bära fokus före stödjande teamuppgift när offert väntar på kund', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-commercial-tasks-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'PRP paket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Offerten är skickad och väntar på kundens besked.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-commercial-tasks-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.modules.tasks.status, 'needs_action');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Offert & betalning');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Invänta kundens besked om offert eller prisupplägg'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter konsultation vinna över booking och commercial i samtidiga väntelägen', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.bookingStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      requestedTreatment: 'Konsultation inför hårtransplantation',
      preferredWindow: 'Nästa vecka efter lunch',
      status: 'offered',
      notes: 'Kunden har fått tider och väntar med återkoppling.',
    });

    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'scheduled',
      clinicalStatus: 'validated',
      documentStatus: 'validated',
      consentStatus: 'confirmed',
      requiredActions: ['Förbered planerad konsultation'],
      notes: 'Konsultationen är redan planerad och är nu närmast kunden.',
    });

    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'Konsultationspaket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Prisdialogen lever men konsultationen är den verkliga arbetsytan just nu.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-consult-booking-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.booking.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'scheduled');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Konsultation');
      assert.equal(bootstrapPayload.patient360.attention.what, 'Förbered planerad konsultation');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter klinisk validering vinna över konsultation, booking och commercial', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.bookingStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-clinical-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      requestedTreatment: 'Konsultation inför hårtransplantation',
      preferredWindow: 'Nästa vecka efter lunch',
      status: 'offered',
      notes: 'Kunden väntar på tider, men kliniken behöver först mer underlag.',
    });

    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-clinical-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'scheduled',
      clinicalStatus: 'needs_validation',
      documentStatus: 'validated',
      consentStatus: 'confirmed',
      requiredActions: ['Verifiera kliniskt underlag före nästa steg'],
      notes: 'Konsultationen finns, men klinisk validering blockerar nu kundnära arbete.',
    });

    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-clinical-consult-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'Konsultationspaket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Commercial lever, men kliniken måste validera innan nästa patientdrag.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-clinical-consult-booking-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.booking.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'scheduled');
      assert.equal(bootstrapPayload.patient360.modules.clinical.status, 'needs_validation');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Kliniskt underlag');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Verifiera kliniskt underlag inför konsultation'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter booking vinna över commercial när bokningen kräver validering', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.bookingStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      requestedTreatment: 'Hårtransplantation',
      preferredWindow: 'Så snart som möjligt',
      status: 'slots_ready',
      selectedSlots: [
        {
          slotId: 'slot-1',
          startsAt: '2026-03-28T10:00:00.000Z',
          endsAt: '2026-03-28T11:00:00.000Z',
          resourceName: 'Egzona',
          serviceName: 'Konsultation',
        },
      ],
      notes: 'Tider finns och måste valideras innan vi bär dem vidare.',
    });

    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'ready',
      clinicalStatus: 'validated',
      documentStatus: 'validated',
      consentStatus: 'confirmed',
      requiredActions: ['Verifiera konsultationsbehov innan råd'],
      notes: 'Konsultationsspåret är redo men bokningen blockerar närmare.',
    });

    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-booking-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'PRP paket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Commercial väntar, men bokningen kräver först mänsklig validering.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-booking-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.booking.status, 'needs_validation');
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'ready');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Bokning');
      assert.equal(bootstrapPayload.patient360.attention.what, 'Validera valda kandidat-tider');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter blockerande dokument vinna över booking, konsultation och commercial', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.bookingStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-documents-booking-consult-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      requestedTreatment: 'Konsultation inför hårtransplantation',
      preferredWindow: 'Nästa vecka efter lunch',
      status: 'offered',
      notes: 'Kunden väntar på svar, men dokument saknas fortfarande.',
    });

    await fixture.consultationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-documents-booking-consult-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      consultationType: 'Fysisk konsultation',
      consultationStatus: 'ready',
      clinicalStatus: 'validated',
      documentStatus: 'needs_validation',
      consentStatus: 'required',
      requiredActions: ['Kontrollera samtycke och dokumentunderlag'],
      notes: 'Dokumentkedjan blockerar allt annat.',
    });

    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-documents-booking-consult-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'Konsultationspaket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Commercial lever, men dokument måste lösas först.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-documents-booking-consult-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.booking.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.modules.consultation.status, 'ready');
      assert.equal(bootstrapPayload.patient360.modules.documents.status, 'blocked');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Dokument & samtycke');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Kontrollera samtycke och dokumentunderlag'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap låter eftervård vinna över commercial efter avslutad operation', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.operationStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      procedureType: 'Hårtransplantation',
      operationStatus: 'complete',
      clearanceStatus: 'cleared',
      outcomeStatus: 'stable',
      scheduledForIso: '2026-03-20T08:00:00.000Z',
      doctorName: 'Dr. Eriksson',
      theatreName: 'Rum 2',
      requiredActions: ['Slutför operationsloggen'],
      notes: 'Operationen är avslutad utan komplikationer.',
    });

    await fixture.aftercareStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      category: 'Efterkontroll',
      aftercareStatus: 'needs_review',
      contactStatus: 'pending',
      outcomeStatus: 'unknown',
      requiredActions: ['Öppna eftervårdsärendet och välj nästa steg'],
      notes: 'Eftervården behöver ta över när operationen är avslutad.',
    });

    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-commercial-workspace',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      offerType: 'Eftervårdspaket',
      commercialStatus: 'quote_sent',
      quoteStatus: 'sent',
      paymentStatus: 'pending_customer',
      dueDateIso: '2026-03-26T12:00:00.000Z',
      requiredActions: ['Följ upp offerten med kunden'],
      notes: 'Offerten väntar på kundens besked men eftervården är nu närmare kunden.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-aftercare-commercial-workspace&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(bootstrapPayload.patient360.modules.operation.status, 'complete');
      assert.equal(bootstrapPayload.patient360.modules.aftercare.status, 'needs_action');
      assert.equal(bootstrapPayload.patient360.modules.commercial.status, 'waiting_customer');
      assert.equal(bootstrapPayload.patient360.attention.where, 'Eftervård');
      assert.equal(
        bootstrapPayload.patient360.attention.what,
        'Öppna eftervårdsärendet och välj nästa steg'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco workspace bootstrap returnerar sorterad aftercare-kö över flera ärenden', async () => {
  const fixture = await createRouterFixture();

  try {
    await fixture.aftercareStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-critical',
      customerId: 'kritisk@example.com',
      customerName: 'Kritisk Kund',
      aftercareStatus: 'in_progress',
      contactStatus: 'confirmed',
      outcomeStatus: 'needs_attention',
      doctorName: 'Dr. Eriksson',
      requiredActions: ['Verifiera eftervårdsutfall med Dr. Eriksson'],
      notes: 'Klinisk eskalering ska ligga först i kön.',
    });

    await fixture.aftercareStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-due',
      customerId: 'forfallen@example.com',
      customerName: 'Förfallen Kund',
      aftercareStatus: 'scheduled',
      contactStatus: 'pending',
      outcomeStatus: 'unknown',
      scheduledForIso: '2026-03-10T08:00:00.000Z',
      requiredActions: ['Genomför planerad uppföljning och dokumentera utfallet'],
      notes: 'Förfallen uppföljning ska komma före planerade ärenden.',
    });

    await fixture.aftercareStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-aftercare-planned',
      customerId: 'planerad@example.com',
      customerName: 'Planerad Kund',
      aftercareStatus: 'scheduled',
      contactStatus: 'pending',
      outcomeStatus: 'unknown',
      scheduledForIso: '2027-03-27T10:30:00.000Z',
      requiredActions: ['Genomför planerad uppföljning och dokumentera utfallet'],
      notes: 'Planerad uppföljning ska ligga efter akuta ärenden.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-aftercare-critical&customerId=kritisk@example.com&customerName=Kritisk%20Kund`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();
      assert.equal(Array.isArray(bootstrapPayload.aftercareQueue), true);
      assert.equal(bootstrapPayload.aftercareQueue.length, 3);
      assert.equal(bootstrapPayload.aftercareQueue[0].conversationId, 'conv-aftercare-critical');
      assert.equal(bootstrapPayload.aftercareQueue[0].aftercareReadout.queueBucket, 'critical');
      assert.equal(bootstrapPayload.aftercareQueue[1].conversationId, 'conv-aftercare-due');
      assert.equal(bootstrapPayload.aftercareQueue[1].aftercareReadout.queueBucket, 'due');
      assert.equal(bootstrapPayload.aftercareQueue[2].conversationId, 'conv-aftercare-planned');
      assert.equal(bootstrapPayload.aftercareQueue[2].aftercareReadout.queueBucket, 'planned');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
