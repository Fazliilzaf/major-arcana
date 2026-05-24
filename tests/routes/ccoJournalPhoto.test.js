'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoJournalRouter } = require('../../src/routes/ccoJournal');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { createCcoJournalPhotoStore } = require('../../src/ops/ccoJournalPhotoStore');

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

async function createFixture(overrides = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-journal-photo-'));
  const journalStore = await createCcoJournalStore({
    filePath: path.join(tempDir, 'journal.json'),
  });
  const journalPhotoStore = await createCcoJournalPhotoStore({
    baseDir: path.join(tempDir, 'photos'),
  });
  const auditEvents = [];
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/api/v1',
    createCcoJournalRouter({
      journalStore,
      journalPhotoStore,
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: { defaultTenantId: 'tenant-a' },
      requireAuth: overrides.requireAuth || ((_req, _res, next) => next()),
      requireRole: overrides.requireRole || (() => (_req, _res, next) => next()),
    })
  );
  return { app, tempDir, journalStore, auditEvents };
}

async function buildJpegBuffer() {
  try {
    const sharp = require('sharp');
    return sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 90, g: 120, b: 180 } },
    })
      .jpeg()
      .toBuffer();
  } catch {
    return Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhIVFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lICUtLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAAAAQID/8QAFxEBAQEBAAAAAAAAAAAAAAAAAAEhMf/aAAwDAQACEAMQAAAAAf8A/8QAFhEAAwEAAAAAAAAAAAAAAAAAABExQf/aAAgBAQABBQLZf//EABYRAQEBAAAAAAAAAAAAAAAAAAARACH/2gAIAQMBAT8Bi/+//8QAFhEBAAMAAAAAAAAAAAAAAAAAABExAUL/2gAIAQIBAT8Bl3//xAAVEQEBAAAAAAAAAAAAAAAAAAABEf/aAAgBAQAGPwKbX//EABYQAQEBAAAAAAAAAAAAAAAAABEBAP/aAAgBAQABPyHdP//Z',
      'base64'
    );
  }
}

async function postPhoto(baseUrl, fields = {}, { auth = false } = {}) {
  const buffer = await buildJpegBuffer();
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  form.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'front.jpg');
  const headers = auth ? { Authorization: 'Bearer test-token' } : {};
  return fetch(`${baseUrl}/cco-journal/photo`, { method: 'POST', headers, body: form });
}

test('photo upload creates consultation plan when entryId missing', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await postPhoto(baseUrl, {
        patientId: 'patient-photo-1',
        personnummer: '19960830-4698',
        label: 'Front',
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.entry.journalType, 'consultation_plan');
      assert.equal(payload.entry.attachments.length, 1);
      assert.equal(payload.entry.attachments[0].label, 'Front');
      assert.ok(fixture.auditEvents.some((event) => event.action === 'cco.journal.photo.upload'));
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('photo upload returns 409 for signed plan', async () => {
  const fixture = await createFixture();
  try {
    const plan = await fixture.journalStore.ensureConsultationPlan({
      tenantId: 'tenant-a',
      patientId: 'patient-photo-2',
      personnummer: '19960830-4698',
      actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
    });
    await fixture.journalStore.signEntry({
      tenantId: 'tenant-a',
      patientId: 'patient-photo-2',
      entryId: plan.entryId,
      actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await postPhoto(baseUrl, {
        patientId: 'patient-photo-2',
        entryId: plan.entryId,
      });
      assert.equal(response.status, 409);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('photo upload requires authentication', async () => {
  const fixture = await createFixture({
    requireAuth: (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ error: 'Inloggning krävs.' });
      }
      next();
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const response = await postPhoto(
        baseUrl,
        { patientId: 'patient-photo-3', personnummer: '19960830-4698' },
        { auth: false }
      );
      assert.equal(response.status, 401);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('photo upload rejects unsupported mime type', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const form = new FormData();
      form.append('patientId', 'patient-photo-4');
      form.append('photo', new Blob([Buffer.from('not-image')], { type: 'image/gif' }), 'x.gif');
      const response = await fetch(`${baseUrl}/cco-journal/photo`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: form,
      });
      assert.equal(response.status, 415);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('photo GET returns stored image bytes', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const upload = await postPhoto(baseUrl, {
        patientId: 'patient-photo-get',
        personnummer: '19960830-4698',
        label: 'Front',
      });
      assert.equal(upload.status, 200);
      const payload = await upload.json();
      const photoId = payload?.photo?.photoId;
      assert.ok(photoId);
      const getResponse = await fetch(
        `${baseUrl}/cco-journal/photo?patientId=patient-photo-get&photoId=${encodeURIComponent(photoId)}`
      );
      assert.equal(getResponse.status, 200);
      assert.match(String(getResponse.headers.get('content-type') || ''), /image\//);
      const bytes = Buffer.from(await getResponse.arrayBuffer());
      assert.ok(bytes.length > 0);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('plan-photos/clear removes smoke attachments in bulk', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const plan = await fixture.journalStore.ensureConsultationPlan({
        tenantId: 'tenant-a',
        patientId: 'patient-1',
        personnummer: '19900101-1234',
        actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
      });
      await fixture.journalStore.addConsultationPhotoAttachment({
        tenantId: 'tenant-a',
        patientId: 'patient-1',
        entryId: plan.entryId,
        photo: {
          photoId: 'smoke-1',
          fileName: 'smoke.jpg',
          mimeType: 'image/jpeg',
          storedAt: new Date().toISOString(),
          label: 'Smoke Front',
        },
        actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
      });
      await fixture.journalStore.addConsultationPhotoAttachment({
        tenantId: 'tenant-a',
        patientId: 'patient-1',
        entryId: plan.entryId,
        photo: {
          photoId: 'real-1',
          fileName: 'front.jpg',
          mimeType: 'image/jpeg',
          storedAt: new Date().toISOString(),
          label: 'Front',
        },
        actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
      });

      const res = await fetch(`${baseUrl}/cco-journal/plan-photos/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-1',
          entryId: plan.entryId,
          smokeOnly: true,
        }),
      });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.removedCount, 1);
      assert.equal(payload.entry.attachments.length, 1);
      assert.equal(payload.entry.attachments[0].photoId, 'real-1');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('photo DELETE removes attachment and stored bytes', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const upload = await postPhoto(baseUrl, {
        patientId: 'patient-photo-del',
        personnummer: '19960830-4698',
        label: 'Front',
      });
      assert.equal(upload.status, 200);
      const payload = await upload.json();
      const entry = payload.entry;
      const attachment = entry.attachments[0];
      const deleteResponse = await fetch(`${baseUrl}/cco-journal/photo`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-photo-del',
          entryId: entry.entryId,
          attachmentId: attachment.attachmentId,
          photoId: attachment.photoId,
        }),
      });
      assert.equal(deleteResponse.status, 200);
      const deleted = await deleteResponse.json();
      assert.equal(deleted.entry.attachments.length, 0);
      const getResponse = await fetch(
        `${baseUrl}/cco-journal/photo?patientId=patient-photo-del&photoId=${encodeURIComponent(attachment.photoId)}`
      );
      assert.equal(getResponse.status, 404);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
