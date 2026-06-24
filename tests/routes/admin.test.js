const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createAdminRouter } = require('../../src/routes/admin');

async function withServer(run) {
  let adminHtmlCalls = 0;
  const sendAdminHtml = (res) => {
    adminHtmlCalls += 1;
    res.type('html').send('<html>admin</html>');
  };
  const app = express();
  app.use(createAdminRouter({ sendAdminHtml }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl, () => adminHtmlCalls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function loc(baseUrl, p) {
  const res = await fetch(`${baseUrl}${p}`, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}

test('shell-routes anropar sendAdminHtml', async () => {
  await withServer(async (baseUrl, calls) => {
    for (const p of ['/admin', '/admin.html', '/unanswered']) {
      const res = await fetch(`${baseUrl}${p}`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /admin/);
    }
    assert.equal(calls(), 3);
  });
});

test('alias-redirects pekar rätt', async () => {
  await withServer(async (baseUrl) => {
    assert.deepEqual(await loc(baseUrl, '/admin/cmo/connectors'), {
      status: 302,
      location: '/admin#cmo-connectors',
    });
    assert.deepEqual(await loc(baseUrl, '/admin/cmo'), { status: 302, location: '/admin#cmo' });
    assert.deepEqual(await loc(baseUrl, '/cco'), { status: 302, location: '/admin#cco' });
    assert.deepEqual(await loc(baseUrl, '/ccp'), { status: 302, location: '/admin#cco' });
    assert.deepEqual(await loc(baseUrl, '/admin/cco'), { status: 302, location: '/admin#cco' });
    assert.deepEqual(await loc(baseUrl, '/admin/unanswered'), {
      status: 302,
      location: '/unanswered',
    });
  });
});

test('/cco bevarar query-strängen i redirect', async () => {
  await withServer(async (baseUrl) => {
    assert.deepEqual(await loc(baseUrl, '/cco?tab=x'), {
      status: 302,
      location: '/admin?tab=x#cco',
    });
  });
});
