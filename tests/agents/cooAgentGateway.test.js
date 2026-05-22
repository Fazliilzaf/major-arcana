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

test('COO agent run aggregates SummarizeIncidents + GenerateTaskPlan and persists analysis only', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-coo-agent-'));
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
  let writeCalls = 0;
  const templateStore = {
    async listEvaluations() {
      return [
        {
          id: 'rev-1',
          tenantId: 'tenant-a',
          templateId: 'tpl-1',
          templateVersionId: 'v1',
          category: 'CONSULTATION',
          decision: 'blocked',
          ownerDecision: 'pending',
          riskLevel: 5,
          riskScore: 95,
          reasonCodes: ['DISCLOSURE_MISSING'],
          evaluatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    },
    async listIncidents() {
      return [
        {
          id: 'inc-1',
          category: 'CONSULTATION',
          reasonCodes: ['DISCLOSURE_MISSING'],
          severity: 'L5',
          riskLevel: 5,
          status: 'open',
          ownerDecision: 'pending',
          updatedAt: new Date().toISOString(),
          sla: { state: 'critical', breached: false },
        },
      ];
    },
    async summarizeRisk() {
      return { totals: { highCriticalOpen: 1 } };
    },
    async summarizeIncidents() {
      return { totals: { openUnresolved: 1 }, bySlaState: { critical: 1 }, generatedAt: new Date().toISOString() };
    },
    async listTemplates() {
      return [{ id: 'tpl-1', name: 'Template 1', category: 'CONSULTATION', updatedAt: new Date().toISOString() }];
    },
    async listActiveVersionSnapshots() {
      return [{ templateId: 'tpl-1', versionId: 'v1' }];
    },
    async createTemplateVersion() {
      writeCalls += 1;
      throw new Error('createTemplateVersion should not be called by COO agent');
    },
    async updateTemplateVersion() {
      writeCalls += 1;
      throw new Error('updateTemplateVersion should not be called by COO agent');
    },
  };
  app.use(
    '/api/v1',
    createCapabilitiesRouter({
      authStore,
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            riskSensitivityModifier: 0,
            riskThresholdVersion: 1,
          };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/COO/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-coo-1',
        'x-idempotency-key': 'idem-coo-1',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: false,
          timeframeDays: 14,
          maxTasks: 5,
          includeEvidence: true,
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.agent.name, 'COO');
    assert.equal(payload.agent.persistStrategy, 'analysis');
    assert.equal(payload.decision, 'allow');
    assert.equal(typeof payload.output?.data?.executiveSummary, 'string');
    assert.equal(
      ['Low', 'Medium', 'High'].includes(String(payload.output?.data?.priorityLevel || '')),
      true
    );
    assert.equal(payload.output?.data?.taskPlan?.tasks?.length <= 5, true);
    assert.equal(typeof payload.output?.data?.incidentSummary?.severityBreakdown, 'object');
  });

  const audits = await authStore.listAuditEvents({
    tenantId: 'tenant-a',
    limit: 250,
  });
  const actions = new Set(audits.map((item) => item.action));
  assert.equal(actions.has('agent.run.start'), true);
  assert.equal(actions.has('agent.run.complete'), true);
  assert.equal(actions.has('capability.run.start'), true);
  assert.equal(actions.has('gateway.run.start'), true);
  assert.equal(actions.has('gateway.run.response'), true);

  const cooEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'COO.DailyBrief',
    limit: 20,
  });
  assert.equal(cooEntries.length, 1);
  assert.equal(cooEntries[0].capability.name, 'COO.DailyBrief');
  assert.equal(cooEntries[0].capability.persistStrategy, 'analysis');
  assert.equal(cooEntries[0].metadata?.agentName, 'COO');
  assert.equal(writeCalls, 0);

  const summarizeEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'SummarizeIncidents',
    limit: 20,
  });
  const taskPlanEntries = await analysisStore.list({
    tenantId: 'tenant-a',
    capabilityName: 'GenerateTaskPlan',
    limit: 20,
  });
  assert.equal(summarizeEntries.length, 1);
  assert.equal(taskPlanEntries.length, 1);
});

test('COO agent run enforces output risk + policy before response', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-coo-agent-enforce-'));
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
          return {
            riskSensitivityModifier: 2,
            riskThresholdVersion: 2,
          };
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: createExecutionGateway({ buildVersion: 'test-build' }),
      capabilityAnalysisStore: analysisStore,
      templateStore: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/agents/COO/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'admin',
        input: {
          includeClosed: true,
          timeframeDays: 30,
          maxTasks: 5,
        },
        systemStateSnapshot: {
          incidents: [
            {
              id: 'inc-1',
              category: 'CONSULTATION',
              reasonCodes: ['GUARANTEE_LANGUAGE', 'DIAGNOSIS_TONE'],
              severity: 'L5',
              riskLevel: 5,
              status: 'open',
              ownerDecision: 'pending',
              updatedAt: new Date().toISOString(),
              sla: { state: 'breached', breached: true },
            },
          ],
          openReviews: [{ id: 'rev-1', riskLevel: 5, decision: 'blocked' }],
          latestTemplateChanges: [{ templateId: 'tpl-1', updatedAt: '2026-02-01T10:00:00.000Z' }],
          kpi: { highCriticalOpenReviews: 1, sloBreaches: 1, openUnresolvedIncidents: 1 },
          timestamps: { capturedAt: new Date().toISOString() },
        },
      }),
    });

    assert.equal([200, 403].includes(response.status), true);
    const payload = await response.json();
    if (response.status === 200) {
      assert.equal(Boolean(payload.riskSummary?.output?.decision), true);
      assert.equal(Boolean(payload.riskSummary?.output?.versions?.ruleSetVersion), true);
      assert.equal(Boolean(payload.policySummary), true);
      assert.equal(payload.output?.data?.taskPlan?.tasks?.length <= 5, true);
      return;
    }
    assert.equal(typeof payload.error, 'string');
    assert.equal(payload.error.length > 0, true);
  });
});
