'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCcoImportReviewReadRouter } = require('../../src/routes/ccoImportReviewRead');

const REPO = require('node:path').join(__dirname, '../..');

// Stubs som efterliknar produktionens auth-middleware.
const denyAuth = (req, res) => res.status(401).json({ error: 'Inloggning krävs.' });
const passAuth = (req, res, next) => next();
const attachRole = (req, res, next) => next();
const allowPerm = () => (req, res, next) => next();

function mount({ requireCcoAuthenticated, requirePermission = allowPerm }) {
  const app = express();
  app.use(
    '/api/v1/ops',
    createCcoImportReviewReadRouter({
      projectRoot: REPO,
      requireCcoAuthenticated,
      attachRole,
      requirePermission,
    })
  );
  return app;
}

async function get(app, path) {
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    // Kroppen läses innan servern stängs — se kommentaren i
    // ccoDriveImportReviewRead.test.js. Att returnera svaret och stänga i
    // finally river socketen medan anroparen fortfarande läser.
    const text = await res.text();
    return {
      status: res.status,
      async json() {
        return JSON.parse(text);
      },
      async text() {
        return text;
      },
    };
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
}

test('router refuses to mount without requireCcoAuthenticated', () => {
  assert.throws(
    () =>
      createCcoImportReviewReadRouter({
        projectRoot: REPO,
        attachRole,
        requirePermission: allowPerm,
      }),
    /requireCcoAuthenticated/
  );
});

test('anonymous GET summary is rejected (401), handler never runs', async () => {
  let handlerRan = false;
  const requirePermission = () => (req, res, next) => {
    handlerRan = true;
    next();
  };
  const app = mount({ requireCcoAuthenticated: denyAuth, requirePermission });
  const r = await get(app, '/api/v1/ops/cco/import-review/summary');
  assert.equal(r.status, 401, 'anonymous summary must be 401, never 200');
  assert.equal(handlerRan, false, 'permission/handler must not run for anonymous');
});

test('anonymous GET queue is rejected (401)', async () => {
  const app = mount({ requireCcoAuthenticated: denyAuth });
  const r = await get(app, '/api/v1/ops/cco/import-review/queue?limit=1');
  assert.equal(r.status, 401);
});

test('anonymous GET canary-status is rejected (401)', async () => {
  const app = mount({ requireCcoAuthenticated: denyAuth });
  const r = await get(app, '/api/v1/ops/cco/import-review/canary-status');
  assert.equal(r.status, 401);
});

test('authenticated + permitted GET summary passes the auth chain', async () => {
  const app = mount({ requireCcoAuthenticated: passAuth });
  const r = await get(app, '/api/v1/ops/cco/import-review/summary');
  assert.notEqual(r.status, 401, 'authenticated owner/operator must not be blocked');
});
