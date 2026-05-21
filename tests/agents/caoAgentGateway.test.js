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
const { createAdminTasksStore } = require('../../src/ops/adminTasksStore');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
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

function createMockAuth(role = 'OWNER') {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role,
    };
    next();
  }
  function requireRole(...roles) {
    const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
    return (req, res, next) => {
      if (!allowed.has(String(req.auth?.role || '').toUpperCase())) {
        return res.status(403).json({ error: 'Du saknar behorighet for detta.' });
      }
      return next();
    };
  }
  return { requireAuth, requireRole };
}

test('CAO agent run aggregates template + admin ops capabilities', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cao-agent-'));
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
  const adminTasksStore = await createAdminTasksStore({
    filePath: path.join(tempDir, 'admin-tasks.json'),
  });
  await adminTasksStore.upsertTask({
    id: 'task-1',
    tenantId: 'tenant-a',
    title: 'Saknar ägare',
    owner: '',
    status: 'open',
    dod: 'Klar',
    nextStep: '',
  });
  await adminTasksStore.upsertTask({
    id: 'task-2',
    tenantId: 'tenant-a',
    title: 'OK uppgift',
    owner: 'OWNER',
    status: 'open',
    dod: 'Klar',
    nextStep: 'Nästa',
  });

  const app = express();
  app.use(express.json());
  const auth = createMockAuth('OWNER');
  const templateStore = {
    async listTemplates() {
      return [
        {
          id: 'tpl-1',
          name: 'Konsult mall',
          category: 'CONSULTATION',
          state: 'draft',
          updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ];
    },
    async getTemplateMeta() {
      return { variableWhitelist: { CONSULTATION: ['patient_name'] } };
    },
    async getRiskSummary() {
      return { totals: { open: 0 } };
    },
  };

  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return { riskSensitivityModifier: 0, riskThresholdVersion: 1 };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore,
      adminTasksStore,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/CAO/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-cao-1',
        'x-idempotency-key': 'idem-cao-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: { maxSuggestions: 3, strictDisclaimers: false },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent.name, 'CAO');
    assert.equal(payload.decision, 'allow');
    assert.equal(typeof payload.output?.data?.executiveSummary, 'string');
    assert.equal(typeof payload.output?.data?.templateLibraryHealth?.healthScore, 'number');
    assert.equal(payload.output?.data?.adminQualityGate?.gatePassed, false);
    assert.equal(payload.output?.data?.adminQualityGate?.missingOwner >= 1, true);
    assert.equal(payload.output?.metadata?.operatorLabel, 'Arcana Admin Operator');
  });

  const caoEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'CAO.AdminOperator',
    limit: 5,
  });
  assert.equal(caoEntries.length, 1);

  const libraryEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AssessTemplateLibraryHealth',
    limit: 5,
  });
  const gateEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'AssessAdminQualityGate',
    limit: 5,
  });
  assert.equal(libraryEntries.length, 1);
  assert.equal(gateEntries.length, 1);
});
