const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');

async function withServer(run) {
  const app = express();
  app.use(createStaffPortalRouter());
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

test('GET /api/v1/staff/documents?filler=staff läser katalogens types-array', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/staff/documents?filler=staff`, {
      headers: { 'x-cco-role': 'personal' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.documents), true);
    assert.ok(body.documents.length > 0);
    assert.equal(
      body.documents.every((doc) => doc.filler === 'staff'),
      true
    );
  });
});
