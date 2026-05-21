const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createOrchestratorRouter } = require('../../src/routes/orchestrator');

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

function createMockAuth() {
  function requireAuth(req, _res, next) {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'owner-a',
      role: 'OWNER',
    };
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

test('orchestrator admin-run goes through gateway and blocks unsafe responses', async () => {
  let gatewayCalls = 0;

  const app = express();
  app.use(express.json());
  const auth = createMockAuth();
  app.use(
    '/api/v1',
    createOrchestratorRouter({
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            riskSensitivityModifier: 0,
            riskThresholdVersion: 1,
          };
        },
      },
      authStore: {
        async addAuditEvent() {
          return true;
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: {
        async run({ context }) {
          gatewayCalls += 1;
          assert.equal(context.channel, 'admin');
          assert.equal(context.intent, 'orchestrator.admin_run');
          return {
            decision: 'blocked',
            safe_response: {
              error: 'blocked_by_policy',
            },
            policy_summary: {
              blocked: true,
              reason_codes: ['NO_DIAGNOSIS_POLICY'],
            },
            risk_summary: {
              input: null,
              output: null,
              versions: {
                ruleSet: 'rules.v1',
                threshold: 'threshold.v1',
                model: 'semantic.heuristic.v1',
                fusion: 'fusion.weighted.v1',
                build: 'test',
              },
            },
          };
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/orchestrator/admin-run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Generate unsafe advice',
      }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error, 'blocked_by_policy');
  });

  assert.equal(gatewayCalls, 1);
});

test('orchestrator admin-run returns gateway response payload on allow', async () => {
  const app = express();
  app.use(express.json());
  const auth = createMockAuth();
  app.use(
    '/api/v1',
    createOrchestratorRouter({
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            riskSensitivityModifier: 0,
            riskThresholdVersion: 1,
          };
        },
      },
      authStore: {
        async addAuditEvent() {
          return true;
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: {
        async run() {
          return {
            decision: 'allow',
            response_payload: {
              intent: 'general_admin',
              confidence: 0.8,
              output: {
                text: 'safe',
                risk: {
                  riskLevel: 1,
                },
              },
              runtime: {
                id: 'admin-runtime.v1',
                domain: 'admin',
              },
            },
          };
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/orchestrator/admin-run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Summarize open incidents',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.intent, 'general_admin');
    assert.equal(payload.runtime.id, 'admin-runtime.v1');
  });
});

test('orchestrator admin-run execute mode runs through gateway with audit metadata', async () => {
  const auditEvents = [];
  const agentCalls = [];

  const app = express();
  app.use(express.json());
  const auth = createMockAuth();
  app.use(
    '/api/v1',
    createOrchestratorRouter({
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            riskSensitivityModifier: 0,
            riskThresholdVersion: 1,
          };
        },
      },
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: require('../../src/gateway/executionGateway').createExecutionGateway({
        buildVersion: 'test-build',
      }),
      capabilityExecutor: {
        async runAgent(payload) {
          agentCalls.push(payload);
          return {
            gatewayResult: { decision: 'allow' },
            output: { data: { executiveSummary: 'CAO execute ok' } },
          };
        },
        async runCapability(payload) {
          return {
            gatewayResult: { decision: 'allow' },
            output: { data: { summary: 'capability ok' } },
          };
        },
      },
      templateStore: {
        async listTemplates() {
          return [];
        },
      },
      adminTasksStore: {
        async listTasks() {
          return [];
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/orchestrator/admin-run?mode=execute`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-orchestrator-exec-1',
        },
        body: JSON.stringify({
          prompt: 'Granska mallbibliotek och template disclaimers för konsultation',
        }),
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mode, 'execute');
    assert.ok(Array.isArray(payload.executedSteps));
    assert.ok(payload.executedSteps.length >= 1);
    assert.ok(payload.executedSteps.some((step) => step.step === 'cao_admin_operator_run'));

    const successAudit = auditEvents.find(
      (event) => event.action === 'orchestrator.admin_run' && event.outcome === 'success'
    );
    assert.ok(successAudit);
    assert.equal(successAudit.metadata.correlationId, 'corr-orchestrator-exec-1');
    assert.ok(Array.isArray(successAudit.metadata.executedSteps));
    assert.ok(successAudit.metadata.executedSteps.length >= 1);
  });

  assert.equal(agentCalls.length, 1);
  assert.equal(agentCalls[0].agentName, 'CAO');
  assert.equal(agentCalls[0].correlationId, 'corr-orchestrator-exec-1');
});

test('orchestrator admin-run execute mode runs CMO for marketing_campaign intent', async () => {
  const auditEvents = [];
  const agentCalls = [];

  const app = express();
  app.use(express.json());
  const auth = createMockAuth();
  app.use(
    '/api/v1',
    createOrchestratorRouter({
      tenantConfigStore: {
        async getTenantConfig() {
          return {
            riskSensitivityModifier: 0,
            riskThresholdVersion: 1,
          };
        },
      },
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      requireAuth: auth.requireAuth,
      requireRole: auth.requireRole,
      executionGateway: require('../../src/gateway/executionGateway').createExecutionGateway({
        buildVersion: 'test-build',
      }),
      capabilityExecutor: {
        async runAgent(payload) {
          agentCalls.push(payload);
          return {
            gatewayResult: { decision: 'allow' },
            output: { data: { executiveSummary: 'CMO marketing copilot ok' } },
          };
        },
        async runCapability(payload) {
          return {
            gatewayResult: { decision: 'allow' },
            output: { data: { summary: 'capability ok' } },
          };
        },
      },
      templateStore: {
        async listTemplates() {
          return [];
        },
      },
      adminTasksStore: {
        async listTasks() {
          return [];
        },
      },
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/orchestrator/admin-run?mode=execute`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': 'corr-orchestrator-cmo-1',
        },
        body: JSON.stringify({
          prompt: 'Planera Q2 marketing campaign med UTM och publicering',
        }),
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.intent, 'marketing_campaign');
    assert.ok(payload.executedSteps.some((step) => step.step === 'cmo_marketing_copilot_run'));
  });

  assert.equal(agentCalls.length, 1);
  assert.equal(agentCalls[0].agentName, 'CMO');
  assert.equal(agentCalls[0].input.orchestratorIntent, 'marketing_campaign');
  assert.equal(agentCalls[0].correlationId, 'corr-orchestrator-cmo-1');
});
