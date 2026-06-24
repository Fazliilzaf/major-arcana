const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createOnboardingRouter } = require('../../src/routes/onboarding');

function makeStubStore() {
  const state = { u1: { completed: ['s1'], complete: false } };
  return {
    getStatus: (userId) => ({ userId, steps: state[userId]?.completed || [] }),
    completeStep: async (userId, stepId) => {
      state[userId] = state[userId] || { completed: [] };
      state[userId].completed.push(stepId);
      return { ok: true, userId, stepId };
    },
    resetProgress: async (userId) => {
      state[userId] = { completed: [] };
      return { ok: true, userId, reset: true };
    },
    listIncomplete: () => Object.keys(state).filter((u) => !state[u].complete),
  };
}

async function withServer(store, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createOnboardingRouter({ onboardingStore: store }));
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

test('GET /onboarding/:userId returnerar status', async () => {
  await withServer(makeStubStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/onboarding/u1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.steps, ['s1']);
  });
});

test('POST /onboarding/:userId/step/:stepId markerar steg', async () => {
  await withServer(makeStubStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/onboarding/u1/step/s2`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.stepId, 's2');
  });
});

test('POST /onboarding/:userId/reset nollställer', async () => {
  await withServer(makeStubStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/onboarding/u1/reset`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.reset, true);
  });
});

test('GET /onboarding/admin/incomplete listar ofullständiga (ingen krock med :userId)', async () => {
  await withServer(makeStubStore(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/onboarding/admin/incomplete`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.users));
    assert.ok(body.users.includes('u1'));
  });
});
