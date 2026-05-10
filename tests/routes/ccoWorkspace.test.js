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
const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');
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
  const bookingStore = await createCcoBookingStore({
    filePath: path.join(tempDir, 'bookings.json'),
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
      bookingStore,
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
          text: 'Sparad anteckning från testet',
          tags: ['test', 'ombokning'],
          priority: 'high',
          visibility: 'team',
          templateKey: 'ombokning',
        }),
      });

      assert.equal(saveResponse.status, 200);
      const savePayload = await saveResponse.json();
      assert.equal(savePayload.note.text, 'Sparad anteckning från testet');

      const bootstrapResponse = await fetch(
        `${baseUrl}/cco-workspace/bootstrap?workspaceId=major-arcana-preview&conversationId=conv-test-1&customerId=anna.karlsson@email.com&customerName=Anna%20Karlsson`
      );
      assert.equal(bootstrapResponse.status, 200);
      const bootstrapPayload = await bootstrapResponse.json();

      assert.equal(
        bootstrapPayload.noteDefinitions.konversation.text,
        'Sparad anteckning från testet'
      );
      assert.deepEqual(bootstrapPayload.noteDefinitions.konversation.tags, ['test', 'ombokning']);
      assert.equal(bootstrapPayload.noteDefinitions.konversation.priority, 'Hög');
      assert.equal(bootstrapPayload.noteDefinitions.konversation.visibility, 'Team');
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
          date: '2026-03-27',
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

      const conflictResponse = await fetch(
        `${baseUrl}/cco-workspace/follow-ups/validate-conflict`,
        {
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
      assert.equal(bootstrapPayload.workspacePrefs.leftWidth, 504);
      assert.equal(bootstrapPayload.workspacePrefs.rightWidth, 398);
      assert.equal(bootstrapPayload.scheduleDraft.date, '2026-03-27');
      assert.equal(bootstrapPayload.scheduleDraft.time, '10:30');
      assert.equal(bootstrapPayload.bookingCase.status, 'needs_triage');
      assert.equal(bootstrapPayload.bookingReadout.status, 'needs_triage');
      assert.equal(bootstrapPayload.bookingCase.blocker.key, 'candidate_slots');
      assert.equal(bootstrapPayload.bookingReadout.blocker.key, 'candidate_slots');
      assert.equal(bootstrapPayload.bookingReadout.blocker.action, 'candidate_slots');

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
