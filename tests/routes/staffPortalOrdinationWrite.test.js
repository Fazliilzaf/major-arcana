const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');

async function withStaffServer(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staff-ordination-'));
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
    filePath: path.join(dir, 'cases.json'),
    auditLog: ccoAuditLog,
  });
  const caseRecord = await bookingCaseStore.createCase(
    {
      id: 'case-ordination-1',
      tenantId: 'hairtp-clinic',
      state: 'confirmed',
      customerName: 'Test Kund',
      serviceLabel: 'Hårtransplantation',
      startsAt: '2030-06-29T10:00:00.000Z',
    },
    { role: 'operator', userId: 'ops-1' }
  );

  const app = express();
  app.use(express.json());
  app.use(createStaffPortalRouter({ bookingCaseStore, ccoAuditLog }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run({ baseUrl, bookingCaseStore, auditEntries, caseRecord });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('ordination approve är RBAC-spärrad för personal', async () => {
  await withStaffServer(async ({ baseUrl }) => {
    const res = await fetch(
      `${baseUrl}/api/v1/staff/ordination-reviews/case-ordination-1/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'personal' },
        body: JSON.stringify({ signature: 'Dr Test' }),
      }
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.requiredPermission, 'ordination.approve');
  });
});

test('ordination approve kräver signatur', async () => {
  await withStaffServer(async ({ baseUrl }) => {
    const res = await fetch(
      `${baseUrl}/api/v1/staff/ordination-reviews/case-ordination-1/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
        body: JSON.stringify({ signature: ' ' }),
      }
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Signatur/);
  });
});

test('ordination approve sparar beslut i booking-case och audit-logg', async () => {
  await withStaffServer(async ({ baseUrl, bookingCaseStore, auditEntries }) => {
    const res = await fetch(
      `${baseUrl}/api/v1/staff/ordination-reviews/case-ordination-1/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
        body: JSON.stringify({ signature: 'Dr Test', comment: 'Allmän ordination OK.' }),
      }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'approved');

    const stored = await bookingCaseStore.getCase('case-ordination-1');
    assert.equal(stored.ordinationReview.status, 'approved');
    assert.equal(stored.ordinationReview.signature, 'Dr Test');
    assert.equal(stored.ordinationReview.comment, 'Allmän ordination OK.');
    assert.ok(stored.history.some((entry) => entry.action === 'ordination_approved'));
    assert.ok(auditEntries.some((entry) => entry.action === 'ordination.approved'));
  });
});

test('ordination reject kräver signatur och motivering och sparar beslut', async () => {
  await withStaffServer(async ({ baseUrl, bookingCaseStore, auditEntries }) => {
    const bad = await fetch(`${baseUrl}/api/v1/staff/ordination-reviews/case-ordination-1/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
      body: JSON.stringify({ signature: 'Dr Test', comment: 'nej' }),
    });
    assert.equal(bad.status, 400);

    const res = await fetch(`${baseUrl}/api/v1/staff/ordination-reviews/case-ordination-1/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'konsult' },
      body: JSON.stringify({ signature: 'Dr Test', comment: 'Behöver kompletteras.' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'rejected');

    const stored = await bookingCaseStore.getCase('case-ordination-1');
    assert.equal(stored.ordinationReview.status, 'rejected');
    assert.equal(stored.ordinationReview.signature, 'Dr Test');
    assert.equal(stored.ordinationReview.comment, 'Behöver kompletteras.');
    assert.ok(stored.history.some((entry) => entry.action === 'ordination_rejected'));
    assert.ok(auditEntries.some((entry) => entry.action === 'ordination.rejected'));
  });
});
