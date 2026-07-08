'use strict';

/* Portal-adoptionsmätning (följdsteg). Aggregator + endpoint. Verifierar volym,
 * engagemang, nudge-konvertering och RBAC (analytics.read_team). */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { buildPortalMetrics } = require('../../src/ops/ccoPortalMetrics');
const { createCcoPortalMetricsRouter } = require('../../src/routes/ccoPortalMetrics');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');

function tmp(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-metrics-'));
  return path.join(dir, n);
}

async function seededStores() {
  const msg = await createCcoPortalMessageStore({ filePath: tmp('m.json') });
  const nudge = await createCcoPortalNudgeStore({ filePath: tmp('n.json') });
  const access = await createCcoPortalAccessStore({ filePath: tmp('a.json') });
  // Kund A: patient skrev in + klinik svarade (engagerad)
  await msg.appendMessage({ tenantId: 't', customerId: 'A', direction: 'inbound', body: 'hej' });
  await msg.appendMessage({ tenantId: 't', customerId: 'A', direction: 'outbound', body: 'svar' });
  // Kund B: bara klinik-utskick (ej engagerad patient)
  await msg.appendMessage({ tenantId: 't', customerId: 'B', direction: 'outbound', body: 'info' });
  // Två nudgade kunder
  await nudge.recordNudge({ tenantId: 't', customerId: 'A' });
  await nudge.recordNudge({ tenantId: 't', customerId: 'C' });
  // Två tokens, en återkallad
  await access.issueToken({ tenantId: 't', customerId: 'A' });
  await access.issueToken({ tenantId: 't', customerId: 'B' });
  await access.revokeToken({ tenantId: 't', customerId: 'B' });
  return { msg, nudge, access };
}

test('aggregatorn räknar volym, engagemang och nudge-konvertering', async () => {
  const { msg, nudge, access } = await seededStores();
  const m = buildPortalMetrics({
    portalMessageStore: msg,
    portalNudgeStore: nudge,
    portalAccessStore: access,
  });
  assert.equal(m.messages.inbound, 1);
  assert.equal(m.messages.outbound, 2);
  assert.equal(m.messages.total, 3);
  assert.equal(m.messages.customers, 2);
  assert.equal(m.messages.patientsEngaged, 1); // bara A skrev inbound
  assert.equal(m.nudges.prepared, 2);
  assert.equal(m.access.total, 2);
  assert.equal(m.access.active, 1);
  assert.equal(m.access.revoked, 1);
  assert.equal(m.derived.estimatedSmsAvoided, 3);
  assert.equal(m.derived.nudgeConversion, 0.5); // 1 engagerad / 2 nudgade
});

test('aggregatorn tål helt tomma/saknade stores', () => {
  const m = buildPortalMetrics({});
  assert.equal(m.messages.total, 0);
  assert.equal(m.nudges.prepared, 0);
  assert.equal(m.derived.nudgeConversion, null); // ingen division med noll
});

function req(app, method, p, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const r = http.request({ port, path: p, method, headers }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: b });
        });
      });
      r.on('error', (e) => {
        server.close();
        reject(e);
      });
      r.end();
    });
  });
}

async function buildApp() {
  const app = express();
  app.use(
    '/api/v1',
    createCcoPortalMetricsRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 't' };
        n();
      },
    })
  );
  const { msg, nudge, access } = await seededStores();
  app.locals.ccoPortalMessageStore = msg;
  app.locals.ccoPortalNudgeStore = nudge;
  app.locals.ccoPortalAccessStore = access;
  return app;
}

test('GET portal-metrics → 200 för behörig roll', async () => {
  const app = await buildApp();
  const res = await req(app, 'GET', '/api/v1/cco/runtime/portal-metrics', {
    headers: { 'x-cco-role': 'owner' },
  });
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.ok, true);
  assert.equal(json.metrics.messages.total, 3);
  assert.ok(json.metrics.generatedAt);
});

test('obehörig roll (personal) blockeras', async () => {
  const app = await buildApp();
  const res = await req(app, 'GET', '/api/v1/cco/runtime/portal-metrics', {
    headers: { 'x-cco-role': 'personal' },
  });
  assert.equal(res.status, 403);
});
