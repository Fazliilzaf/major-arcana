'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createCcoAuditLog, resolveCcoAuditFilePath } = require('../../src/security/ccoAuditLog');
const { createCcoAuditRouter } = require('../../src/routes/ccoAudit');
const { attachRole, requireAnyRole } = require('../../src/security/ccoRbac');

const BOOKING_ID = 'da2d26af-7c5b-4249-ac63-623d1f1464f4';
const PATIENT_ID = 'cco-active-visit-uat-20260713';
const IDEMPOTENCY_KEY = 'calendar-first-controlled-uat-1784315068393';
const TENANT_ID = 'hair-tp-clinic';

test('controlled UAT create-audit survives restart and matches the booking query scope', async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-audit-persistence-'));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));

  const filePath = resolveCcoAuditFilePath({ stateRoot });
  assert.equal(filePath, path.join(stateRoot, 'cco-audit.jsonl'));

  const beforeRestart = createCcoAuditLog({ stateRoot });
  const actor = { role: 'OWNER', userId: 'controlled-uat-owner' };
  beforeRestart.appendStrict({
    ts: '2026-07-17T19:04:28.393Z',
    action: 'bookings.create_requested',
    actor,
    target: { kind: 'booking', id: IDEMPOTENCY_KEY, tenantId: TENANT_ID },
    result: 'ok',
    detail: { patientId: PATIENT_ID },
  });
  beforeRestart.appendStrict({
    ts: '2026-07-17T19:04:28.394Z',
    action: 'bookings.create_committed',
    actor,
    target: { kind: 'booking', id: BOOKING_ID, tenantId: TENANT_ID },
    result: 'ok',
    detail: { patientId: PATIENT_ID, idempotencyKey: IDEMPOTENCY_KEY },
  });

  const afterRestart = createCcoAuditLog({ stateRoot });
  const committed = afterRestart.query({
    action: 'bookings.create_committed',
    targetId: BOOKING_ID,
  });
  const requested = afterRestart.query({
    action: 'bookings.create_requested',
    targetId: IDEMPOTENCY_KEY,
  });

  assert.equal(committed.length, 1);
  assert.equal(requested.length, 1);
  assert.equal(committed[0].target.tenantId, TENANT_ID);
  assert.equal(committed[0].detail.patientId, PATIENT_ID);
  assert.equal(committed[0].actor.role, 'OWNER');
  assert.equal(requested[0].target.tenantId, TENANT_ID);
  assert.equal(requested[0].detail.patientId, PATIENT_ID);

  const app = express();
  app.use(
    '/api/v1',
    createCcoAuditRouter({
      ccoAuditLog: afterRestart,
      requireAuthenticated: (req, _res, next) => {
        req.auth = { role: 'OWNER', userId: actor.userId, tenantId: TENANT_ID };
        next();
      },
      attachRole,
      requireAnyRole,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/v1/cco-audit/booking/${BOOKING_ID}?patientId=${PATIENT_ID}`
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.readOnly, true);
  assert.equal(payload.zeroWrites, true);
  assert.deepEqual(
    payload.items.map((item) => item.action),
    ['bookings.create_requested', 'bookings.create_committed']
  );
});

test('production server mounts CCO audit on configured persistent stateRoot', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
  assert.match(
    serverSource,
    /ccoAuditLog\s*=\s*createCcoAuditLog\(\{\s*stateRoot:\s*config\.stateRoot,?\s*\}\)/
  );
  assert.doesNotMatch(
    serverSource,
    /createCcoAuditLog\(\{\s*filePath:\s*path\.join\(__dirname,\s*'data',\s*'cco-audit\.jsonl'\)/
  );
});
