const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createDocsRouter } = require('../../src/routes/docs');

async function withServer(run) {
  const app = express();
  app.use('/api/v1', createDocsRouter());
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

test('GET /docs/sections returnerar ok + sections-array', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/docs/sections`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.sections));
  });
});

test('GET /docs/content med ogiltig path → 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/docs/content?path=`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid_path');
  });
});

test('GET /docs/section/:sectionId okänd sektion → 404', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/docs/section/__finns_ej__`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'section_not_found');
  });
});

test('GET /docs/library returnerar ok', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/docs/library`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});
