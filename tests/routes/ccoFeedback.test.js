const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCcoFeedbackRouter } = require('../../src/routes/ccoFeedback');

const passThroughAuth = (_req, _res, next) => next();

async function withServer(feedbackFile, run) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoFeedbackRouter({ feedbackFile, requireCcoAuthenticated: passThroughAuth })
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

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcana-feedback-'));
  return path.join(dir, 'cco-feedback.jsonl');
}

test('POST /cco-feedback sparar entry och GET läser tillbaka', async () => {
  const feedbackFile = tmpFile();
  await withServer(feedbackFile, async (baseUrl) => {
    const post = await fetch(`${baseUrl}/cco-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hej' }),
    });
    assert.equal(post.status, 200);
    assert.equal((await post.json()).ok, true);

    const get = await fetch(`${baseUrl}/cco-feedback`);
    assert.equal(get.status, 200);
    const body = await get.json();
    assert.equal(body.count, 1);
    assert.equal(body.items[0].text, 'hej');
    assert.ok(body.items[0].receivedAt);
  });
});

test('POST /cco-feedback utan text → 400', async () => {
  const feedbackFile = tmpFile();
  await withServer(feedbackFile, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nope: 1 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'text required');
  });
});

test('GET /cco-feedback utan fil → tom lista', async () => {
  const feedbackFile = tmpFile();
  await withServer(feedbackFile, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-feedback`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 0);
    assert.deepEqual(body.items, []);
  });
});
