const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createConversationRouter } = require('../../src/routes/conversation');

function makeStore(seed = {}) {
  const store = { ...seed };
  return {
    getConversation: async (id) => store[id] || null,
    ensureConversation: async (id, brand) => {
      if (store[id]) store[id].brand = brand;
    },
    deleteConversation: async (id) => {
      const existed = Boolean(store[id]);
      delete store[id];
      return existed;
    },
  };
}

async function withServer({ memoryStore, resolveBrand }, run) {
  const app = express();
  app.use(createConversationRouter({ memoryStore, resolveBrand }));
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

test('GET /conversation/:id returnerar konversation', async () => {
  const memoryStore = makeStore({ c1: { id: 'c1', summary: 's', messages: [{ t: 1 }] } });
  await withServer({ memoryStore, resolveBrand: () => '' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/conversation/c1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.conversationId, 'c1');
    assert.equal(body.messages.length, 1);
  });
});

test('GET /conversation/:id okänd → 404', async () => {
  await withServer({ memoryStore: makeStore(), resolveBrand: () => '' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/conversation/nope`);
    assert.equal(res.status, 404);
  });
});

test('GET /conversation/:id med fel brand → 404', async () => {
  const memoryStore = makeStore({ c1: { id: 'c1', brand: 'A' } });
  await withServer({ memoryStore, resolveBrand: () => 'B' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/conversation/c1`);
    assert.equal(res.status, 404);
  });
});

test('DELETE /conversation/:id raderar', async () => {
  const memoryStore = makeStore({ c1: { id: 'c1' } });
  await withServer({ memoryStore, resolveBrand: () => '' }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/conversation/c1`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const again = await fetch(`${baseUrl}/conversation/c1`, { method: 'DELETE' });
    assert.equal((await again.json()).ok, false);
  });
});
