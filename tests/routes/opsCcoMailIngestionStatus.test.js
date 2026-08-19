'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const { createOpsRouter } = require('../../src/routes/ops');
const { ROLE_OWNER, ROLE_STAFF } = require('../../src/security/roles');

function makeAuth({ role = ROLE_OWNER } = {}) {
  return {
    requireAuth: (req, res, next) => {
      req.auth = { userId: 'test-user', tenantId: 'test-tenant', role };
      return next();
    },
    requireRole:
      (...allowed) =>
      (req, res, next) => {
        if (allowed.includes(req.auth?.role)) return next();
        return res.status(403).json({ error: 'forbidden' });
      },
  };
}

function makeAuthStore() {
  return {
    addAuditEvent: async () => {},
  };
}

function makeStore({ failMethods = false } = {}) {
  if (failMethods) {
    return {
      listQueuedMailboxCounts: undefined,
      buildDashboardSummary: undefined,
    };
  }
  return {
    listQueuedMailboxCounts: () =>
      new Map([
        ['egzona@hairtpclinic.com', 7129],
        ['info@fazli.se', 29],
      ]),
    buildDashboardSummary: () => ({
      counts: {
        rawMessages: 8814,
        matched: 309,
        unmatched: 516,
        duplicates: 1703,
        queued: 7158,
        processed: 1656,
        failed: 0,
        needsReview: 0,
      },
      versions: {
        processorVersion: 'P1',
        filterVersion: 'F1',
        matchVersion: 'M1',
      },
    }),
  };
}

async function withServer({ role, store, runtimeState }, run) {
  const auth = makeAuth({ role });
  const app = express();
  app.use(
    '/api/v1',
    createOpsRouter({
      config: {
        ccoMailIngestionEnabled: true,
        ccoMailIngestionMode: 'read_only',
      },
      authStore: makeAuthStore(),
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      ccoMailIngestionStore: store,
      runtimeState,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /ops/cco/mail-ingestion/status som owner returnerar kö och räknare', async () => {
  const runtimeState = {
    startupDiskGuard: {
      reclaimedBytes: 123,
      backupDeletedCount: 0,
      retainableBackups: { enabled: true, dryRun: false },
    },
  };
  await withServer({ role: ROLE_OWNER, store: makeStore(), runtimeState }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ops/cco/mail-ingestion/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.mailIngestion.enabled, true);
    assert.equal(body.mailIngestion.mode, 'read_only');
    assert.equal(body.mailIngestion.queueTotal, 7158);
    assert.deepEqual(body.mailIngestion.queueByMailbox, {
      'egzona@hairtpclinic.com': 7129,
      'info@fazli.se': 29,
    });
    assert.equal(body.mailIngestion.counts.matched, 309);
    assert.equal(body.mailIngestion.counts.queued, 7158);
    assert.equal(body.startupDiskGuard.reclaimedBytes, 123);
    assert.equal(body.startupDiskGuard.retainableBackups.enabled, true);
  });
});

test('GET /ops/cco/mail-ingestion/status som staff nekas', async () => {
  await withServer({ role: ROLE_STAFF, store: makeStore(), runtimeState: {} }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ops/cco/mail-ingestion/status`);
    assert.equal(res.status, 403);
  });
});

test('GET /ops/cco/mail-ingestion/status utan store returnerar 503', async () => {
  await withServer({ role: ROLE_OWNER, store: null, runtimeState: {} }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/ops/cco/mail-ingestion/status`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /ccoMailIngestionStore saknas/);
  });
});

test('GET /ops/cco/mail-ingestion/status utan metoder klarar sig', async () => {
  await withServer(
    { role: ROLE_OWNER, store: makeStore({ failMethods: true }), runtimeState: {} },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/ops/cco/mail-ingestion/status`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.mailIngestion.queueTotal, 0);
      assert.equal(body.mailIngestion.counts, null);
    }
  );
});
