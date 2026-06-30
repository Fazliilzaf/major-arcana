const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');
const {
  createPatientPortalRouter,
  createPatientPortalStore,
} = require('../../src/routes/patientPortal');

async function withPatientPortalServer(
  { patientPortalStore, bookingCaseStore, journalStore },
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
          },
        ]);
      }
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
