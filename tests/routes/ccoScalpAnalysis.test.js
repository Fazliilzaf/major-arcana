'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoScalpAnalysisRouter } = require('../../src/routes/ccoScalpAnalysis');
const { createCcoScalpAnalysisStore } = require('../../src/ops/ccoScalpAnalysisStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createSecureStorageProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { attachRole } = require('../../src/security/ccoRbac');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scalp-route-'));
  const scalpStore = await createCcoScalpAnalysisStore({
    filePath: path.join(dir, 'scalp.json'),
  });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'assets.json'),
  });
  const secureStorage = createSecureStorageProvider({
    provider: 'local',
    rootPath: path.join(dir, 'storage'),
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoScalpAnalysisRouter({
      resolveStores: () => ({ scalpStore, assetStore, secureStorage }),
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: { defaultTenantId: 'hairtpclinic' },
      attachRole,
    })
  );
  return { app, scalpStore };
}

test('POST session + GET patient bundle', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/cco/scalp-analysis/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cco-role': 'operator',
      },
      body: JSON.stringify({ patientId: 'pat-route-1', sessionType: 'consultation' }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.session?.id);

    const listRes = await fetch(`${baseUrl}/cco/scalp-analysis/patient/pat-route-1`, {
      headers: { 'x-cco-role': 'operator' },
    });
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.equal(list.sessions.length, 1);
  });
});
