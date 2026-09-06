'use strict';

/**
 * P1-005 — Remaining Client-Controlled Tenant Override · OPS.
 *
 * Route-nivå-tester (adversarial) som falsifierar client-first tenant på de
 * fyra OPS-ytorna med samma rotorsak:
 *   - GET  /ops/cco/enrichment/backfill/plan          (read,  query tenant)
 *   - POST /ops/cco/enrichment/backfill/run           (write, body  tenant)
 *   - POST /ops/readiness/remediate-owner-mfa-memberships (write, body tenant)
 *   - POST /ops/digest/send                           (write, body  tenant)
 *
 * En client-styrd tenant som canonicaliserar till en främmande tenant ger 403
 * INNAN någon read/write. Header-tenant är aldrig auktoritet.
 *
 * T-003/T-004/T-006, T-009, T-010, T-011, T-013, T-014, T-015.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const { createOpsRouter } = require('../../src/routes/ops');

function makeAuth() {
  return {
    requireAuth: (req, _res, next) => {
      req.auth = {
        userId: req.headers['x-user'] || 'u1',
        tenantId: req.headers['x-tenant'] || 'hair-tp-clinic',
        // ops.js använder requireRole(ROLE_OWNER, ROLE_STAFF) med RAW-roller
        // ('OWNER'), inte normaliserade — matcha det exakt.
        role: req.headers['x-role'] || 'OWNER',
      };
      return next();
    },
    requireRole:
      (...allowed) =>
      (req, _res, next) => {
        if (allowed.includes(req.auth?.role)) return next();
        return _res.status(403).json({ error: 'forbidden' });
      },
  };
}

async function withServer(stores, run) {
  const auth = makeAuth();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createOpsRouter({
      config: { defaultTenantId: 'hair-tp-clinic', stateRoot: '/tmp/nonexistent' },
      authStore: {
        addAuditEvent: async () => {},
        listTenantMembers: async () => [],
        updateMembership: async () => ({ status: 'disabled' }),
        revokeSessionsByMembership: async () => 0,
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      ...stores,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function call(baseUrl, method, route, { tenant, body, extraHeaders = {} } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': 'OWNER', ...extraHeaders };
  if (tenant) headers['x-tenant'] = tenant;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

test('T-013: OPS foreign read (backfill/plan query tenantId=curatiio) → 403', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(baseUrl, 'GET', '/ops/cco/enrichment/backfill/plan?tenantId=curatiio', {
      tenant: 'hair-tp-clinic',
    });
    assert.equal(res.status, 403);
  });
});

test('T-014: OPS foreign write (backfill/run body tenantId=curatiio) → 403 + zero mutation', async () => {
  let runJobCalls = 0;
  await withServer(
    { scheduler: { runJob: async () => { runJobCalls += 1; } } },
    async (baseUrl) => {
      const res = await call(baseUrl, 'POST', '/ops/cco/enrichment/backfill/run', {
        tenant: 'hair-tp-clinic',
        body: { tenantId: 'curatiio', phase: 'run', go: true },
      });
      assert.equal(res.status, 403);
      assert.equal(runJobCalls, 0, 'scheduler.runJob får inte anropas vid nekat tenant-scope');
    }
  );
});

test('T-015: remediate-owner-mfa foreign body tenant → 403', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(baseUrl, 'POST', '/ops/readiness/remediate-owner-mfa-memberships', {
      tenant: 'hair-tp-clinic',
      body: { tenantId: 'curatiio', dryRun: true },
    });
    assert.equal(res.status, 403);
  });
});

test('T-015: digest/send foreign body tenant → 403', async () => {
  await withServer(
    { tenantConfigStore: { getTenantConfig: async () => ({}) }, graphSendConnector: {} },
    async (baseUrl) => {
      const res = await call(baseUrl, 'POST', '/ops/digest/send', {
        tenant: 'hair-tp-clinic',
        body: { tenantId: 'curatiio', dryRun: true },
      });
      assert.equal(res.status, 403);
    }
  );
});

test('T-006: matching alias (backfill/plan query tenantId=hairtpclinic) är INTE 403', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(
      baseUrl,
      'GET',
      '/ops/cco/enrichment/backfill/plan?tenantId=hairtpclinic',
      { tenant: 'hair-tp-clinic' }
    );
    // Alias passar tenant-assertionen → ingen 403 (sedan 503 pga. saknade stores).
    assert.notEqual(res.status, 403);
  });
});

test('T-009: body+query-konflikt kan inte välja främmande tenant → 403', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(
      baseUrl,
      'POST',
      '/ops/cco/enrichment/backfill/run?tenantId=hair-tp-clinic',
      {
        tenant: 'hair-tp-clinic',
        body: { tenantId: 'curatiio', phase: 'run', go: false },
      }
    );
    assert.equal(res.status, 403);
  });
});

test('T-010: x-cco-tenant header kan inte välja tenant (backfill/plan)', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(baseUrl, 'GET', '/ops/cco/enrichment/backfill/plan', {
      tenant: 'hair-tp-clinic',
      extraHeaders: { 'x-cco-tenant': 'curatiio' },
    });
    assert.notEqual(res.status, 403);
  });
});

test('T-011: x-tenant-id header kan inte välja tenant (backfill/plan)', async () => {
  await withServer({}, async (baseUrl) => {
    const res = await call(baseUrl, 'GET', '/ops/cco/enrichment/backfill/plan', {
      tenant: 'hair-tp-clinic',
      extraHeaders: { 'x-tenant-id': 'curatiio' },
    });
    assert.notEqual(res.status, 403);
  });
});
