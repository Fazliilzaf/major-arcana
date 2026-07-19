'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createOpsAuthStoreArchiveRouter } = require('../../src/routes/opsAuthStoreArchive');

const silent = { warn() {}, error() {} };

function makeApp({ role = 'owner' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-arch-'));
  const authStorePath = path.join(dir, 'auth.json');
  fs.writeFileSync(authStorePath, JSON.stringify({ auditEvents: [{ a: 1 }, { a: 2 }] }));
  const app = express();
  const passthrough = (req, res, next) => next();
  const requireAnyRole = (roles) => (req, res, next) =>
    roles.includes(role) ? next() : res.status(403).json({ error: 'forbidden' });
  app.use(
    '/api/v1/ops',
    createOpsAuthStoreArchiveRouter({
      config: { authStorePath },
      requireCcoAuthenticated: passthrough,
      attachRole: passthrough,
      requireAnyRole,
      auditLog: null,
      logger: silent,
    })
  );
  return { app, authStorePath };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1/ops`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('archive-status: räknar events, listar arkiv, ser bak-fil', async () => {
  const { app, authStorePath } = makeApp();
  fs.writeFileSync(`${authStorePath}.archive-202607.jsonl`, '{"kind":"auditEvent"}\n{"kind":"auditEvent"}\n');
  fs.writeFileSync(`${authStorePath}.oversize.bak`, 'x'.repeat(100));
  await withServer(app, async (base) => {
    const body = await (await fetch(`${base}/auth-store/archive-status`)).json();
    assert.equal(body.auditEventsCount, 2);
    assert.equal(body.archives.length, 1);
    assert.equal(body.archives[0].lineCount, 2);
    assert.equal(body.oversizeBak.exists, true);
    assert.equal(body.oversizeBak.sizeBytes, 100);
  });
});

test('delete oversize-bak: fail-closed utan arkiv med innehåll', async () => {
  const { app, authStorePath } = makeApp();
  fs.writeFileSync(`${authStorePath}.oversize.bak`, 'x');
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/auth-store/oversize-bak`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    assert.equal(fs.existsSync(`${authStorePath}.oversize.bak`), true);
  });
});

test('delete oversize-bak: raderar när verifierat arkiv finns', async () => {
  const { app, authStorePath } = makeApp();
  fs.writeFileSync(`${authStorePath}.archive-202607.jsonl`, '{"kind":"auditEvent"}\n');
  fs.writeFileSync(`${authStorePath}.oversize.bak`, 'x'.repeat(50));
  await withServer(app, async (base) => {
    const body = await (await fetch(`${base}/auth-store/oversize-bak`, { method: 'DELETE' })).json();
    assert.equal(body.deleted, true);
    assert.equal(body.freedBytes, 50);
    assert.equal(fs.existsSync(`${authStorePath}.oversize.bak`), false);
  });
});

test('delete: redan borta → ok utan fel', async () => {
  const { app } = makeApp();
  await withServer(app, async (base) => {
    const body = await (await fetch(`${base}/auth-store/oversize-bak`, { method: 'DELETE' })).json();
    assert.equal(body.deleted, false);
    assert.equal(body.reason, 'already_gone');
  });
});

test('icke-owner → 403', async () => {
  const { app } = makeApp({ role: 'operator' });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/auth-store/archive-status`);
    assert.equal(res.status, 403);
  });
});
