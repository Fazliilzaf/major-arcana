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
