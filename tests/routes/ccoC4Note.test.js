'use strict';

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

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-c4-note-'));
  const auditEvents = [];

  const noteStore = await createCcoNoteStore({ filePath: path.join(tempDir, 'notes.json') });
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
      config: { defaultTenantId: 'tenant-a' },
    })
  );

  return { app, tempDir, auditEvents };
}

// ── C4 test scenarios ─────────────────────────────────────────────────────────

test('C4: sparar konversationsanteckning med korrekt destination och audit-loggar customerId + conversationId', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-c4-test',
          customerId: 'patient-c4@test.se',
          customerName: 'C4 Testpatient',
          destinationKey: 'konversation',
          text: 'C4-anteckning för konversationstråden.',
          priority: 'medium',
          visibility: 'team',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.note.destinationKey, 'konversation');
      assert.match(body.note.text, /C4-anteckning/);
    });

    const auditEvent = fixture.auditEvents.find((e) => e.action === 'cco.workspace.note.save');
    assert.ok(auditEvent, 'audit event bör finnas');
    assert.equal(auditEvent.metadata.destinationKey, 'konversation');
    assert.equal(auditEvent.metadata.conversationId, 'conv-c4-test');
    assert.equal(auditEvent.metadata.customerId, 'patient-c4@test.se');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C4: returnerar 400 när customerId saknas (fel kund)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-c4-test',
          // customerId saknas — ska blockeras
          destinationKey: 'konversation',
          text: 'Ska inte sparas.',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error, 'felbeskrivning ska finnas');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C4: returnerar 400 när conversationId saknas (saknad tråd)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          // conversationId saknas — ska blockeras
          customerId: 'patient-c4@test.se',
          destinationKey: 'konversation',
          text: 'Ska inte sparas.',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error, 'felbeskrivning ska finnas');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C4: journalutkast blockeras utan explicit journalDraftConfirmed: true', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-c4-test',
          customerId: 'patient-c4@test.se',
          customerName: 'C4 Testpatient',
          destinationKey: 'journalutkast',
          text: 'Ska kräva bekräftelse.',
          // journalDraftConfirmed saknas — ska blockeras
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /journalDraftConfirmed/i);
    });

    assert.equal(
      fixture.auditEvents.some((e) => e.action === 'cco.workspace.note.save'),
      false,
      'inget audit-event ska skapas när blockat'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C4: journalutkast sparas med journalDraftConfirmed: true och audit-loggas korrekt', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco-workspace/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-c4-journal',
          customerId: 'patient-journal@test.se',
          customerName: 'Journal Testpatient',
          destinationKey: 'journalutkast',
          text: 'Journalutkast med explicit bekräftelse.',
          visibility: 'internal',
          journalDraftConfirmed: true,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.note.destinationKey, 'journalutkast');
    });

    const auditEvent = fixture.auditEvents.find((e) => e.action === 'cco.workspace.note.save');
    assert.ok(auditEvent, 'audit event bör finnas');
    assert.equal(auditEvent.metadata.destinationKey, 'journalutkast');
    assert.equal(auditEvent.metadata.conversationId, 'conv-c4-journal');
    assert.equal(auditEvent.metadata.customerId, 'patient-journal@test.se');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
