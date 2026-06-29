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
      assert.equal(body.count, 2);
      assert.equal(body.summary.notification, 1);
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
      assert.equal(body.items[1].source, 'queue');
      assert.equal(body.items[1].queueItem.id, 'case-priority-1');
      assert.equal(body.items[1].nextBestAction.label, 'Skicka/öppna läkarkö');
      assert.equal(
        body.items[1].nextBestAction.href,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-priority-1'
      );
      assert.equal(body.items[1].roleCards.nurse.focus, 'checklista');
      assert.equal(body.items[1].roleCards.doctor.focus, 'ordination');
      assert.equal(body.items[1].roleCards.doctor.ctaLabel, 'Öppna läkarkö');
      assert.equal(
        body.items[1].roleCards.doctor.href,
        '/staff-portal?role=doctor&panel=ordination#ordination-case-priority-1'
      );
      assert.equal(body.items[1].roleCards.admin.focus, 'handoff');
      assert.equal(body.items[1].detail.kind, 'case');
      assert.equal(body.items[1].detail.customer, 'Prioritet Kund');
      assert.equal(body.items[1].detail.treatment, 'Hårtransplantation DHI');
      assert.deepEqual(body.items[1].detail.missingChecklist, ['consentSigned']);
      assert.deepEqual(
        body.items[1].detail.checklistItems.map((item) => [item.key, item.complete]),
        [
          ['journalReady', true],
          ['consentSigned', false],
          ['paymentSettled', true],
          ['encounterLinked', true],
        ]
      );
      assert.ok(body.items[1].detail.remainingSteps.includes('Ordination väntar'));
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

      const stored = await bookingCaseStore.getCase('case-action-1');
      assert.equal(stored.staffActions.seenBy, 'staff-1');
      assert.equal(stored.staffActions.sentToDoctorBy, 'staff-1');
      assert.equal(stored.ordinationReview.status, 'pending');
      assert.equal(stored.handoffChecklist.journalReady, true);
      assert.ok(stored.history.some((entry) => entry.action === 'staff_mark_seen'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_send_to_doctor'));
      assert.ok(stored.history.some((entry) => entry.action === 'staff_complete_checklist'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.mark_seen'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.send_to_doctor'));
      assert.ok(auditEntries.some((entry) => entry.action === 'staff_portal.complete_checklist'));
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
