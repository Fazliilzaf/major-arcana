const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoAuditRouter } = require('../../src/routes/ccoAudit');

// Stub-RBAC: läser roll från x-test-role-header.
const attachRole = (req, _res, next) => {
  req.cco = { role: req.headers['x-test-role'] || 'system' };
  next();
};
const requireAnyRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.cco?.role)) return res.status(403).json({ error: 'forbidden' });
  next();
};

function makeAuditLog() {
  const appended = [];
  return {
    appended,
    query: () => [{ action: 'x' }],
    stats: () => ({ total: 1 }),
    append: (entry) => {
      appended.push(entry);
      return { traceId: 'trace-1' };
    },
  };
}

async function withServer(ccoAuditLog, run) {
  const app = express();
  app.use('/api/v1', createCcoAuditRouter({ ccoAuditLog, attachRole, requireAnyRole }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /cco-audit med owner → 200 + count/items/stats', async () => {
  await withServer(makeAuditLog(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`, { headers: { 'x-test-role': 'owner' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    assert.equal(body.stats.total, 1);
  });
});

test('GET /cco-audit med fel roll → 403', async () => {
  await withServer(makeAuditLog(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`, { headers: { 'x-test-role': 'staff' } });
    assert.equal(res.status, 403);
  });
});

test('POST /cco-audit loggar med actor.role och returnerar traceId', async () => {
  const log = makeAuditLog();
  await withServer(log, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'system' },
      body: JSON.stringify({ action: 'test.event' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.traceId, 'trace-1');
    assert.equal(log.appended[0].action, 'test.event');
    assert.equal(log.appended[0].actor.role, 'system');
  });
});

// ── F2: audit-gap regression — verifiera gating med RIKTIG ccoRbac-middleware ──

const {
  attachRole: realAttachRole,
  requireAnyRole: realRequireAnyRole,
} = require('../../src/security/ccoRbac');

async function withRealRbacServer(ccoAuditLog, run) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoAuditRouter({
      ccoAuditLog,
      attachRole: realAttachRole,
      requireAnyRole: realRequireAnyRole,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('F2: GET /cco-audit — endast owner/revisor läser (regression)', async () => {
  await withRealRbacServer(makeAuditLog(), async (baseUrl) => {
    // owner + revisor → 200
    for (const role of ['owner', 'revisor']) {
      const res = await fetch(`${baseUrl}/cco-audit`, { headers: { 'x-cco-role': role } });
      assert.equal(res.status, 200, `${role} ska få läsa audit`);
    }
    // operator / konsult / personal → 403
    for (const role of ['operator', 'konsult', 'personal']) {
      const res = await fetch(`${baseUrl}/cco-audit`, { headers: { 'x-cco-role': role } });
      assert.equal(res.status, 403, `${role} ska nekas audit-läsning`);
    }
  });
});

test('F2: GET /cco-audit utan roll (anonym) → 403 (läs-gap stängt)', async () => {
  await withRealRbacServer(makeAuditLog(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`);
    assert.equal(res.status, 403, 'anonym ska aldrig kunna läsa audit-loggen');
  });
});

test('F2: POST /cco-audit anonym → 403 (audit kan inte förgiftas)', async () => {
  const log = makeAuditLog();
  await withRealRbacServer(log, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'fejkad.audit' }),
    });
    assert.equal(res.status, 403, 'anonym write ska avvisas');
    assert.equal(log.appended.length, 0, 'ingen audit-post får skrivas av anonym');
  });
});

test('F2: POST /cco-audit med autentiserad roll → 200 (telemetri fungerar)', async () => {
  const log = makeAuditLog();
  await withRealRbacServer(log, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-audit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
      body: JSON.stringify({ action: 'studio.event' }),
    });
    assert.equal(res.status, 200);
    assert.equal(log.appended.length, 1);
    assert.equal(log.appended[0].actor.role, 'operator');
  });
});
