const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const { createCapabilitiesRouter } = require('../../src/routes/capabilities');
const { createExecutionGateway } = require('../../src/gateway/executionGateway');
const { createAuthStore } = require('../../src/security/authStore');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createMockAuth(role = 'OWNER') {
  function requireAuth(req, _res, next) {
    req.auth = { tenantId: 'tenant-a', userId: 'owner-a', role };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

test('CMO analytics mode returns read-only brief without production output', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cmo-analytics-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const analysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
    maxEntries: 2000,
  });

  const app = express();
  app.use(express.json());
  const auth = createMockAuth('OWNER');
  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return { brand: { displayName: 'Arcana Test' }, riskSensitivityModifier: 0 };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: { async listTemplates() { return []; } },
    })
  );

  const fetchedAt = new Date().toISOString();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/CMO/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'admin',
        input: { mode: 'analytics', period: 'weekly' },
        systemStateSnapshot: {
          marketingPerformance: {
            channels: {
              meta: {
                source: 'meta',
                window: '7d',
                fetchedAt,
                fresh: true,
                metrics: {
                  ctr: { value: 0.02, source: 'meta', window: '7d', fetchedAt, fresh: true },
                  cpc: { value: 1.5, source: 'meta', window: '7d', fetchedAt, fresh: true },
                },
                spend: { value: 800, source: 'meta', window: '7d', fetchedAt, fresh: true },
              },
            },
          },
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const data = payload.output?.data || {};
    assert.equal(data.outputType, 'MarketingAnalytics');
    assert.equal(data.mode, 'analytics');
    assert.equal(data.readOnly, true);
    assert.equal(data.performanceSummary.status, 'ok');
    assert.ok(data.marketingBrief);
    assert.equal(Array.isArray(data.campaigns), false);
  });
});

test('CMO analytics mode without data returns insufficient_data recommendation', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cmo-analytics-empty-'));
  const authStore = await createAuthStore({
    filePath: path.join(tempDir, 'auth.json'),
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  const analysisStore = await createCapabilityAnalysisStore({
    filePath: path.join(tempDir, 'capability-analysis.json'),
    maxEntries: 2000,
  });

  const app = express();
  app.use(express.json());
  const auth = createMockAuth('OWNER');
  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return { riskSensitivityModifier: 0 };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: { async listTemplates() { return []; } },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/CMO/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        channel: 'admin',
        input: { mode: 'analytics', period: 'weekly' },
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const data = payload.output?.data || {};
    assert.equal(data.performanceSummary.status, 'insufficient_data');
    assert.match(data.recommendation, /insufficient_data/);
  });
});
