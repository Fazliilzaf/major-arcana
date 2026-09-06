'use strict';

/**
 * P1-005 — Remaining Client-Controlled Tenant Override · CCO Comm Draft.
 *
 * Route-nivå-tester (adversarial) som falsifierar client-first tenant på
 * utkast-ytan: en client-styrd `tenantId` (body/query) är en ASSERTION som
 * måste canonicalisera till den autentiserade tenanten — annars 403 före
 * någon draft-skrivning/läsning. Header-tenant (`x-cco-tenant`, `x-tenant-id`)
 * är aldrig auktoritet.
 *
 * T-001, T-002, T-003, T-005, T-006, T-007, T-008, T-009, T-010, T-011,
 * T-012, T-016, T-017, T-018, T-024.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

async function withServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-p1-005-draft-'));
  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: {
        ccoCommDraftStorePath: path.join(tempDir, 'cco-comm-draft.json'),
        buildVersion: 'test',
      },
      // Injicerad auth: tenant/roll styrs av headers så enskilda anrop kan
      // agera olika aktörer. x-tenant simulerar den AUTENTISERADE tenanten
      // (motsvarar req.auth.tenantId från riktig auth-middleware).
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: req.headers['x-tenant'] || 'hair-tp-clinic',
          userId: req.headers['x-user'] || 'u1',
          role: req.headers['x-role'] || 'owner',
        };
        next();
      },
      commDraftStore: null,
      executionGateway: null,
      openai: null,
      auditLog: null,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl, tempDir);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(baseUrl, method, route, { tenant, body, extraHeaders = {} } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': 'owner', ...extraHeaders };
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

test('T-001: autentiserad Hair TP + ingen client-tenant → draft under Hair TP', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.draft.tenantId, 'hair-tp-clinic');
  });
});

test('T-002: autentiserad Curatiio + ingen client-tenant → draft under Curatiio', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'curatiio',
      body: { customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.draft.tenantId, 'curatiio');
  });
});

test('T-003: Hair TP-auth + body tenantId=curatiio → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'curatiio', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 403);
  });
});

test('T-005: Curatiio-auth + body tenantId=hair-tp-clinic → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'curatiio',
      body: { tenantId: 'hair-tp-clinic', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 403);
  });
});

test('T-006: Hair TP-auth + alias body tenantId=hairtpclinic → tillåten, canonical tenant', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'hairtpclinic', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 201);
    // Effective tenant är den AUTHENTISERADE canonical tenanten, aldrig raw alias.
    assert.equal(res.json.draft.tenantId, 'hair-tp-clinic');
  });
});

test('T-007: malformed tenant (hairtp) fail closed → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'hairtp', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 403);
  });
});

test('T-008: okänd främmande tenant fail closed → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'acme-corp', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 403);
  });
});

test('T-009: body+query-konflikt kan inte välja främmande tenant → 403', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(
      baseUrl,
      'POST',
      '/cco-comm/drafts?tenantId=hair-tp-clinic',
      {
        tenant: 'hair-tp-clinic',
        body: { tenantId: 'curatiio', customerId: 'c1', body: 'hej' },
      }
    );
    assert.equal(res.status, 403);
  });
});

test('T-010: x-cco-tenant header kan inte välja tenant', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { customerId: 'c1', body: 'hej' },
      extraHeaders: { 'x-cco-tenant': 'curatiio' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.draft.tenantId, 'hair-tp-clinic');
  });
});

test('T-011: x-tenant-id header kan inte välja tenant', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { customerId: 'c1', body: 'hej' },
      extraHeaders: { 'x-tenant-id': 'curatiio' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.draft.tenantId, 'hair-tp-clinic');
  });
});

test('T-012: samma customerId i två tenants hålls isolerad via listByStatus', async () => {
  await withServer(async (baseUrl) => {
    // Skapa draft med samma customerId i båda tenants.
    await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { customerId: 'shared-1', body: 'ht' },
    });
    await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'curatiio',
      body: { customerId: 'shared-1', body: 'cu' },
    });
    // Lista per tenant (listByStatus) ska bara visa den egna tenanten.
    const ht = await call(baseUrl, 'GET', '/cco-comm/drafts?status=draft', { tenant: 'hair-tp-clinic' });
    const cu = await call(baseUrl, 'GET', '/cco-comm/drafts?status=draft', { tenant: 'curatiio' });
    assert.equal(ht.status, 200);
    assert.equal(cu.status, 200);
    assert.equal(ht.json.drafts.length, 1);
    assert.equal(cu.json.drafts.length, 1);
    assert.equal(ht.json.drafts[0].tenantId, 'hair-tp-clinic');
    assert.equal(cu.json.drafts[0].tenantId, 'curatiio');
  });
});

test('T-016: generate-reply med främmande body tenantId → 403 före gateway', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts/generate-reply', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'curatiio', customerId: 'c1' },
    });
    assert.equal(res.status, 403);
  });
});

test('T-017: nekat utkast → ingen draft persisteras', async () => {
  await withServer(async (baseUrl) => {
    const denied = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'curatiio', customerId: 'c1', body: 'hej' },
    });
    assert.equal(denied.status, 403);
    const list = await call(baseUrl, 'GET', '/cco-comm/drafts?status=draft', { tenant: 'hair-tp-clinic' });
    assert.equal(list.json.drafts.length, 0);
  });
});

test('T-018: legitimt same-tenant utkast fungerar fortfarande', async () => {
  await withServer(async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'hair-tp-clinic', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.draft.tenantId, 'hair-tp-clinic');
  });
});

test('T-024: alias-skrivning persisterar canonical tenant (reload bevarar)', async () => {
  await withServer(async (baseUrl, tempDir) => {
    const res = await call(baseUrl, 'POST', '/cco-comm/drafts', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'hair_tp', customerId: 'c1', body: 'hej' },
    });
    assert.equal(res.status, 201);
    const draftId = res.json.draft.draftId;
    // Återöppna store mot samma fil — tenanten ska vara canonical, inte raw alias.
    const store = await createCcoCommDraftStore({
      filePath: path.join(tempDir, 'cco-comm-draft.json'),
    });
    const reloaded = store.getDraft(draftId, { tenantId: 'hair-tp-clinic' });
    assert.ok(reloaded, 'draft ska finnas under canonical tenant efter reload');
    assert.equal(reloaded.tenantId, 'hair-tp-clinic');
    // Under raw alias får den inte finnas.
    assert.equal(store.getDraft(draftId, { tenantId: 'hair_tp' }), null);
  });
});
