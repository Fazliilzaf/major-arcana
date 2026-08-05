'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');
const { createMarketingWeeklyReportsStore } = require('../../src/ops/marketingWeeklyReportsStore');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

async function withTempFileStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-routes-'));
  const filePath = path.join(dir, 'reports.json');
  try {
    const store = createMarketingWeeklyReportsStore({ filePath });
    await run(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function createTestApp(store) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createMarketingWorkspaceRouter({
      authStore: {},
      marketingCampaignDraftsStore: null,
      marketingWeeklyReportsStore: store,
      config: {
        marketingConnectorsEnabled: true,
        marketingConnectorsMode: 'fixture',
        marketingConnectors: {
          gsc: { enabled: true, mode: 'fixture' },
          google_ads: { enabled: true, mode: 'fixture' },
          meta: { enabled: false },
          linkedin: { enabled: false },
          mail: { enabled: false },
        },
      },
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'hair-tp-clinic', userId: 'tester', role: 'OWNER' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    })
  );
  return app;
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('GET /marketing/weekly-reports returns empty list', async () => {
  await withTempFileStore(async (store) => {
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.items.length, 0);
      assert.equal(body.summary.total, 0);
    });
  });
});

test('POST /marketing/weekly-reports creates a report', async () => {
  await withTempFileStore(async (store) => {
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'hair-tp-clinic',
          brand: 'hairtpclinic',
          week: '2026-W32',
        }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.item.brand, 'hairtpclinic');
      assert.equal(body.item.week, '2026-W32');
      assert.equal(body.item.status, 'draft');
      assert.ok(body.item.id);
    });
  });
});

test('GET /marketing/weekly-reports/:id returns stored report', async () => {
  await withTempFileStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports/${created.id}`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.item.id, created.id);
      assert.equal(body.item.week, '2026-W32');
    });
  });
});

test('POST /marketing/weekly-reports/:id/generate fills fixture data', async () => {
  await withTempFileStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports/${created.id}/generate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: ['gsc', 'google_ads'] }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.generated, true);
      assert.ok(body.item.summary.includes('2026-W32'));
      assert.ok(body.item.sections.kpi.gsc.clicks != null);
      assert.ok(body.item.sections.kpi.google_ads.clicks != null);
    });
  });
});

test('PATCH /marketing/weekly-reports/:id updates status', async () => {
  await withTempFileStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports/${created.id}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'final' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.item.status, 'final');
    });
  });
});

test('DELETE /marketing/weekly-reports/:id removes report', async () => {
  await withTempFileStore(async (store) => {
    const created = await store.upsertReport({
      tenantId: 'hair-tp-clinic',
      brand: 'hairtpclinic',
      week: '2026-W32',
    });
    const app = createTestApp(store);
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/marketing/weekly-reports/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.deleted, true);
      assert.equal(body.item.id, created.id);

      const getResponse = await fetch(`${baseUrl}/marketing/weekly-reports/${created.id}`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      assert.equal(getResponse.status, 404);
    });
  });
});
