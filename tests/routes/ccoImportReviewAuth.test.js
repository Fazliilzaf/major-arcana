'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCcoImportReviewReadRouter } = require('../../src/routes/ccoImportReviewRead');

const REPO = require('node:path').join(__dirname, '../..');

test('import-review router refuses to mount without auth helpers', () => {
  assert.throws(
    () => createCcoImportReviewReadRouter({ projectRoot: REPO }),
    /kräver attachRole \+ requirePermission/
  );
});

test('GET import-review/summary is auth-gated (permission middleware runs first)', async () => {
  const app = express();
  let permChecked = null;
  const attachRole = (req, res, next) => next();
  const requirePermission = (perm) => (req, res) => {
    permChecked = perm;
    res.status(401).json({ error: 'Inloggning krävs.' });
  };
  app.use(
    '/api/v1/ops',
    createCcoImportReviewReadRouter({ projectRoot: REPO, attachRole, requirePermission })
  );
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1/ops/cco/import-review/summary`);
    assert.equal(r.status, 401, 'unauthenticated summary must be blocked');
    assert.equal(permChecked, 'asset.read', 'summary must require asset.read');
  } finally {
    srv.close();
  }
});

test('GET import-review/queue is auth-gated', async () => {
  const app = express();
  const attachRole = (req, res, next) => next();
  const requirePermission = () => (req, res) =>
    res.status(401).json({ error: 'Inloggning krävs.' });
  app.use(
    '/api/v1/ops',
    createCcoImportReviewReadRouter({ projectRoot: REPO, attachRole, requirePermission })
  );
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1/ops/cco/import-review/queue`);
    assert.equal(r.status, 401);
  } finally {
    srv.close();
  }
});
