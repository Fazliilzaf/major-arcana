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
    // Kroppen konsumeras även om testet bara bryr sig om statuskoden. Lämnar
    // man den oläst rivs socketen av srv.close() nedan medan svaret ännu
    // strömmar — samma rotorsak som flakigheten i drive-import-review (#1508).
    await r.text();
    assert.equal(r.status, 401, 'anonymous photo-review must be 401');
    assert.equal(handlerRan, false, 'router-level gate must block before per-route middleware');
  } finally {
    // ORD-245 — stängningen MÅSTE inväntas. server.close() är asynkront:
    // lyssnaren slutar ta emot nya anslutningar direkt, men släpper inte
    // porten förrän händelseloopen kört klart. Ett test som går vidare utan
    // att vänta lämnar handtaget öppet, och i en svit som kör tvåhundra
    // filer parallellt ackumuleras de.
    const stangd = new Promise((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
    await stangd;
  }
});

test('photo-review auth does not intercept the Graph mail webhook', async () => {
  const app = express();
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores,
      requireCcoAuthenticated: denyAuth,
      attachRole,
      requirePermission: allowPerm,
    })
  );
  app.post('/api/v1/cco/mail-ingestion/graph/webhook', (req, res) => {
    res
      .type('text/plain')
      .status(200)
      .send(String(req.query.validationToken || ''));
  });

  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco/mail-ingestion/graph/webhook?validationToken=graph-proof`,
      { method: 'POST' }
    );
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'graph-proof');
  } finally {
    const stangd = new Promise((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
    if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
    await stangd;
  }
});
