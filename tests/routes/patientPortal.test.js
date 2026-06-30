const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');
const { createCcoJournalPhotoStore } = require('../../src/ops/ccoJournalPhotoStore');
const {
  createPatientPortalRouter,
  createPatientPortalStore,
} = require('../../src/routes/patientPortal');

async function withPatientPortalServer(
  { patientPortalStore, bookingCaseStore, journalStore, journalPhotoStore },
  run
) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createPatientPortalRouter({
      patientPortalStore,
      bookingCaseStore,
      journalStore,
      journalPhotoStore,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('patientportal visar kundvänd read-only uppföljningsstatus från befintligt case', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patient-portal-followup-'));
  try {
    const patientPortalStore = createPatientPortalStore({
      filePath: path.join(dir, 'patient-portal.json'),
    });
    await patientPortalStore.load();
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    const invite = await patientPortalStore.createInvite({
      tenantId: 'hairtpclinic',
      patientId: 'patient-followup-1',
      patientName: 'Followup Kund',
      serviceLabel: 'Hårtransplantation DHI',
      forms: [{ formId: 'health', journalType: 'health_declaration', label: 'Hälsodeklaration' }],
    });
    await bookingCaseStore.createCase({
      id: 'case-followup-portal',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-followup-1',
      customerId: 'customer-followup-1',
      customerName: 'Followup Kund',
      serviceLabel: 'Hårtransplantation DHI',
      startsAt: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await bookingCaseStore.recordStaffAction(
      'case-followup-portal',
      { action: 'followup_needs_doctor' },
      { userId: 'nurse-1', role: 'personal' }
    );

    const journalCalls = [];
    await withPatientPortalServer(
      {
        patientPortalStore,
        bookingCaseStore,
        journalStore: {
          async createEntry(entry) {
            journalCalls.push(entry);
          },
        },
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/patient-portal/${invite.token}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.status, 'pending');
        assert.equal(body.followupStatus.current.caseId, 'case-followup-portal');
        assert.equal(body.followupStatus.current.status, 'clinic_review');
        assert.equal(body.followupStatus.current.label, 'Kliniken granskar');
        assert.equal(body.followupStatus.current.readOnly, true);
        assert.equal(body.followupStatus.patientActions[0].id, 'clinic_review_wait');
        assert.equal(body.followupStatus.patientActions[0].type, 'read_only');
        assert.deepEqual(body.followupStatus.uploadIntents, []);
        assert.equal(body.followupStatus.summary.clinicReview, 1);
        assert.equal(body.followupStatus.safety.readOnly, true);
        assert.match(body.followupStatus.safety.message, /Journalanteckningar/);
        assert.deepEqual(journalCalls, []);
      }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('patientportal laddar upp uppföljningsbild via säker upload-token', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patient-portal-upload-token-'));
  try {
    const patientPortalStore = createPatientPortalStore({
      filePath: path.join(dir, 'patient-portal.json'),
    });
    await patientPortalStore.load();
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    const journalPhotoStore = await createCcoJournalPhotoStore({
      baseDir: path.join(dir, 'journal-photos'),
    });
    const invite = await patientPortalStore.createInvite({
      tenantId: 'hairtpclinic',
      patientId: 'patient-upload-1',
      patientName: 'Upload Kund',
      serviceLabel: 'Hårtransplantation DHI',
      forms: [],
    });
    await bookingCaseStore.createCase({
      id: 'case-upload-portal',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-upload-1',
      customerId: 'customer-upload-1',
      customerName: 'Upload Kund',
      serviceLabel: 'Hårtransplantation DHI',
      startsAt: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const uploadToken = await patientPortalStore.createFollowupUploadToken({
      tenantId: 'hairtpclinic',
      patientId: 'patient-upload-1',
      caseId: 'case-upload-portal',
      milestoneKey: 'followup_month_4',
      maxPhotos: 1,
      expiresInHours: 2,
    });

    await withPatientPortalServer(
      {
        patientPortalStore,
        bookingCaseStore,
        journalStore: null,
        journalPhotoStore,
      },
      async (baseUrl) => {
        const viewRes = await fetch(`${baseUrl}/api/patient-portal/${invite.token}`);
        assert.equal(viewRes.status, 200);
        const viewBody = await viewRes.json();
        assert.equal(viewBody.followupStatus.current.status, 'overdue');
        assert.equal(viewBody.followupStatus.patientActions[0].uploadEnabled, true);
        assert.match(
          viewBody.followupStatus.patientActions[0].uploadUrl,
          /\/api\/patient-portal\/followup-photo-upload\//
        );
        assert.equal(viewBody.followupStatus.uploadIntents[0].enabled, true);
        assert.equal(viewBody.followupStatus.uploadIntents[0].remainingUploads, 1);

        const form = new FormData();
        form.append(
          'photo',
          new Blob([Buffer.from('fake-png')], { type: 'image/png' }),
          'hair.png'
        );
        const uploadRes = await fetch(
          `${baseUrl}/api/patient-portal/followup-photo-upload/${uploadToken.token}`,
          { method: 'POST', body: form }
        );
        assert.equal(uploadRes.status, 200);
        const uploadBody = await uploadRes.json();
        assert.equal(uploadBody.ok, true);
        assert.equal(uploadBody.caseId, 'case-upload-portal');
        assert.equal(uploadBody.milestoneKey, 'followup_month_4');
        assert.equal(uploadBody.remainingUploads, 0);
        assert.equal(uploadBody.photo.fileName, 'hair.png');
        assert.equal(uploadBody.photo.byteSize, 8);

        const stored = await journalPhotoStore.readPhoto({
          tenantId: 'hairtpclinic',
          patientId: 'patient-upload-1',
          photoId: uploadBody.photo.photoId,
        });
        assert.equal(stored.mimeType, 'image/png');
        assert.equal(stored.buffer.toString(), 'fake-png');

        const secondForm = new FormData();
        secondForm.append(
          'photo',
          new Blob([Buffer.from('again')], { type: 'image/png' }),
          'again.png'
        );
        const secondRes = await fetch(
          `${baseUrl}/api/patient-portal/followup-photo-upload/${uploadToken.token}`,
          { method: 'POST', body: secondForm }
        );
        assert.equal(secondRes.status, 404);
      }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('patientportal förbereder bilduppladdningspunkt utan att aktivera upload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'patient-portal-aftercare-actions-'));
  try {
    const patientPortalStore = createPatientPortalStore({
      filePath: path.join(dir, 'patient-portal.json'),
    });
    await patientPortalStore.load();
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    const invite = await patientPortalStore.createInvite({
      tenantId: 'hairtpclinic',
      patientId: 'patient-overdue-1',
      patientName: 'Overdue Kund',
      serviceLabel: 'Hårtransplantation DHI',
      forms: [],
    });
    await bookingCaseStore.createCase({
      id: 'case-overdue-portal',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-overdue-1',
      customerId: 'customer-overdue-1',
      customerName: 'Overdue Kund',
      serviceLabel: 'Hårtransplantation DHI',
      startsAt: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await withPatientPortalServer(
      {
        patientPortalStore,
        bookingCaseStore,
        journalStore: null,
      },
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/patient-portal/${invite.token}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.followupStatus.current.status, 'overdue');
        assert.equal(body.followupStatus.patientActions[0].id, 'prepare_followup_photos');
        assert.equal(body.followupStatus.patientActions[0].type, 'photo_upload_intent');
        assert.equal(body.followupStatus.patientActions[0].uploadEnabled, false);
        assert.deepEqual(body.followupStatus.uploadIntents, [
          {
            id: 'prepare_followup_photos',
            label: 'Förbered uppföljningsbilder',
            enabled: false,
            reason: 'Kräver separat säker upload-token från kliniken.',
            url: null,
            expiresAt: null,
            remainingUploads: null,
          },
        ]);
      }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
