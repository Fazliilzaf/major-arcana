const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createDiagRouter } = require('../../src/routes/diag');

async function withServer({ config, runtimeState }, run) {
  const app = express();
  app.use('/api/v1', createDiagRouter({ config, runtimeState }));
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

test('GET /_diag/env returnerar ok + env + resolved från config', async () => {
  const config = { stateRoot: '/tmp/state', aiProvider: 'fallback', staffJournalOpenAccess: false };
  await withServer({ config, runtimeState: {} }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/env`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.resolved.stateRoot, '/tmp/state');
    assert.equal(body.resolved.aiProvider, 'fallback');
    assert.ok('ARCANA_DEFAULT_TENANT' in body.env);
    assert.equal(body.nodeVersion, process.version);
  });
});

test('GET /_diag/version speglar runtimeState.startedAt', async () => {
  const runtimeState = { startedAt: '2026-06-24T00:00:00Z' };
  await withServer({ config: {}, runtimeState }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.serverStartedAt, '2026-06-24T00:00:00Z');
    assert.ok(Array.isArray(body.fixes));
  });
});
