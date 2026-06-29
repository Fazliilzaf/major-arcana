const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');

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
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
