const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');
const { createQmsStore } = require('../../src/qms/qmsStore');
const { createPatientPortalStore } = require('../../src/routes/patientPortal');

async function withServer(run) {
  const app = express();
  app.use(createStaffPortalRouter());
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/v1/staff/documents?filler=staff läser katalogens types-array', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/staff/documents?filler=staff`, {
      headers: { 'x-cco-role': 'personal' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.documents), true);
    assert.ok(body.documents.length > 0);
    assert.equal(
      body.documents.every((doc) => doc.filler === 'staff'),
      true
    );
  });
});

test('GET /api/v1/staff/my-customers aggregerar egna kunder med bildsignal', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-my-customers-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-1'), { recursive: true });
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-1', 'front.jpg'), 'x');

    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-1',
      customerId: 'customer-1',
      customerName: 'Test Kund',
      serviceLabel: 'Hårtransplantation',
      assignedTo: 'staff-1',
      startsAt: '2030-06-29T10:00:00.000Z',
    });
    await bookingCaseStore.createCase({
      id: 'case-2',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-2',
      customerName: 'Annan Kund',
      assignedTo: 'staff-2',
    });

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: {
          stateRoot: dir,
          journalPhotosDir: photoRoot,
        },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/my-customers`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.count, 1);
      assert.equal(body.summary.total, 1);
      assert.equal(body.summary.withPhotos, 1);
      assert.equal(body.customers[0].patientId, 'patient-1');
      assert.equal(body.customers[0].photos.count, 1);
      assert.equal(body.customers[0].signals.hasCustomerCard, true);
      assert.equal(
        body.customers[0].links.customerCard,
        '/major-arcana-preview/?view=customers&patientId=patient-1'
      );
      assert.equal(
        body.customers[0].links.workspace,
        '/major-arcana-preview/?view=customers&workspace=1&patientId=patient-1'
      );
      assert.equal(body.customers[0].links.photos, '/api/v1/staff/customer-photos/patient-1');
      assert.equal(
        body.customers[0].links.followupStatus,
        '/api/v1/staff/customer-followup-status/patient-1'
      );
      assert.equal(body.customers[0].links.threads, '/api/v1/staff/customer-threads/customer-1');
      assert.equal(body.customers[0].links.staffTask, '/staff-portal?role=nurse&panel=customers');
      assert.equal(
        body.customers[0].links.doctorReview,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-1'
      );
      assert.equal(body.customers[0].links.adminCase, '/staff-portal?role=admin&panel=all-cases');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/delegated-inbox visar bara delegerade obesvarade kundtrådar', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-delegated-inbox-'));
  try {
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-inbox-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-inbox-1',
      customerId: 'customer-inbox-1',
      customerName: 'Inbox Kund',
      serviceLabel: 'Hårtransplantation',
      assignedTo: 'staff-1',
    });
    await bookingCaseStore.createCase({
      id: 'case-inbox-2',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-inbox-2',
      customerId: 'customer-inbox-2',
      customerName: 'Annan Inbox Kund',
      serviceLabel: 'PRP',
      assignedTo: 'staff-2',
    });

    const mailIngestionStore = {
      listPatientMessages({ patientId }) {
        if (patientId === 'customer-inbox-1') {
          return [
            {
              id: 'mail-1',
              conversationId: 'thread-inbox-1',
              fromAddress: 'kund@example.com',
              receivedAt: '2030-06-29T09:00:00.000Z',
              subject: 'Fråga om eftervård',
              snippet: 'Kan jag tvätta håret idag?',
              mailboxId: 'info',
            },
          ];
        }
        if (patientId === 'customer-inbox-2') {
          return [
            {
              id: 'mail-2',
              conversationId: 'thread-inbox-2',
              fromAddress: 'annan@example.com',
              receivedAt: '2030-06-29T10:00:00.000Z',
              subject: 'Inte min kund',
              snippet: 'Ska inte synas för staff-1',
              mailboxId: 'info',
            },
          ];
        }
        return [];
      },
    };

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: {
          stateRoot: dir,
          ccoConversationThreadStateStorePath: path.join(dir, 'thread-state.json'),
        },
        bookingCaseStore,
        mailIngestionStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/delegated-inbox`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.delegatedTo, 'staff-1');
      assert.equal(body.count, 1);
      assert.equal(body.summary.total, 1);
      assert.equal(body.summary.unanswered, 1);
      assert.equal(body.items[0].caseId, 'case-inbox-1');
      assert.equal(body.items[0].customerId, 'customer-inbox-1');
      assert.equal(body.items[0].threadId, 'thread-inbox-1');
      assert.equal(body.items[0].subject, 'Fråga om eftervård');
      assert.equal(body.items[0].links.threads, '/api/v1/staff/customer-threads/customer-inbox-1');
      assert.match(body.safety.message, /Delegerad inbox/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/delegated-photo-inbox visar bara delegerade kundbilder', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-delegated-photo-inbox-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-photo-1'), { recursive: true });
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-photo-2'), { recursive: true });
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-photo-1', 'front.jpg'), 'x');
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-photo-1', 'crown.png'), 'x');
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-photo-2', 'hidden.jpg'), 'x');

    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-photo-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-photo-1',
      customerId: 'customer-photo-1',
      customerName: 'Foto Kund',
      serviceLabel: 'Uppföljning bilder',
      assignedTo: 'staff-1',
    });
    await bookingCaseStore.createCase({
      id: 'case-photo-2',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-photo-2',
      customerId: 'customer-photo-2',
      customerName: 'Annan Foto Kund',
      assignedTo: 'staff-2',
    });

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: {
          stateRoot: dir,
          journalPhotosDir: photoRoot,
        },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/delegated-photo-inbox`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.delegatedTo, 'staff-1');
      assert.equal(body.count, 1);
      assert.equal(body.summary.total, 1);
      assert.equal(body.summary.photos, 2);
      assert.equal(body.items[0].caseId, 'case-photo-1');
      assert.equal(body.items[0].patientId, 'patient-photo-1');
      assert.equal(body.items[0].count, 2);
      assert.equal(body.items[0].latest.length, 2);
      assert.equal(body.items[0].links.photos, '/api/v1/staff/customer-photos/patient-photo-1');
      assert.match(body.safety.message, /bildmetadata/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/followups prioriterar egna postop-uppföljningar', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-followups-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-follow-1'), { recursive: true });
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-follow-1', 'day7.jpg'), 'x');

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-follow-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-follow-1',
      customerId: 'customer-follow-1',
      customerName: 'Uppföljning Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: eightDaysAgo,
    });
    await bookingCaseStore.createCase({
      id: 'case-follow-2',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-follow-2',
      customerId: 'customer-follow-2',
      customerName: 'Annan Uppföljning',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-2',
      startsAt: oneDayAgo,
    });

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: {
          stateRoot: dir,
          journalPhotosDir: photoRoot,
        },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/followups`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.delegatedTo, 'staff-1');
      assert.equal(body.count, 1);
      assert.equal(body.summary.total, 1);
      assert.equal(body.summary.withPhotos, 1);
      assert.equal(body.items[0].caseId, 'case-follow-1');
      assert.equal(body.items[0].patientId, 'patient-follow-1');
      assert.equal(body.items[0].milestone.key, 'postop_day_7');
      assert.equal(body.items[0].status, 'due');
      assert.equal(body.items[0].photos.count, 1);
      assert.deepEqual(body.items[0].followupHistory, []);
      assert.equal(body.items[0].followupHistorySummary.count, 0);
      assert.equal(
        body.items[0].links.workspace,
        '/major-arcana-preview/?view=customers&workspace=1&patientId=patient-follow-1'
      );
      assert.match(body.safety.message, /Uppföljningar/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/followups filtrerar uppföljningens arbetslägen', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-followup-modes-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-photo-mode'), { recursive: true });
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-photo-mode', 'day7.jpg'), 'x');

    const now = Date.now();
    const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    const patientPortalStore = createPatientPortalStore({
      filePath: path.join(dir, 'patient-portal.json'),
    });
    await patientPortalStore.load();
    const baseCase = {
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
    };
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-overdue',
      patientId: 'patient-overdue',
      customerName: 'Försenad Kund',
      startsAt: daysAgo(20),
    });
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-due',
      patientId: 'patient-due',
      customerName: 'Dagens Kund',
      startsAt: daysAgo(8),
    });
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-upcoming',
      patientId: 'patient-upcoming',
      customerName: 'Planerad Kund',
      startsAt: daysAgo(0),
    });
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-photo',
      patientId: 'patient-photo-mode',
      customerName: 'Bild Kund',
      startsAt: daysAgo(8),
    });
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-incoming-upload',
      patientId: 'patient-incoming-upload',
      customerName: 'Inkommen Bild Kund',
      startsAt: daysAgo(8),
    });
    const incomingToken = await patientPortalStore.createFollowupUploadToken({
      tenantId: 'hairtpclinic',
      patientId: 'patient-incoming-upload',
      caseId: 'case-follow-incoming-upload',
      milestoneKey: 'postop_day_7',
      maxPhotos: 1,
      expiresInHours: 12,
    });
    await patientPortalStore.recordFollowupUpload(incomingToken.token, {
      photo: {
        photoId: 'incoming-upload-1',
        fileName: 'incoming-day7.jpg',
        byteSize: 1234,
        storedAt: '2026-06-29T12:00:00.000Z',
      },
      ip: '127.0.0.1',
      userAgent: 'node-test',
    });
    await bookingCaseStore.recordStaffAction(
      'case-follow-photo',
      { action: 'followup_needs_doctor' },
      { userId: 'staff-1', role: 'personal' }
    );
    await bookingCaseStore.createCase({
      ...baseCase,
      id: 'case-follow-completed',
      patientId: 'patient-completed',
      customerName: 'Klar Kund',
      startsAt: daysAgo(20),
    });
    await bookingCaseStore.recordStaffAction(
      'case-follow-completed',
      { action: 'followup_needs_doctor' },
      { userId: 'staff-1', role: 'personal' }
    );
    await bookingCaseStore.recordStaffAction(
      'case-follow-completed',
      { action: 'followup_completed' },
      { userId: 'staff-1', role: 'personal' }
    );

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir, journalPhotosDir: photoRoot },
        bookingCaseStore,
        patientPortalStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const fetchMode = async (mode) => {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/followups?mode=${mode}`, {
          headers: { 'x-cco-role': 'personal' },
        });
        assert.equal(res.status, 200);
        return res.json();
      };

      const all = await fetchMode('all');
      assert.equal(all.summary.total, 6);
      assert.equal(all.summary.overdue, 1);
      assert.equal(all.summary.due, 3);
      assert.equal(all.summary.upcoming, 1);
      assert.equal(all.summary.withPhotos, 2);
      assert.equal(all.summary.incomingUploads, 1);
      assert.equal(all.summary.reviewedPhotos, 0);
      assert.equal(all.summary.photoReviewOverdue, 1);
      assert.equal(all.summary.needsDoctor, 2);
      assert.equal(all.summary.waitingDoctor, 1);
      assert.equal(all.summary.completed, 1);

      const overdue = await fetchMode('overdue');
      assert.deepEqual(
        overdue.items.map((item) => item.caseId),
        ['case-follow-overdue']
      );

      const due = await fetchMode('due');
      assert.deepEqual(
        due.items.map((item) => item.status),
        ['due', 'due', 'due']
      );

      const upcoming = await fetchMode('upcoming');
      assert.deepEqual(
        upcoming.items.map((item) => item.caseId),
        ['case-follow-upcoming']
      );

      const withPhotos = await fetchMode('with_photos');
      assert.deepEqual(withPhotos.items.map((item) => item.caseId).sort(), [
        'case-follow-incoming-upload',
        'case-follow-photo',
      ]);

      const incomingUploads = await fetchMode('incoming_uploads');
      assert.deepEqual(
        incomingUploads.items.map((item) => item.caseId),
        ['case-follow-incoming-upload']
      );
      assert.equal(incomingUploads.summary.incomingUploads, 1);
      assert.equal(incomingUploads.items[0].photos.incomingFromPortal, true);
      assert.equal(incomingUploads.items[0].photos.incomingReviewPending, true);
      assert.equal(incomingUploads.items[0].photos.reviewOverdue, true);
      assert.equal(incomingUploads.items[0].photos.reviewDueWithinHours, 24);
      assert.ok(incomingUploads.items[0].photos.reviewAgeHours >= 24);
      assert.equal(incomingUploads.items[0].photos.reviewDetail.status, 'overdue');
      assert.equal(incomingUploads.items[0].photos.reviewDetail.uploadedCount, 1);
      assert.equal(
        incomingUploads.items[0].photos.reviewDetail.latestPhoto.fileName,
        'incoming-day7.jpg'
      );
      assert.deepEqual(incomingUploads.items[0].photos.reviewDetail.recentPhotos, [
        {
          photoId: 'incoming-upload-1',
          fileName: 'incoming-day7.jpg',
          byteSize: 1234,
          storedAt: '2026-06-29T12:00:00.000Z',
        },
      ]);
      assert.equal(
        incomingUploads.items[0].photos.reviewDetail.reviewUrl,
        '/api/v1/staff/customer-photos/patient-incoming-upload'
      );
      assert.equal(incomingUploads.items[0].photos.portalUploadCount, 1);
      assert.equal(incomingUploads.items[0].followupUploadToken.status, 'received');

      const photoReviewOverdue = await fetchMode('photo_review_overdue');
      assert.deepEqual(
        photoReviewOverdue.items.map((item) => item.caseId),
        ['case-follow-incoming-upload']
      );
      assert.equal(photoReviewOverdue.summary.photoReviewOverdue, 1);

      await bookingCaseStore.recordStaffAction(
        'case-follow-incoming-upload',
        { action: 'followup_photos_reviewed' },
        { userId: 'staff-1', role: 'personal' }
      );
      const incomingAfterReview = await fetchMode('incoming_uploads');
      assert.equal(incomingAfterReview.items.length, 0);
      assert.equal(incomingAfterReview.summary.incomingUploads, 0);
      assert.equal(incomingAfterReview.summary.reviewedPhotos, 1);
      assert.equal(incomingAfterReview.summary.photoReviewOverdue, 0);
      const photoReviewOverdueAfterReview = await fetchMode('photo_review_overdue');
      assert.equal(photoReviewOverdueAfterReview.items.length, 0);
      assert.equal(photoReviewOverdueAfterReview.summary.photoReviewOverdue, 0);
      const withPhotosAfterReview = await fetchMode('with_photos');
      assert.deepEqual(withPhotosAfterReview.items.map((item) => item.caseId).sort(), [
        'case-follow-incoming-upload',
        'case-follow-photo',
      ]);
      const reviewedUpload = withPhotosAfterReview.items.find(
        (item) => item.caseId === 'case-follow-incoming-upload'
      );
      assert.equal(reviewedUpload.photos.incomingFromPortal, true);
      assert.equal(reviewedUpload.photos.incomingReviewPending, false);
      assert.equal(reviewedUpload.photos.reviewOverdue, false);
      assert.equal(reviewedUpload.photos.reviewDetail.status, 'reviewed');
      assert.equal(reviewedUpload.photos.reviewDetail.latestPhoto.fileName, 'incoming-day7.jpg');
      assert.ok(reviewedUpload.photos.reviewedAt);

      const reviewedPhotos = await fetchMode('reviewed_photos');
      assert.deepEqual(
        reviewedPhotos.items.map((item) => item.caseId),
        ['case-follow-incoming-upload']
      );
      assert.equal(reviewedPhotos.summary.incomingUploads, 0);
      assert.equal(reviewedPhotos.summary.reviewedPhotos, 1);
      assert.equal(reviewedPhotos.items[0].photos.incomingFromPortal, true);
      assert.equal(reviewedPhotos.items[0].photos.incomingReviewPending, false);

      const needsDoctor = await fetchMode('needs_doctor');
      assert.deepEqual(
        needsDoctor.items.map((item) => item.caseId),
        ['case-follow-photo', 'case-follow-completed']
      );

      const waitingDoctor = await fetchMode('waiting_doctor');
      assert.equal(waitingDoctor.items[0].caseId, 'case-follow-photo');
      assert.equal(waitingDoctor.items[0].followupHistorySummary.latestLabel, 'Behöver läkare');

      const completed = await fetchMode('completed');
      assert.equal(completed.items[0].caseId, 'case-follow-completed');
      assert.equal(completed.items[0].status, 'completed');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/customer-followup-status/:patientId exponerar kundkortets read-only statusbro', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-customer-followup-status-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-status'), { recursive: true });
    await fs.writeFile(path.join(photoRoot, 'hairtpclinic', 'patient-status', 'month4.jpg'), 'x');
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-status-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-status',
      customerId: 'customer-status',
      customerName: 'Status Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await bookingCaseStore.recordStaffAction(
      'case-status-1',
      { action: 'followup_needs_doctor' },
      { userId: 'staff-1', role: 'personal' }
    );
    for (let index = 0; index < 130; index += 1) {
      await bookingCaseStore.createCase({
        id: `case-status-fill-${index}`,
        tenantId: 'hairtpclinic',
        state: 'confirmed',
        patientId: `patient-fill-${index}`,
        customerId: `customer-fill-${index}`,
        customerName: `Filler ${index}`,
        serviceLabel: 'Kontroll',
        assignedTo: 'staff-1',
        startsAt: new Date(Date.now() - index * 60 * 1000).toISOString(),
      });
    }

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir, journalPhotosDir: photoRoot },
        bookingCaseStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'owner-1', tenantId: 'hairtpclinic', role: 'owner' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/customer-followup-status/patient-status?customerId=customer-status`,
        { headers: { 'x-cco-role': 'owner' } }
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.patientId, 'patient-status');
      assert.equal(body.current.caseId, 'case-status-1');
      assert.equal(body.current.status, 'overdue');
      assert.equal(body.current.waitingDoctor, true);
      assert.equal(body.current.photos.count, 1);
      assert.equal(body.summary.total, 1);
      assert.equal(body.summary.waitingDoctor, 1);
      assert.equal(body.summary.withPhotos, 1);
      assert.equal(body.timelineEvents.length, 1);
      assert.equal(body.timelineEvents[0].title, 'Behöver läkare');
      assert.equal(body.timelineEvents[0].readOnly, true);
      assert.equal(body.safety.noAutoJournal, true);
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.customer_followup_status.read')
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/staff/followups/:id/action sparar uppföljningsåtgärder med audit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-followup-action-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    await bookingCaseStore.createCase({
      id: 'case-follow-action-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-follow-action',
      customerId: 'customer-follow-action',
      customerName: 'Uppföljningsåtgärd Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      for (const action of [
        'followup_contacted',
        'followup_needs_doctor',
        'followup_journal_draft',
        'followup_photos_reviewed',
        'followup_completed',
      ]) {
        const res = await fetch(
          `http://127.0.0.1:${port}/api/v1/staff/followups/case-follow-action-1/action`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
            body: JSON.stringify({ action }),
          }
        );
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.ok, true);
        assert.equal(body.action, action);
        assert.equal(body.safety.noAutoSend, true);
        assert.equal(body.safety.noAutoJournal, true);
      }

      const stored = await bookingCaseStore.getCase('case-follow-action-1');
      assert.equal(stored.staffActions.followupContactedBy, 'staff-1');
      assert.equal(stored.staffActions.followupNeedsDoctorBy, 'staff-1');
      assert.equal(stored.staffActions.followupJournalDraftRequestedBy, 'staff-1');
      assert.equal(stored.staffActions.followupPhotosReviewedBy, 'staff-1');
      assert.equal(stored.staffActions.followupCompletedBy, 'staff-1');
      assert.ok(stored.ordinationReview);
      assert.ok(stored.history.some((entry) => entry.action === 'staff_followup_contacted'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_followup_needs_doctor'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_followup_journal_draft'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_followup_photos_reviewed'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_followup_completed'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.followup_contacted'));
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.followup_needs_doctor')
      );
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.followup_journal_draft')
      );
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.followup_photos_reviewed')
      );
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.followup_completed'));

      const followupsAfterActions = await fetch(`http://127.0.0.1:${port}/api/v1/staff/followups`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(followupsAfterActions.status, 200);
      const followupsBody = await followupsAfterActions.json();
      assert.equal(followupsBody.items[0].followupHistory.length, 5);
      assert.deepEqual(
        followupsBody.items[0].followupHistory.map((entry) => entry.label),
        [
          'Kontaktad',
          'Behöver läkare',
          'Journalutkast begärt',
          'Bilder granskade',
          'Uppföljning klar',
        ]
      );
      assert.equal(followupsBody.items[0].followupHistorySummary.count, 5);
      assert.equal(followupsBody.items[0].followupHistorySummary.latestLabel, 'Uppföljning klar');
      assert.equal(followupsBody.items[0].status, 'completed');
      assert.equal(followupsBody.items[0].followupHistorySummary.latestBy, 'staff-1');
      assert.equal(followupsBody.items[0].milestone.label, 'Postop dag 7');
      assert.equal(followupsBody.items[0].photos.count, 0);
      assert.equal(
        followupsBody.items[0].links.workspace,
        '/major-arcana-preview/?view=customers&workspace=1&patientId=patient-follow-action'
      );
      assert.ok(followupsBody.items[0].links.audit.includes('case-follow-action-1'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/staff/followups/:id/upload-token skapar säker kundlänk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-followup-upload-token-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    const patientPortalStore = createPatientPortalStore({
      filePath: path.join(dir, 'patient-portal.json'),
    });
    await patientPortalStore.load();
    await bookingCaseStore.createCase({
      id: 'case-follow-upload-token',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-follow-upload-token',
      customerId: 'customer-follow-upload-token',
      customerName: 'Bildlänk Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date(Date.now() - 130 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: {
          stateRoot: dir,
          publicBaseUrl: 'https://arcana.hairtpclinic.com',
        },
        bookingCaseStore,
        patientPortalStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/followups/case-follow-upload-token/upload-token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ maxPhotos: 3, expiresInHours: 12 }),
        }
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.uploadToken.caseId, 'case-follow-upload-token');
      assert.equal(body.uploadToken.patientId, 'patient-follow-upload-token');
      assert.equal(body.uploadToken.milestoneKey, 'followup_month_4');
      assert.equal(body.uploadToken.maxPhotos, 3);
      assert.equal(body.uploadToken.remainingUploads, 3);
      assert.match(body.uploadToken.uploadPath, /^\/api\/patient-portal\/followup-photo-upload\//);
      assert.match(
        body.uploadToken.uploadUrl,
        /^https:\/\/arcana\.hairtpclinic\.com\/api\/patient-portal\/followup-photo-upload\//
      );
      assert.equal(body.safety.noAutoSend, true);
      assert.equal(body.safety.noAutoJournal, true);

      const storedToken = await patientPortalStore.findFollowupUploadToken(body.uploadToken.token);
      assert.equal(storedToken.patientId, 'patient-follow-upload-token');
      assert.equal(storedToken.caseId, 'case-follow-upload-token');
      assert.equal(storedToken.remainingUploads, 3);
      const followupsRes = await fetch(`http://127.0.0.1:${port}/api/v1/staff/followups`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(followupsRes.status, 200);
      const followupsBody = await followupsRes.json();
      assert.equal(followupsBody.items[0].followupUploadToken.active, true);
      assert.equal(followupsBody.items[0].followupUploadToken.token, body.uploadToken.token);
      assert.equal(followupsBody.items[0].followupUploadToken.uploadedCount, 0);
      assert.equal(followupsBody.items[0].followupUploadToken.remainingUploads, 3);
      assert.match(
        followupsBody.items[0].followupUploadToken.uploadUrl,
        /^https:\/\/arcana\.hairtpclinic\.com\/api\/patient-portal\/followup-photo-upload\//
      );

      const reusedRes = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/followups/case-follow-upload-token/upload-token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ maxPhotos: 3, expiresInHours: 12 }),
        }
      );
      assert.equal(reusedRes.status, 200);
      const reusedBody = await reusedRes.json();
      assert.equal(reusedBody.uploadToken.reused, true);
      assert.equal(reusedBody.uploadToken.token, body.uploadToken.token);
      await patientPortalStore.recordFollowupUpload(body.uploadToken.token, {
        photo: {
          photoId: 'followup-photo-1',
          fileName: 'month4-1.jpg',
          byteSize: 1234,
          storedAt: '2030-06-29T10:00:00.000Z',
        },
        ip: '127.0.0.1',
        userAgent: 'node-test',
      });
      await patientPortalStore.recordFollowupUpload(body.uploadToken.token, {
        photo: {
          photoId: 'followup-photo-2',
          fileName: 'month4-2.jpg',
          byteSize: 2345,
          storedAt: '2030-06-29T11:00:00.000Z',
        },
        ip: '127.0.0.1',
        userAgent: 'node-test',
      });
      await patientPortalStore.recordFollowupUpload(body.uploadToken.token, {
        photo: {
          photoId: 'followup-photo-3',
          fileName: 'month4-3.jpg',
          byteSize: 3456,
          storedAt: '2030-06-29T12:00:00.000Z',
        },
        ip: '127.0.0.1',
        userAgent: 'node-test',
      });

      const arrivedRes = await fetch(`http://127.0.0.1:${port}/api/v1/staff/followups`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(arrivedRes.status, 200);
      const arrivedBody = await arrivedRes.json();
      const arrivedToken = arrivedBody.items[0].followupUploadToken;
      assert.equal(arrivedToken.active, false);
      assert.equal(arrivedToken.status, 'received');
      assert.equal(arrivedToken.hasUploads, true);
      assert.equal(arrivedToken.uploadedCount, 3);
      assert.equal(arrivedToken.remainingUploads, 0);
      assert.equal(arrivedToken.latestUploadedAt, '2030-06-29T12:00:00.000Z');
      assert.equal(arrivedToken.latestPhoto.fileName, 'month4-3.jpg');
      assert.equal(
        arrivedToken.reviewUrl,
        '/api/v1/staff/customer-photos/patient-follow-upload-token'
      );
      assert.equal(arrivedBody.items[0].photos.incomingFromPortal, true);
      assert.equal(arrivedBody.items[0].photos.portalUploadCount, 3);
      assert.equal(arrivedBody.items[0].photos.latestAt, '2030-06-29T12:00:00.000Z');
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.followup_upload_token_created')
      );
      assert.ok(
        auditEntries.some((entry) => entry.action === 'staff_portal.followup_upload_token_reused')
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/daily-work-queue prioriterar dagens ordinationsärende', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-daily-queue-'));
  try {
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-today-tp',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-today',
      customerName: 'Dagens Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date().toISOString(),
      handoffChecklist: {
        journalReady: true,
        consentSigned: false,
        paymentSettled: true,
        encounterLinked: false,
      },
    });

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/daily-work-queue`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.count, 1);
      assert.equal(body.summary.today, 1);
      assert.equal(body.items[0].priority, 'today');
      assert.ok(body.items[0].actions.some((action) => action.key === 'ordination'));
      assert.ok(body.items[0].actions.some((action) => action.key === 'checklist'));
      assert.ok(body.items[0].actions.some((action) => action.key === 'today_booking'));
      assert.equal(
        body.items[0].links.customerCard,
        '/major-arcana-preview/?view=customers&patientId=patient-today'
      );
      assert.equal(body.items[0].links.qms, '/staff-portal?panel=qms');
      assert.equal(body.items[0].links.staffTask, '/staff-portal?role=nurse&panel=tasks');
      assert.equal(
        body.items[0].links.ordination,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-today-tp'
      );
      assert.equal(
        body.items[0].links.doctorReview,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-today-tp'
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/ordination-reviews exponerar signoff-underlag för läkare', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-ordination-signoff-'));
  try {
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-signoff-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-signoff',
      customerName: 'Signoff Kund',
      serviceLabel: 'Hårtransplantation DHI',
      startsAt: '2030-06-29T08:30:00.000Z',
      handoffChecklist: {
        journalReady: true,
        consentSigned: false,
        paymentSettled: true,
        encounterLinked: true,
      },
      treatmentPlan: {
        method: 'DHI',
        graftsTotal: 2800,
        zones: [{ label: 'Hårlinje', grafts: 800 }],
      },
    });

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'doctor-1', tenantId: 'hairtpclinic', role: 'konsult' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/ordination-reviews`, {
        headers: { 'x-cco-role': 'konsult' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.count, 1);
      assert.equal(body.reviews[0].ordinationReadout.signoff.signatureRequired, true);
      assert.equal(body.reviews[0].ordinationReadout.signoff.commentRequiredForReject, true);
      assert.equal(body.reviews[0].ordinationReadout.signoff.decisionRequired, true);
      assert.equal(body.reviews[0].ordinationReadout.signoff.canApproveAfterManualReview, false);
      assert.deepEqual(body.reviews[0].ordinationReadout.signoff.blockers, [
        { key: 'consentSigned', label: 'Samtycken och patientinformation signerade' },
      ]);
      assert.equal(
        body.reviews[0].ordinationReadout.signoff.safety,
        'Läkaren måste granska underlaget manuellt. Systemet kan aldrig skapa ordination.approved automatiskt.'
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/ordination-reviews visar återkommen komplettering', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-ordination-return-'));
  try {
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-return-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-return',
      customerName: 'Return Kund',
      serviceLabel: 'Hårtransplantation DHI',
      handoffChecklist: {
        journalReady: true,
        consentSigned: true,
        paymentSettled: true,
        encounterLinked: true,
      },
    });
    await bookingCaseStore.updateOrdinationReview(
      'case-return-1',
      {
        status: 'needs_completion',
        signature: 'Dr Test',
        comment: 'Komplettera friskförsäkran före beslut',
      },
      { userId: 'doctor-1', role: 'konsult' }
    );
    await bookingCaseStore.recordStaffAction(
      'case-return-1',
      { action: 'resolve_completion' },
      { userId: 'staff-1', role: 'personal' }
    );

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'doctor-1', tenantId: 'hairtpclinic', role: 'konsult' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/ordination-reviews?mode=returned`,
        {
          headers: { 'x-cco-role': 'konsult' },
        }
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.count, 1);
      assert.equal(body.reviews[0].ordinationReview.status, 'pending');
      assert.deepEqual(
        body.reviews[0].ordinationReadout.timeline.map((entry) => entry.label),
        ['Läkare begärde komplettering', 'Personal markerade komplettering klar']
      );
      assert.deepEqual(
        body.reviews[0].ordinationReadout.timeline.map((entry) => entry.action),
        ['ordination_needs_completion', 'staff_resolve_completion']
      );
      assert.deepEqual(body.reviews[0].ordinationReadout.timelineSummary, {
        eventCount: 2,
        latestLabel: 'Personal markerade komplettering klar',
        latestAction: 'staff_resolve_completion',
        latestAt: body.reviews[0].ordinationReadout.timelineSummary.latestAt,
        latestActor: 'staff-1',
        returnedFromCompletion: true,
        requiresDoctorAttention: true,
      });
      assert.ok(body.reviews[0].ordinationReadout.timelineSummary.latestAt);
      assert.deepEqual(body.reviews[0].ordinationReadout.completionReturn, {
        returned: true,
        requestedAt: body.reviews[0].ordinationReadout.completionReturn.requestedAt,
        requestedBy: 'doctor-1',
        comment: 'Komplettera friskförsäkran före beslut',
        resolvedAt: body.reviews[0].ordinationReadout.completionReturn.resolvedAt,
        resolvedBy: 'staff-1',
      });
      assert.ok(body.reviews[0].ordinationReadout.completionReturn.requestedAt);
      assert.ok(body.reviews[0].ordinationReadout.completionReturn.resolvedAt);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/ordination-reviews filtrerar läkarkortets arbetslägen', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-ordination-modes-'));
  try {
    const photoRoot = path.join(dir, 'journal-photos');
    await fs.mkdir(path.join(photoRoot, 'hairtpclinic', 'patient-case-mode-followup'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(photoRoot, 'hairtpclinic', 'patient-case-mode-followup', 'followup.jpg'),
      'x'
    );
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    const createCase = (id, customerName) =>
      bookingCaseStore.createCase({
        id,
        tenantId: 'hairtpclinic',
        state: 'confirmed',
        patientId: `patient-${id}`,
        customerName,
        serviceLabel: 'Hårtransplantation DHI',
        startsAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        handoffChecklist: {
          journalReady: true,
          consentSigned: true,
          paymentSettled: true,
          encounterLinked: true,
        },
      });

    await createCase('case-mode-pending', 'Pending Kund');
    await createCase('case-mode-completion', 'Completion Kund');
    await createCase('case-mode-returned', 'Returned Kund');
    await createCase('case-mode-followup', 'Followup Kund');
    await createCase('case-mode-approved', 'Approved Kund');
    await createCase('case-mode-rejected', 'Rejected Kund');
    await bookingCaseStore.updateOrdinationReview(
      'case-mode-completion',
      { status: 'needs_completion', signature: 'Dr Test', comment: 'Komplettera underlag' },
      { userId: 'doctor-1', role: 'konsult' }
    );
    await bookingCaseStore.updateOrdinationReview(
      'case-mode-returned',
      { status: 'needs_completion', signature: 'Dr Test', comment: 'Komplettera foto' },
      { userId: 'doctor-1', role: 'konsult' }
    );
    await bookingCaseStore.recordStaffAction(
      'case-mode-returned',
      { action: 'resolve_completion' },
      { userId: 'staff-1', role: 'personal' }
    );
    await bookingCaseStore.recordStaffAction(
      'case-mode-followup',
      { action: 'followup_needs_doctor' },
      { userId: 'staff-1', role: 'personal' }
    );
    await bookingCaseStore.updateOrdinationReview(
      'case-mode-approved',
      { status: 'approved', signature: 'Dr Test', comment: 'OK' },
      { userId: 'doctor-1', role: 'konsult' }
    );
    await bookingCaseStore.updateOrdinationReview(
      'case-mode-rejected',
      { status: 'rejected', signature: 'Dr Test', comment: 'Avvisas' },
      { userId: 'doctor-1', role: 'konsult' }
    );

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir, journalPhotosDir: photoRoot },
        bookingCaseStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'doctor-1', tenantId: 'hairtpclinic', role: 'konsult' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const fetchMode = async (mode) => {
        const res = await fetch(
          `http://127.0.0.1:${port}/api/v1/staff/ordination-reviews?mode=${mode}&limit=20`,
          { headers: { 'x-cco-role': 'konsult' } }
        );
        assert.equal(res.status, 200);
        return res.json();
      };

      const all = await fetchMode('all');
      assert.equal(all.count, 6);
      assert.deepEqual(all.modes, {
        all: 6,
        pending: 1,
        returned: 1,
        completion: 1,
        followup: 1,
        approved: 1,
        rejected: 1,
      });

      const returned = await fetchMode('returned');
      assert.equal(returned.mode, 'returned');
      assert.deepEqual(
        returned.reviews.map((item) => item.id),
        ['case-mode-returned']
      );
      assert.equal(returned.reviews[0].workMode, 'returned');
      assert.deepEqual(returned.reviews[0].nextAction, {
        mode: 'returned',
        label: 'Granska igen',
        tone: 'sage',
        primary: 'Öppna underlag och fatta nytt beslut',
        description:
          'Personal har markerat kompletteringen klar. Läkaren behöver granska underlaget på nytt före godkännande eller avvisning.',
        owner: 'doctor',
        suggestedAction: 'review_again',
        canUseDecisionButtons: true,
      });

      const completion = await fetchMode('completion');
      assert.deepEqual(
        completion.reviews.map((item) => item.id),
        ['case-mode-completion']
      );
      assert.equal(completion.reviews[0].nextAction.owner, 'staff');
      assert.equal(completion.reviews[0].nextAction.canUseDecisionButtons, false);

      const followup = await fetchMode('followup');
      assert.deepEqual(
        followup.reviews.map((item) => item.id),
        ['case-mode-followup']
      );
      assert.equal(followup.reviews[0].workMode, 'followup');
      assert.equal(followup.reviews[0].nextAction.suggestedAction, 'review_followup');
      assert.equal(followup.reviews[0].nextAction.canUseDecisionButtons, false);
      assert.deepEqual(followup.reviews[0].ordinationReadout.followupEscalation, {
        active: true,
        label: 'Behöver läkare',
        at: followup.reviews[0].ordinationReadout.followupEscalation.at,
        by: 'staff-1',
        photos: {
          count: 1,
          latestAt: followup.reviews[0].ordinationReadout.followupEscalation.photos.latestAt,
          href: '/api/v1/staff/customer-photos/patient-case-mode-followup',
          incomingFromPortal: false,
          portalUploadCount: 0,
          reviewedAt: null,
          incomingReviewPending: false,
          reviewAgeHours: null,
          reviewOverdue: false,
          reviewDueWithinHours: 24,
          reviewDetail: null,
        },
        links: followup.reviews[0].ordinationReadout.followupEscalation.links,
        safety:
          'Uppföljningen behöver läkarblick, men skapar ingen ordination och inget kundutskick automatiskt.',
      });
      assert.ok(followup.reviews[0].ordinationReadout.followupEscalation.at);
      assert.ok(followup.reviews[0].ordinationReadout.followupEscalation.photos.latestAt);
      assert.equal(
        followup.reviews[0].ordinationReadout.followupEscalation.links.photos,
        '/api/v1/staff/customer-photos/patient-case-mode-followup'
      );

      const approved = await fetchMode('approved');
      assert.deepEqual(
        approved.reviews.map((item) => item.id),
        ['case-mode-approved']
      );
      assert.deepEqual(approved.reviews[0].ordinationReadout.decisionSummary, {
        status: 'approved',
        label: 'Godkänd ordination',
        tone: 'sage',
        decidedAt: approved.reviews[0].ordinationReadout.decisionSummary.decidedAt,
        decidedBy: 'doctor-1',
        signature: 'Dr Test',
        comment: 'OK',
        auditAction: 'ordination.approved',
        auditReceipt: {
          action: 'ordination.approved',
          storeAction: 'ordination_approved',
          caseId: 'case-mode-approved',
          patientId: 'patient-case-mode-approved',
          tenantId: 'hairtpclinic',
          actor: 'doctor-1',
          actorRole: 'konsult',
          at: approved.reviews[0].ordinationReadout.decisionSummary.auditReceipt.at,
          signature: 'Dr Test',
          immutable: true,
        },
        readOnly: true,
      });
      assert.ok(approved.reviews[0].ordinationReadout.decisionSummary.decidedAt);
      assert.ok(approved.reviews[0].ordinationReadout.decisionSummary.auditReceipt.at);
      assert.deepEqual(
        approved.reviews.map((item) => item.nextAction.suggestedAction),
        ['read_decision']
      );

      const rejected = await fetchMode('rejected');
      assert.deepEqual(rejected.reviews[0].ordinationReadout.decisionSummary, {
        status: 'rejected',
        label: 'Avvisad ordination',
        tone: 'danger',
        decidedAt: rejected.reviews[0].ordinationReadout.decisionSummary.decidedAt,
        decidedBy: 'doctor-1',
        signature: 'Dr Test',
        comment: 'Avvisas',
        auditAction: 'ordination.rejected',
        auditReceipt: {
          action: 'ordination.rejected',
          storeAction: 'ordination_rejected',
          caseId: 'case-mode-rejected',
          patientId: 'patient-case-mode-rejected',
          tenantId: 'hairtpclinic',
          actor: 'doctor-1',
          actorRole: 'konsult',
          at: rejected.reviews[0].ordinationReadout.decisionSummary.auditReceipt.at,
          signature: 'Dr Test',
          immutable: true,
        },
        readOnly: true,
      });

      const invalid = await fetchMode('bananas');
      assert.equal(invalid.mode, 'pending');
      assert.deepEqual(
        invalid.reviews.map((item) => item.id),
        ['case-mode-pending']
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/audit filtrerar läkarkvittens per caseId', async () => {
  let queryArgs = null;
  const ccoAuditLog = {
    query(args) {
      queryArgs = args;
      return [
        {
          ts: '2030-06-29T10:00:00.000Z',
          action: 'ordination.approved',
          actor: { role: 'konsult', userId: 'doctor-1' },
          target: { kind: 'entity', id: 'case-audit-1', tenantId: 'hairtpclinic' },
          result: 'ok',
        },
      ];
    },
  };

  const app = express();
  app.use(
    createStaffPortalRouter({
      ccoAuditLog,
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'owner-1', tenantId: 'hairtpclinic', role: 'owner' };
        next();
      },
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/staff/audit?action=ordination&caseId=case-audit-1&limit=8`,
      { headers: { 'x-cco-role': 'owner' } }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.count, 1);
    assert.deepEqual(queryArgs, {
      limit: 8,
      since: null,
      action: 'ordination',
      targetId: 'case-audit-1',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/v1/staff/ordination-reviews/:id/request-completion skapar komplettering med audit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-ordination-completion-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    await bookingCaseStore.createCase({
      id: 'case-completion-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-completion',
      customerName: 'Komplettering Kund',
      serviceLabel: 'Hårtransplantation DHI',
      handoffChecklist: {
        journalReady: true,
        consentSigned: false,
        paymentSettled: true,
        encounterLinked: true,
      },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'doctor-1', tenantId: 'hairtpclinic', role: 'konsult' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const missingComment = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/ordination-reviews/case-completion-1/request-completion`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
          body: JSON.stringify({ signature: 'Dr Test', comment: '' }),
        }
      );
      assert.equal(missingComment.status, 400);

      const res = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/ordination-reviews/case-completion-1/request-completion`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
          body: JSON.stringify({
            signature: 'Dr Test',
            comment: 'Komplettera samtycke före beslut',
          }),
        }
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.status, 'needs_completion');

      const stored = await bookingCaseStore.getCase('case-completion-1');
      assert.equal(stored.ordinationReview.status, 'needs_completion');
      assert.equal(stored.ordinationReview.comment, 'Komplettera samtycke före beslut');
      assert.ok(stored.history.some((entry) => entry.action === 'ordination_needs_completion'));
      assert.ok(auditEntries.some((entry) => entry.action === 'ordination.completion_requested'));
      assert.ok(
        auditEntries.some(
          (entry) => entry.action === 'cco.booking_case.ordination_needs_completion'
        )
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/notifications exponerar personalens read-only notisfeed', async () => {
  const calls = [];
  const notificationFeedStore = {
    async getFeed(args) {
      calls.push(args);
      return {
        items: [
          {
            id: 'n-1',
            type: 'booking',
            title: 'Bokningsärende: blocked',
            body: 'Väntar på läkargranskning',
            severity: 'warning',
            read: false,
            createdAt: '2030-06-29T08:00:00.000Z',
            actionUrl: '/staff-portal?role=doctor&panel=ordination#ordination-case-1',
            links: {
              staffPortal: '/staff-portal?role=nurse&panel=customers',
              doctorReview: '/staff-portal?role=doctor&panel=ordination#ordination-case-1',
            },
          },
        ],
        summary: {
          total: 1,
          unread: 1,
          actionRequired: 1,
          byType: { booking: 1 },
        },
      };
    },
  };

  const app = express();
  app.use(
    createStaffPortalRouter({
      notificationFeedStore,
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
        next();
      },
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/staff/notifications?limit=8&sinceHours=168`,
      {
        headers: { 'x-cco-role': 'personal' },
      }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'live');
    assert.equal(body.count, 1);
    assert.equal(body.summary.unread, 1);
    assert.equal(body.summary.actionRequired, 1);
    assert.equal(
      body.items[0].actionUrl,
      '/staff-portal?role=doctor&panel=ordination#ordination-case-1'
    );
    assert.equal(body.items[0].links.staffPortal, '/staff-portal?role=nurse&panel=customers');
    assert.equal(calls[0].role, 'personal');
    assert.equal(calls[0].userId, 'staff-1');
    assert.equal(calls[0].limit, 8);
    assert.equal(calls[0].sinceHours, 168);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/v1/staff/work-priorities prioriterar notiser före arbetskö', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-work-priorities-'));
  try {
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
    });
    await bookingCaseStore.createCase({
      id: 'case-priority-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-priority',
      customerName: 'Prioritet Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date().toISOString(),
      handoffChecklist: {
        journalReady: true,
        consentSigned: false,
        paymentSettled: true,
        encounterLinked: true,
      },
    });
    await bookingCaseStore.createCase({
      id: 'case-priority-followup',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-priority-followup',
      customerName: 'Uppföljning Prioritet',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      startsAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await bookingCaseStore.recordStaffAction(
      'case-priority-followup',
      { action: 'followup_needs_doctor' },
      { userId: 'staff-1', role: 'personal' }
    );

    const notificationFeedStore = {
      async getFeed() {
        return {
          items: [
            {
              id: 'n-prio-1',
              type: 'mail',
              title: 'Kundfråga kräver svar',
              body: 'Ny kundfråga i konversationer',
              severity: 'warning',
              read: false,
              createdAt: '2030-06-29T08:00:00.000Z',
              actionUrl: '/staff-portal?role=nurse&panel=customers#thread-1',
            },
          ],
        };
      },
    };

    const app = express();
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        notificationFeedStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/work-priorities`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.count, 3);
      assert.equal(body.summary.notification, 1);
      assert.equal(body.summary.followup, 1);
      assert.equal(body.summary.queue, 1);
      assert.equal(body.items[0].source, 'notification');
      assert.equal(body.items[0].priority, 'urgent');
      assert.equal(body.items[0].actionUrl, '/staff-portal?role=nurse&panel=customers#thread-1');
      assert.equal(body.items[0].nextBestAction.label, 'Öppna kundfrågan');
      assert.equal(
        body.items[0].nextBestAction.href,
        '/staff-portal?role=nurse&panel=customers#thread-1'
      );
      assert.match(body.items[0].nextBestAction.safety, /automatiskt/);
      assert.equal(body.items[0].roleCards.nurse.focus, 'kundkontakt');
      assert.equal(body.items[0].roleCards.admin.badge, 'Kundfråga');
      assert.equal(body.items[0].detail.kind, 'notification');
      assert.equal(body.items[0].detail.status, 'ny');
      assert.equal(body.items[1].source, 'followup');
      assert.equal(body.items[1].priority, 'urgent');
      assert.equal(body.items[1].title, 'Uppföljning Prioritet · Postop dag 7');
      assert.equal(body.items[1].nextBestAction.label, 'Öppna läkarspåret');
      assert.equal(body.items[1].roleCards.nurse.focus, 'uppföljning');
      assert.equal(body.items[1].roleCards.doctor.focus, 'klinisk granskning');
      assert.equal(body.items[1].detail.kind, 'followup');
      assert.equal(body.items[1].detail.caseId, 'case-priority-followup');
      assert.ok(body.items[1].detail.remainingSteps.includes('Behöver läkare'));
      assert.equal(body.items[2].source, 'queue');
      assert.equal(body.items[2].queueItem.id, 'case-priority-1');
      assert.equal(body.items[2].nextBestAction.label, 'Skicka/öppna läkarkö');
      assert.equal(
        body.items[2].nextBestAction.href,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-priority-1'
      );
      assert.equal(body.items[2].roleCards.nurse.focus, 'checklista');
      assert.equal(body.items[2].roleCards.doctor.focus, 'ordination');
      assert.equal(body.items[2].roleCards.doctor.ctaLabel, 'Öppna läkarkö');
      assert.equal(
        body.items[2].roleCards.doctor.href,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-priority-1'
      );
      assert.equal(body.items[2].roleCards.admin.focus, 'handoff');
      assert.equal(body.items[2].detail.kind, 'case');
      assert.equal(body.items[2].detail.customer, 'Prioritet Kund');
      assert.equal(body.items[2].detail.treatment, 'Hårtransplantation DHI');
      assert.deepEqual(body.items[2].detail.missingChecklist, ['consentSigned']);
      assert.deepEqual(
        body.items[2].detail.checklistItems.map((item) => [item.key, item.complete]),
        [
          ['journalReady', true],
          ['consentSigned', false],
          ['paymentSettled', true],
          ['encounterLinked', true],
        ]
      );
      assert.ok(body.items[2].detail.remainingSteps.includes('Ordination väntar'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/staff/daily-work-queue/:id/action sparar personalåtgärder med audit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-queue-action-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    await bookingCaseStore.createCase({
      id: 'case-action-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-action',
      customerName: 'Action Kund',
      serviceLabel: 'Hårtransplantation DHI',
      assignedTo: 'staff-1',
      handoffChecklist: {
        journalReady: false,
        consentSigned: false,
        paymentSettled: true,
        encounterLinked: false,
      },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        bookingCaseStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const markSeen = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/daily-work-queue/case-action-1/action`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ action: 'mark_seen' }),
        }
      );
      assert.equal(markSeen.status, 200);

      const sendDoctor = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/daily-work-queue/case-action-1/action`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ action: 'send_to_doctor' }),
        }
      );
      assert.equal(sendDoctor.status, 200);

      const completeChecklist = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/daily-work-queue/case-action-1/action`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ action: 'complete_checklist', itemKey: 'journalReady' }),
        }
      );
      assert.equal(completeChecklist.status, 200);

      await bookingCaseStore.updateOrdinationReview(
        'case-action-1',
        {
          status: 'needs_completion',
          signature: 'Dr Test',
          comment: 'Komplettera samtycke före beslut',
        },
        { userId: 'doctor-1', role: 'konsult' }
      );

      const queueAfterRequest = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/daily-work-queue`,
        {
          headers: { 'x-cco-role': 'personal' },
        }
      );
      assert.equal(queueAfterRequest.status, 200);
      const queueBody = await queueAfterRequest.json();
      assert.equal(queueBody.items[0].ordinationStatus, 'needs_completion');
      assert.equal(
        queueBody.items[0].completionRequest.comment,
        'Komplettera samtycke före beslut'
      );
      assert.deepEqual(queueBody.items[0].doctorFeedback, {
        status: 'needs_completion',
        label: 'Läkaren begär komplettering',
        tone: 'amber',
        comment: 'Komplettera samtycke före beslut',
        requestedBy: 'doctor-1',
        requestedAt: queueBody.items[0].doctorFeedback.requestedAt,
        signature: 'Dr Test',
        nextStep: 'Komplettera underlaget och markera “Komplettering klar”.',
        completionChecklist: {
          readOnly: true,
          missingCount: 2,
          summary: '2 handoff-punkter behöver säkras innan retur.',
          items: [
            {
              key: 'doctor_comment',
              label: 'Läs läkarens kommentar',
              done: true,
              source: 'doctor_feedback',
            },
            {
              key: 'consentSigned',
              label: 'Samtycken och patientinformation signerade',
              done: false,
              source: 'handoff',
            },
            {
              key: 'encounterLinked',
              label: 'Bokning och patientkort länkade',
              done: false,
              source: 'handoff',
            },
            {
              key: 'return_to_doctor',
              label: 'När underlaget är kompletterat: markera “Komplettering klar”',
              done: false,
              source: 'staff_action',
            },
          ],
        },
        readOnly: true,
      });
      assert.ok(queueBody.items[0].doctorFeedback.requestedAt);

      const resolveCompletion = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/daily-work-queue/case-action-1/action`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
          body: JSON.stringify({ action: 'resolve_completion' }),
        }
      );
      assert.equal(resolveCompletion.status, 200);

      const stored = await bookingCaseStore.getCase('case-action-1');
      assert.equal(stored.staffActions.seenBy, 'staff-1');
      assert.equal(stored.staffActions.sentToDoctorBy, 'staff-1');
      assert.equal(stored.ordinationReview.status, 'pending');
      assert.equal(stored.handoffChecklist.journalReady, true);
      assert.equal(stored.staffActions.completionResolvedBy, 'staff-1');
      assert.ok(stored.history.some((entry) => entry.action === 'staff_mark_seen'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_send_to_doctor'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_complete_checklist'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_resolve_completion'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.mark_seen'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.send_to_doctor'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.complete_checklist'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.resolve_completion'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/staff/cases/:id/assign tilldelar ansvarig personal med audit', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-case-assign-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const authStore = {
      async listTenantMembers(tenantId) {
        assert.equal(tenantId, 'hairtpclinic');
        return [
          {
            user: { id: 'staff-1', email: 'anna@hairtpclinic.com' },
            membership: { id: 'm-1', userId: 'staff-1', role: 'STAFF', status: 'active' },
          },
          {
            user: { id: 'staff-2', email: 'nora@hairtpclinic.com' },
            membership: { id: 'm-2', userId: 'staff-2', role: 'STAFF', status: 'active' },
          },
          {
            user: { id: 'staff-disabled', email: 'old@hairtpclinic.com' },
            membership: {
              id: 'm-3',
              userId: 'staff-disabled',
              role: 'STAFF',
              status: 'disabled',
            },
          },
        ];
      },
    };
    const bookingCaseStore = await createCcoBookingCaseStore({
      filePath: path.join(dir, 'booking-cases.json'),
      auditLog: ccoAuditLog,
    });
    await bookingCaseStore.createCase({
      id: 'case-assign-1',
      tenantId: 'hairtpclinic',
      state: 'confirmed',
      patientId: 'patient-assign',
      customerName: 'Tilldelningskund',
      assignedTo: 'staff-1',
    });

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        authStore,
        bookingCaseStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'owner-1', tenantId: 'hairtpclinic', role: 'owner' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const team = await fetch(`http://127.0.0.1:${port}/api/v1/staff/team`, {
        headers: { 'x-cco-role': 'owner' },
      });
      assert.equal(team.status, 200);
      const teamBody = await team.json();
      assert.equal(teamBody.ok, true);
      assert.equal(teamBody.count, 2);
      assert.deepEqual(
        teamBody.staff.map((item) => item.userId),
        ['staff-1', 'staff-2']
      );

      const assign = await fetch(
        `http://127.0.0.1:${port}/api/v1/staff/cases/case-assign-1/assign`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cco-role': 'owner' },
          body: JSON.stringify({ assignedTo: 'staff-2', note: 'Flyttad till Nora' }),
        }
      );
      assert.equal(assign.status, 200);
      const assignBody = await assign.json();
      assert.equal(assignBody.ok, true);
      assert.equal(assignBody.case.assignedTo, 'staff-2');

      const stored = await bookingCaseStore.getCase('case-assign-1');
      assert.equal(stored.assignedTo, 'staff-2');
      assert.equal(stored.assignment.assignedBy, 'owner-1');
      assert.equal(stored.assignment.note, 'Flyttad till Nora');
      assert.ok(stored.history.some((entry) => entry.action === 'staff_assigned'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.case_assigned'));
      assert.ok(auditEntries.some((entry) => entry.action === 'cco.booking_case.staff_assigned'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/staff/qms/handbook sammanställer OLS och handbok från QMS-store', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-qms-handbook-'));
  try {
    const qmsStore = createQmsStore({ filePath: path.join(dir, 'qms.json') });
    await qmsStore.load();
    qmsStore.createChecklist({
      tenantId: 'hairtpclinic',
      title: 'Preop TP',
      category: 'patient_safety',
      steps: [{ title: 'Friskförsäkran signerad' }],
      createdBy: 'owner-1',
    });
    qmsStore.createProcess({
      tenantId: 'hairtpclinic',
      title: 'Rutin: operationsdag',
      category: 'clinical',
      steps: [{ title: 'Kontrollera ordination' }],
      createdBy: 'owner-1',
    });
    qmsStore.createDocument({
      tenantId: 'hairtpclinic',
      title: 'Personalhandbok',
      category: 'policy',
      content: 'Rutiner',
      approvedBy: 'owner-1',
      createdBy: 'owner-1',
    });
    qmsStore.reportDeviation({
      tenantId: 'hairtpclinic',
      title: 'Testavvikelse',
      description: 'En processavvikelse som ska visas.',
      severity: 'medium',
      category: 'process',
      reportedBy: 'staff-1',
    });
    await qmsStore.persist();

    const app = express();
    app.use(
      createStaffPortalRouter({
        qmsStore,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/qms/handbook`, {
        headers: { 'x-cco-role': 'personal' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.qms.mode, 'live');
      assert.equal(body.qms.summary.activeChecklists, 1);
      assert.equal(body.qms.summary.activeProcesses, 1);
      assert.equal(body.qms.summary.openDeviations, 1);
      assert.ok(body.qms.handbook.documents.some((doc) => doc.title === 'Personalhandbok'));
      assert.deepEqual(
        body.qms.contexts.map((item) => item.key),
        ['followups', 'photo_review', 'ordination', 'qms']
      );
      const followupContext = body.qms.contexts.find((item) => item.key === 'followups');
      assert.equal(followupContext.title, 'Uppföljning');
      assert.ok(followupContext.processes.some((item) => item.title === 'Rutin: operationsdag'));
      const photoContext = body.qms.contexts.find((item) => item.key === 'photo_review');
      assert.ok(photoContext.processes.some((item) => item.title === 'Rutin: operationsdag'));
      const ordinationContext = body.qms.contexts.find((item) => item.key === 'ordination');
      assert.ok(ordinationContext.processes.some((item) => item.title === 'Rutin: operationsdag'));
      const qmsContext = body.qms.contexts.find((item) => item.key === 'qms');
      assert.equal(qmsContext.empty, false);
      assert.ok(body.qms.safety.hitl);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/staff/qms/deviations persisterar avvikelse och audit-loggar', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-qms-deviation-'));
  try {
    const auditEntries = [];
    const ccoAuditLog = {
      append(entry) {
        auditEntries.push(entry);
      },
      query() {
        return auditEntries;
      },
    };
    const qmsStore = createQmsStore({ filePath: path.join(dir, 'qms.json') });
    await qmsStore.load();

    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        qmsStore,
        ccoAuditLog,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'staff-1', tenantId: 'hairtpclinic', role: 'personal' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/qms/deviations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
        body: JSON.stringify({
          kind: 'documentation',
          description: 'Dokumentationsavvikelse som ska in i OLS.',
          severity: 'medium',
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.status, 'reported');
      assert.ok(body.referenceNumber);

      const deviations = qmsStore.listDeviations({ tenantId: 'hairtpclinic' });
      assert.equal(deviations.length, 1);
      assert.equal(deviations[0].reportedBy, 'staff-1');
      assert.equal(deviations[0].category, 'documentation');
      assert.ok(auditEntries.some((entry) => entry.action === 'qms.deviation.reported'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
