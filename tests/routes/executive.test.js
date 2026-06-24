const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createExecutiveRouter } = require('../../src/routes/executive');

function makeStubFeed() {
  const entries = [{ id: 'e1', severity: 'high', agent: 'CCO', resolved: false }];
  return {
    list: () => entries.filter((e) => !e.resolved),
    getSummary: () => ({
      total: entries.length,
      byAgent: { CCO: 1 },
      lastEntryByAgent: { CCO: 'e1' },
    }),
    resolve: ({ entryId }) => {
      const e = entries.find((x) => x.id === entryId);
      if (!e) return null;
      e.resolved = true;
      return e;
    },
  };
}

async function withServer(feed, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createExecutiveRouter({ getFeed: () => feed }));
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

test('GET /executive/feed returnerar entries + summary', async () => {
  await withServer(makeStubFeed(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/executive/feed`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.entries.length, 1);
    assert.equal(body.summary.total, 1);
  });
});

test('GET /executive/feed/summary returnerar summary', async () => {
  await withServer(makeStubFeed(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/executive/feed/summary`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.total, 1);
  });
});

test('POST /executive/feed/:entryId/resolve löser entry, 404 för okänd', async () => {
  await withServer(makeStubFeed(), async (baseUrl) => {
    const ok = await fetch(`${baseUrl}/executive/feed/e1/resolve`, { method: 'POST' });
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.entry.id, 'e1');

    const missing = await fetch(`${baseUrl}/executive/feed/nope/resolve`, { method: 'POST' });
    assert.equal(missing.status, 404);
  });
});

test('GET /executive/agents/status listar agenter med status', async () => {
  await withServer(makeStubFeed(), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/executive/agents/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    const cco = body.agents.find((a) => a.name === 'CCO');
    assert.equal(cco.status, 'action_required');
  });
});

test('getFeed läses per request (omtilldelning syns)', async () => {
  let feed = makeStubFeed();
  const app = express();
  app.use('/api/v1', createExecutiveRouter({ getFeed: () => feed }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    // Byt ut feeden (simulerar persistent-feed-omtilldelningen i server.js)
    feed = { list: () => [], getSummary: () => ({ total: 0, byAgent: {} }), resolve: () => null };
    const res = await fetch(`${baseUrl}/executive/feed`);
    const body = await res.json();
    assert.equal(body.entries.length, 0);
    assert.equal(body.summary.total, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
