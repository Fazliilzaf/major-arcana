'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCcoPhotoReviewRouter } = require('../../src/routes/ccoPhotoReview');

const denyAuth = (req, res) => res.status(401).json({ error: 'Inloggning krävs.' });
const attachRole = (req, res, next) => next();
const allowPerm = () => (req, res, next) => next();
const resolveStores = async () => ({ assetStore: {}, reviewQueueStore: {} });

test('photo-review router refuses to mount without requireCcoAuthenticated', () => {
  assert.throws(
    () => createCcoPhotoReviewRouter({ resolveStores, attachRole, requirePermission: allowPerm }),
    /requireCcoAuthenticated/
  );
});

test('anonymous GET photo-review/summary is rejected (401), patient photos protected', async () => {
  let handlerRan = false;
  const requirePermission = () => (req, res, next) => {
    handlerRan = true;
    next();
  };
  const app = express();
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores,
      requireCcoAuthenticated: denyAuth,
      attachRole,
      requirePermission,
    })
  );
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1/cco/photo-review/summary`);
    assert.equal(r.status, 401, 'anonymous photo-review must be 401');
    assert.equal(handlerRan, false, 'router-level gate must block before per-route middleware');
  } finally {
    srv.close();
  }
});
