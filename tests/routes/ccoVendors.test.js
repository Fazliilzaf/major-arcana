const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoVendorsRouter } = require('../../src/routes/ccoVendors');

const attachRole = (req, _res, next) => {
  req.role = { role: req.headers['x-test-role'] || 'staff', userId: 'u1' };
  next();
};
const requireAnyRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.role?.role)) return res.status(403).json({ error: 'forbidden' });
  next();
};

function makeStore() {
  const calls = [];
  const rec = (name) => (arg) => {
    calls.push({ name, arg });
    return { ok: true, name };
  };
  return {
    calls,
    listAll: () => [{ id: 'v1' }],
    listNeedsReview: () => [],
    listLegacyExit: () => [],
    exportRegister: () => ({ exported: true }),
    getById: (id) => (id === 'v1' ? { id: 'v1' } : null),
    createVendor: async (...a) => rec('createVendor')(a),
    updateVendor: async (...a) => rec('updateVendor')(a),
    markDpaReviewed: async (a) => rec('markDpaReviewed')(a),
    markUnderbilaga1Completed: async (a) => rec('markUnderbilaga1Completed')(a),
    addSubprocessor: async (a) => rec('addSubprocessor')(a),
    markLegacyExit: async (a) => rec('markLegacyExit')(a),
  };
}

async function withServer(store, run) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoVendorsRouter({
      store,
      attachRole,
      requireAnyRole,
      jsonParser: express.json({ limit: '64kb' }),
    })
  );
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

const owner = { 'x-test-role': 'owner' };

test('GET /cco-vendors → 200 med register-vyer', async () => {
  await withServer(makeStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-vendors`, { headers: owner });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.vendors.length, 1);
  });
});

test('GET /cco-vendors/export fångas EJ av /:id', async () => {
  await withServer(makeStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-vendors/export`, { headers: owner });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).exported, true);
  });
});

test('GET /cco-vendors/:id okänd → 404', async () => {
  await withServer(makeStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-vendors/nope`, { headers: owner });
    assert.equal(res.status, 404);
  });
});

test('RBAC: fel roll → 403', async () => {
  await withServer(makeStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-vendors`, { headers: { 'x-test-role': 'staff' } });
    assert.equal(res.status, 403);
  });
});

test('POST /cco-vendors/:id/legacy-exit delegerar till store', async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-vendors/v1/legacy-exit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...owner },
      body: JSON.stringify({ reason: 'x' }),
    });
    assert.equal(res.status, 200);
    assert.ok(store.calls.some((c) => c.name === 'markLegacyExit' && c.arg.vendorId === 'v1'));
  });
});
